// Manual smoke for the review room (phase 3). Same setup as smoke-letter.mjs:
//   BASE_URL=http://localhost:3100 SERVER_LOG=/tmp/al-web.log OUT_DIR=/tmp/shots node e2e/smoke-review.mjs
// The control manager marks an area on the PDF and comments; the advisor replies and resolves it.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { docxBytes, loginWith, pdfBytes } from "./helpers.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3217";
const log = process.env.SERVER_LOG ?? "/tmp/al-web.log";
const out = process.env.OUT_DIR ?? "./smoke-shots";
mkdirSync(out, { recursive: true });
const stamp = Date.now().toString().slice(-6);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const login = loginWith(browser, base, log);
const errors = [];

// 1. Control manager: season and letter request.
const cm = await login("control.manager@example.test");
cm.on("pageerror", (e) => errors.push(`cm: ${e.message}`));
await cm.goto(`${base}/seasons`);
await cm.getByLabel("שם העונה").fill(`בדיקת סקירה ${stamp}`);
await cm.click("button:has-text('צור עונה')");
await cm.waitForURL(/\/seasons\/[0-9a-f-]{36}$/);
await cm.click("summary:has-text('דרישת מכתב חדשה')");
const form = cm.locator("details:has(summary:has-text('דרישת מכתב חדשה'))");
await form.getByLabel("קמפוס").fill("רמת גן");
await form.getByLabel("פקולטה").fill("מנהל עסקים");
await form.getByLabel("שם המסלול").fill("מנהל עסקים (B.A)");
await form.getByLabel("מספר מסלול").fill(`8${stamp}`);
await form.getByLabel("יועצת בקרה").selectOption({ label: "יועצת בקרה 1 (דמו)" });
await form.getByLabel("גורם אקדמי 1 (דמו)").check();
await cm.click("button:has-text('צור דרישת מכתב')");
await cm.waitForURL(/\/letters\/[0-9a-f-]{36}$/);
const letterUrl = cm.url();
console.log("Letter:", letterUrl);

// 2. Advisor uploads version 1 and submits.
const adv = await login("advisor1@example.test");
adv.on("pageerror", (e) => errors.push(`advisor: ${e.message}`));
await adv.goto(letterUrl);
await adv.getByLabel("קובץ Word (DOCX)").setInputFiles({
  name: "letter.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: docxBytes(),
});
await adv.getByLabel("קובץ PDF").setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: await pdfBytes() });
await adv.click("button:has-text('העלה גרסה 1')");
await adv.waitForSelector(".alpr-scroller canvas");
await adv.click("button:has-text('שלח לבדיקה')");
await adv.waitForSelector("header >> text=בדיקה ראשונית");

// 3. Control manager marks an area on page 1 and writes a comment.
await cm.goto(letterUrl);
const canvas = cm.locator(".alpr-scroller canvas").first();
await canvas.waitFor();
await cm.waitForTimeout(500);
await cm.getByRole("button", { name: "סימון אזור להערה" }).click();
const box = await canvas.boundingBox();
await cm.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.05);
await cm.mouse.down();
await cm.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.12, { steps: 8 });
await cm.mouse.up();
const newComment = cm.locator("form[aria-label='הערה חדשה']");
await newComment.waitFor();
await newComment.getByLabel("מה צריך לתקן").fill("הכותרת צריכה לכלול את שם הקמפוס");
await cm.screenshot({ path: `${out}/review-draft.png`, fullPage: true });
await newComment.locator("button:has-text('הוסף הערה')").click();
await cm.locator("li[data-comment]").first().waitFor();
await newComment.waitFor({ state: "detached" });
console.log("Comment boxes on the PDF:", await cm.locator(".alpr-scroller [aria-label^='הערה']").count());
await cm.screenshot({ path: `${out}/review-commented.png`, fullPage: true });

// 4. Advisor sees it, replies, then marks it fixed in version 1.
await adv.goto(letterUrl);
const card = adv.locator("li[data-comment]").first();
await card.waitFor();
console.log("Advisor sees:", (await card.locator("p.whitespace-pre-wrap").first().textContent())?.trim());
await card.locator("summary:has-text('תגובה')").click();
await card.getByLabel("תגובה", { exact: true }).fill("תוקן בגרסה הבאה");
await card.locator("button:has-text('שלח תגובה')").click();
await card.locator("text=תוקן בגרסה הבאה").first().waitFor();
await card.locator("summary:has-text('סגירה או בקשת הבהרה')").click();
await card.getByLabel("סטטוס חדש").selectOption({ label: "טופלה" }).catch(async () => {
  const opts = await card.getByLabel("סטטוס חדש").locator("option").allTextContents();
  throw new Error(`status options: ${opts.join(", ")}`);
});
await card.locator("button:has-text('סמן כטופלה')").click();
await adv.locator("text=אין הערות פתוחות על הגרסה הזו").waitFor();
console.log("Resolved; list shows:", await adv.locator("button:has-text('הצג הערות שנסגרו')").textContent());
await adv.click("button:has-text('הצג הערות שנסגרו')");
await adv.locator("summary:has-text('מה היה מסומן')").click();
const img = adv.locator("img[alt^='האזור שסומן']");
await img.waitFor();
const width = await img.evaluate((el) =>
  el.complete && el.naturalWidth ? el.naturalWidth : new Promise((r) => ((el.onload = () => r(el.naturalWidth)), (el.onerror = () => r(0)))),
);
console.log("Snapshot image width:", width);
await adv.screenshot({ path: `${out}/review-resolved.png`, fullPage: true });

await adv.setViewportSize({ width: 400, height: 900 });
await adv.goto(letterUrl);
await adv.locator(".alpr-scroller canvas").first().waitFor();
await adv.screenshot({ path: `${out}/review-phone.png`, fullPage: true });
const overflow = await adv.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("Phone sideways overflow:", overflow);

console.log(errors.length ? `Page errors:\n${errors.join("\n")}` : "No page errors");
await browser.close();
