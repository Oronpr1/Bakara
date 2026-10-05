// Renders public/assets/icon.svg to the PNG sizes the manifest uses (16, 32, 64, 80).
// Run after changing the SVG: node scripts/icons.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dir = fileURLToPath(new URL("../public/assets/", import.meta.url));
const svg = await readFile(`${dir}icon.svg`, "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
try {
  for (const size of [16, 32, 64, 80]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: `${dir}icon-${size}.png`, omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
