// Shared pieces of the manual smoke scripts.
import { crc32 } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** A minimal DOCX-looking ZIP (stored entries, no compression). */
export function docxBytes() {
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

export async function pdfBytes() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) doc.addPage().drawText(`Acceptance letter smoke test, page ${i}`, { x: 50, y: 750, size: 16, font });
  return Buffer.from(await doc.save());
}

/** Signs in through the login form with the demo password from the seed. */
export function loginWith(browser, base, _log) {
  return async function login(email) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.fill("#email", email);
    await page.fill("#password", process.env.DEMO_PASSWORD ?? "demo-password-1");
    await page.click("button:has-text('כניסה')");
    await page.waitForURL(`${base}/`);
    return page;
  };
}
