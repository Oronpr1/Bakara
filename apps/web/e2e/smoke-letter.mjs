// Manual smoke for the phase 2 screens. Needs a running dev server whose log captures the
// login codes (SMTP_URL unset), e.g.:
//   STORAGE_DIR=/tmp/al-storage pnpm --filter @al/web exec next dev -p 3217 > /tmp/al-web.log 2>&1
//   BASE_URL=http://localhost:3217 SERVER_LOG=/tmp/al-web.log OUT_DIR=/tmp/shots node e2e/smoke-letter.mjs
// The control manager creates a season and a letter; the advisor uploads a version and submits it.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";

const base = process.env.BASE_URL ?? "http://localhost:3217";
const log = process.env.SERVER_LOG ?? "/tmp/al-web.log";
const out = process.env.OUT_DIR ?? "./smoke-shots";
mkdirSync(out, { recursive: true });
const stamp = Date.now().toString().slice(-6);

/** A minimal DOCX-looking ZIP (stored entries, no compression). */
function docxBytes() {
  const files = [
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ["word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'],
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

async function pdfBytes() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) doc.addPage().drawText(`Acceptance letter smoke test, page ${i}`, { x: 50, y: 750, size: 16, font });
  return Buffer.from(await doc.save());
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.click("button:has-text('שלחו לי קוד כניסה')");
  await page.waitForSelector("#code");
  await page.waitForTimeout(500);
  const re = new RegExp(`to=${email.replace(/\./g, "\\.")} subject=קוד הכניסה שלך: (\\d{6})`, "g");
  const code = [...readFileSync(log, "utf8").matchAll(re)].at(-1)?.[1];
  if (!code) throw new Error(`No login code for ${email} in ${log}`);
  await page.fill("#code", code);
  await page.click("button:has-text('כניסה')");
  await page.waitForURL(`${base}/`);
  return page;
}

async function shoot(page, url, name) {
  for (const width of [1280, 400]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) console.warn(`! ${name} at ${width}px scrolls sideways by ${overflow}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

// 1. Control manager: new season, new letter request.
const cm = await login("control.manager@example.test");
await cm.goto(`${base}/seasons`);
await cm.getByLabel("שם העונה").fill(`בדיקת עשן ${stamp}`);
await cm.click("button:has-text('צור עונה')");
await cm.waitForURL(/\/seasons\/[0-9a-f-]{36}$/);
const seasonUrl = cm.url();
await cm.click("summary:has-text('דרישת מכתב חדשה')");
const form = cm.locator("details:has(summary:has-text('דרישת מכתב חדשה'))");
await form.getByLabel("קמפוס").fill("קריית אונו");
await form.getByLabel("פקולטה").fill("משפטים");
await form.getByLabel("שם המסלול").fill('משפטים (LL.B) תשפ"ז');
await form.getByLabel("מספר מסלול").fill(`9${stamp}`);
await form.getByLabel("תאריך יעד").fill("2026-10-01");
await form.getByLabel("יועצת בקרה").selectOption({ label: "יועצת בקרה 1 (דמו)" });
await form.getByLabel("מנהל רישום").selectOption({ label: "מנהל רישום (דמו)" });
await form.getByLabel('סמנכ"ל רישום').selectOption({ label: 'סמנכ"ל רישום (דמו)' });
await form.getByLabel("גורם אקדמי 1 (דמו)").check();
await form.getByLabel("גורם אקדמי 2 (דמו)").check();
await cm.click("button:has-text('צור דרישת מכתב')");
await cm.waitForURL(/\/letters\/[0-9a-f-]{36}$/);
const letterUrl = cm.url();
console.log("Season:", seasonUrl, "\nLetter:", letterUrl);

// 2. Advisor: upload version 1 and submit it for review.
const adv = await login("advisor1@example.test");
await adv.goto(letterUrl);
await adv.getByLabel("קובץ Word (DOCX)").setInputFiles({
  name: "letter.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: docxBytes(),
});
await adv.getByLabel("קובץ PDF").setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: await pdfBytes() });
await adv.getByLabel("מה השתנה בגרסה (לא חובה)").fill("גרסה ראשונה לבדיקה");
await adv.click("button:has-text('העלה גרסה 1')");
await adv.waitForSelector("text=הורד Word");
await adv.click("button:has-text('שלח לבדיקה')");
await adv.waitForSelector("header >> text=בדיקה ראשונית");
console.log("Advisor submitted; stage is now בדיקה ראשונית");

// 3. Downloads: permission-checked, Hebrew file name, not cached.
const docxHref = await adv.getAttribute("a:has-text('הורד Word')", "href");
const res = await adv.request.get(`${base}${docxHref}`);
console.log("DOCX download:", res.status(), res.headers()["content-type"]);
console.log("  ", res.headers()["content-disposition"], "|", res.headers()["cache-control"]);
const outsider = await login("advisor2@example.test");
console.log("Other advisor gets:", (await outsider.request.get(`${base}${docxHref}`)).status(), "(expected 404)");

// 4. Control manager sends it to the registration round; the registration manager approves.
await cm.goto(letterUrl);
await cm.click("button:has-text('אשר לסבב')");
await cm.waitForSelector("header >> text=סבב רישום");
const rm = await login("registration@example.test");
await rm.goto(letterUrl);
await rm.click("button:has-text('אשר את גרסה 1')");
await rm.waitForSelector("text=אישר · גרסה 1");
console.log("Registration manager approved version 1");

// 5. A rejected form shows the server's Hebrew error next to it.
await cm.goto(seasonUrl);
await cm.click("summary:has-text('דרישת מכתב חדשה')");
await form.getByLabel("קמפוס").fill("קריית אונו");
await form.getByLabel("פקולטה").fill("משפטים");
await form.getByLabel("שם המסלול").fill("כפול");
await form.getByLabel("מספר מסלול").fill(`9${stamp}`);
await form.getByLabel("יועצת בקרה").selectOption({ label: "יועצת בקרה 1 (דמו)" });
await form.getByLabel("גורם אקדמי 1 (דמו)").check();
await cm.click("button:has-text('צור דרישת מכתב')");
const alert = form.locator("p[role=alert]");
await alert.waitFor();
console.log("Duplicate track error:", await alert.textContent());

// 6. Screenshots at desktop and phone width.
await shoot(adv, `${base}/`, "advisor-home");
await shoot(adv, seasonUrl, "advisor-season");
await shoot(adv, letterUrl, "advisor-letter");
await shoot(cm, `${base}/`, "cm-home");
await shoot(cm, seasonUrl, "cm-season");
await shoot(rm, `${base}/`, "rm-home");
await shoot(cm, letterUrl, "cm-letter");
await shoot(cm, `${letterUrl}?tab=history`, "cm-history");
await shoot(cm, `${base}/seasons`, "cm-seasons");
await shoot(cm, `${base}/admin/users`, "cm-users");
console.log("Screenshots in", out);
await browser.close();
