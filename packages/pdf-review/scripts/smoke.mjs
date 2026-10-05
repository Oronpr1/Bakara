// Headless smoke test of the demo: render, draw with mouse and touch, Escape,
// zoom and select-to-scroll. Needs a Playwright Chromium (PLAYWRIGHT_BROWSERS_PATH).
// Usage: node scripts/smoke.mjs [screenshot.png]
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const configFile = fileURLToPath(new URL("../demo/vite.config.ts", import.meta.url));
const server = await createServer({ configFile, server: { port: 0 }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(url);
  await page.waitForSelector('.alpr-page[data-page="1"] canvas[data-rendered]', { timeout: 20_000 });
  assert.equal(await page.locator(".alpr-page").count(), 2, "two pages laid out");
  assert.equal(await page.locator(".alpr-box").count(), 3, "all three demo comments drawn");
  const results = () => page.evaluate(() => window.__drawResults);

  // Mouse: drag from bottom-right to top-left.
  await page.getByRole("button", { name: "סימון אזור להערה" }).click();
  const overlay = page.locator('.alpr-page[data-page="1"] .alpr-overlay');
  const box = await overlay.boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  await page.mouse.move(...at(0.7, 0.4));
  await page.mouse.down();
  await page.mouse.move(...at(0.5, 0.35), { steps: 5 });
  await page.mouse.move(...at(0.2, 0.3), { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__drawResults.length === 1, null, { timeout: 10_000 });
  const [first] = await results();
  assert.equal(first.anchor.page, 1);
  assert.equal(first.anchor.versionNumber, 1);
  for (const [k, v] of Object.entries({ x: 0.2, y: 0.3, width: 0.5, height: 0.1 }))
    assert.ok(Math.abs(first.anchor[k] - v) < 0.01, `anchor.${k} ≈ ${v}, got ${first.anchor[k]}`);
  assert.equal(first.snapshotType, "image/png");
  assert.ok(first.snapshotSize > 500, `non-empty PNG (${first.snapshotSize} bytes)`);
  console.log("mouse draw:", first);

  // Escape cancels a drag in progress.
  await page.mouse.move(...at(0.1, 0.6));
  await page.mouse.down();
  await page.mouse.move(...at(0.4, 0.7), { steps: 4 });
  assert.equal(await page.locator(".alpr-draft").count(), 1, "rubber band visible while dragging");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal((await results()).length, 1, "Escape: no draw reported");
  assert.equal(await page.locator(".alpr-draft").count(), 0);

  // Touch (pointerType "touch"), top-left to bottom-right; draw mode is still on.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, [x, y]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", at(0.1, 0.6));
  for (let i = 1; i <= 5; i++) await touch("touchMove", at(0.1 + 0.06 * i, 0.6 + 0.02 * i));
  await touch("touchEnd", at(0.4, 0.7));
  await page.waitForFunction(() => window.__drawResults.length === 2, null, { timeout: 10_000 });
  const second = (await results())[1];
  assert.ok(Math.abs(second.anchor.x - 0.1) < 0.01 && Math.abs(second.anchor.width - 0.3) < 0.01, "touch anchor");
  console.log("touch draw:", second.anchor);

  // Escape with no drag leaves draw mode.
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "סימון אזור להערה" }).getAttribute("aria-pressed"), "false");

  // Zoom in changes the page size.
  const w0 = (await overlay.boundingBox()).width;
  await page.getByRole("button", { name: "הגדלה" }).click();
  await page.waitForTimeout(100);
  const w1 = (await overlay.boundingBox()).width;
  assert.ok(Math.abs(w1 / w0 - 1.2) < 0.02, `zoom in x1.2 (${w0} -> ${w1})`);

  // Selecting a page-2 comment scrolls it into view and the page renders.
  await page.getByRole("button", { name: /הערה 3/ }).first().click();
  await page.waitForSelector('.alpr-page[data-page="2"] canvas[data-rendered]', { timeout: 10_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-comment-id="c3"]')?.getBoundingClientRect();
    const sc = document.querySelector(".alpr-scroller")?.getBoundingClientRect();
    return el && sc && el.top >= sc.top && el.bottom <= sc.bottom;
  }, null, { timeout: 5_000 });

  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  assert.deepEqual(errors, [], "no page errors");
  console.log("smoke test passed");
} finally {
  await browser.close();
  await server.close();
}
