// Headless check of the demo in a real Chromium, desktop (1280) and phone (390,
// touch): boxes and stickers, draw by drag and by tap (mouse, touch), Escape,
// the magnifier (sharp, magnified, follows mouse and finger), zoom, scroll and
// page navigation.
//
// Uses the Playwright of the repository root (@playwright/test 1.63) and its
// Chromium; never a user profile, and the keychain is mocked so macOS shows no
// password prompt.
// Usage: node scripts/smoke.mjs [screenshot-dir]
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const shotsDir = process.argv[2];
if (shotsDir) await mkdir(shotsDir, { recursive: true });
const configFile = fileURLToPath(new URL("../demo/vite.config.ts", import.meta.url));
const server = await createServer({ configFile, server: { port: 0 }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-mock-keychain"] });

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: expected ≈${b}, got ${a}`);

async function open(ctxOpts, query = "") {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url + query);
  await page.waitForSelector('.alpr-page[data-page="1"] canvas[data-rendered]', { timeout: 20_000 });
  const shot = async (name) => shotsDir && page.screenshot({ path: `${shotsDir}/${name}.png` });
  const results = () => page.evaluate(() => window.__drawResults);
  const pageBox = (n) => page.locator(`.alpr-page[data-page="${n}"] .alpr-overlay`).boundingBox();
  const scrollTo = (fn) => page.evaluate(fn);
  return { ctx, page, errors, shot, results, pageBox, scrollTo };
}

/** Is the lens showing the same part of the page as the page's own bitmap, and is it sharper? */
function lensQuality() {
  const lens = document.querySelector(".alpr-lens");
  const cv = lens.querySelector("canvas");
  const lr = lens.getBoundingClientRect();
  const cx = lr.left + lr.width / 2;
  const cy = lr.top + lr.height / 2;
  const pageEl = [...document.querySelectorAll(".alpr-page")].find((p) => {
    const r = p.getBoundingClientRect();
    return cy >= r.top && cy <= r.bottom;
  });
  const pr = pageEl.getBoundingClientRect();
  const pc = pageEl.querySelector("canvas");
  const power = Number(lens.dataset.power);
  const k = pc.width / pr.width;
  const side = lr.width / power; // page px shown
  const src = { x: (cx - pr.left - side / 2) * k, y: (cy - pr.top - side / 2) * k, w: side * k, h: side * k };
  const D = cv.width;
  const read = (c, x, y, w, h) => c.getContext("2d").getImageData(x, y, w, h).data;
  const energy = (d, w, h) => {
    let e = 0;
    for (let y = 1; y < h; y++)
      for (let x = 1; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = d[i] + d[i + 1] + d[i + 2];
        e += Math.abs(l - (d[i - 4] + d[i - 3] + d[i - 2])) + Math.abs(l - (d[i - w * 4] + d[i - w * 4 + 1] + d[i - w * 4 + 2]));
      }
    return e / ((w - 1) * (h - 1));
  };
  // The page bitmap's crop, stretched to the lens: what a "zoomed screenshot" lens would show.
  const stretched = document.createElement("canvas");
  stretched.width = D;
  stretched.height = D;
  const sg = stretched.getContext("2d");
  sg.fillStyle = "#fff";
  sg.fillRect(0, 0, D, D);
  sg.imageSmoothingQuality = "high";
  sg.drawImage(pc, src.x, src.y, src.w, src.h, 0, 0, D, D);
  // The lens, shrunk back to the page bitmap's scale: must match the page there.
  const w = Math.max(1, Math.round(src.w));
  const h = Math.max(1, Math.round(src.h));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const smg = small.getContext("2d");
  smg.imageSmoothingQuality = "high";
  smg.drawImage(cv, 0, 0, D, D, 0, 0, w, h);
  const a = read(small, 0, 0, w, h);
  const b = read(pc, Math.round(src.x), Math.round(src.y), w, h);
  let diff = 0;
  let ink = 0;
  for (let i = 0; i < a.length; i += 4) {
    diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (b[i] < 160) ink++;
  }
  return {
    power,
    sharp: lens.dataset.sharp,
    lensEnergy: energy(read(cv, 0, 0, D, D), D, D),
    stretchedEnergy: energy(read(stretched, 0, 0, D, D), D, D),
    meanDiff: diff / (a.length / 4) / 3,
    ink: ink / (a.length / 4),
    lensPx: D,
  };
}

try {
  /* ================= desktop, box style (the original contract) ================= */
  {
    const { ctx, page, errors, results, pageBox } = await open({ viewport: { width: 1280, height: 900 }, hasTouch: true }, "?style=box");
    assert.equal(await page.locator(".alpr-page").count(), 2, "two pages laid out");
    assert.equal(await page.locator(".alpr-box").count(), 4, "all four demo comments drawn as boxes");
    assert.equal(await page.locator(".alpr-box[data-draft]").count(), 1, "the draft is marked");

    // Mouse: drag from bottom-right to top-left.
    await page.getByRole("button", { name: "סימון אזור להערה" }).click();
    const box = await pageBox(1);
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
      near(first.anchor[k], v, 0.01, `drag anchor.${k}`);
    assert.equal(first.snapshotType, "image/png");
    assert.ok(first.snapshotSize > 500, `non-empty PNG (${first.snapshotSize} bytes)`);

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

    // Touch drag (pointerType "touch"), top-left to bottom-right; draw mode is still on.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, [x, y]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", at(0.1, 0.6));
    for (let i = 1; i <= 5; i++) await touch("touchMove", at(0.1 + 0.06 * i, 0.6 + 0.02 * i));
    await touch("touchEnd", at(0.4, 0.7));
    await page.waitForFunction(() => window.__drawResults.length === 2, null, { timeout: 10_000 });
    const second = (await results())[1];
    near(second.anchor.x, 0.1, 0.01, "touch anchor x");
    near(second.anchor.width, 0.3, 0.01, "touch anchor width");

    // Escape with no drag leaves draw mode.
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "סימון אזור להערה" }).getAttribute("aria-pressed"), "false");

    // Zoom in changes the page size by exactly one step.
    const w0 = (await pageBox(1)).width;
    await page.getByRole("button", { name: "הגדלה", exact: true }).click();
    await page.waitForTimeout(100);
    const w1 = (await pageBox(1)).width;
    near(w1 / w0, 1.2, 0.02, "zoom in step");

    // Selecting a page-2 comment scrolls it into view and the page renders.
    await page.getByRole("button", { name: /הערה 3/ }).first().click();
    await page.waitForSelector('.alpr-page[data-page="2"] canvas[data-rendered]', { timeout: 10_000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-comment-id="c3"]')?.getBoundingClientRect();
        const sc = document.querySelector(".alpr-scroller")?.getBoundingClientRect();
        return el && sc && el.top >= sc.top && el.bottom <= sc.bottom;
      },
      null,
      { timeout: 5_000 },
    );
    assert.deepEqual(errors, [], "box style: no page errors");
    console.log("desktop · boxes, drag (mouse + touch), Escape, zoom, select: ok");
    await ctx.close();
  }

  /* ================= desktop, sticker style ================= */
  {
    const { ctx, page, errors, shot, results, pageBox } = await open({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    const sc = page.locator(".alpr-scroller");
    // Fit width by default: the page plus the margins is exactly the view.
    const fit = await page.evaluate(() => {
      const s = document.querySelector(".alpr-scroller");
      return { page: document.querySelector(".alpr-page").getBoundingClientRect().width, view: s.clientWidth, sw: s.scrollWidth };
    });
    near(fit.page + 32, fit.view, 1, "fit width");
    assert.equal(fit.sw, fit.view, "no sideways scroll at fit width");

    assert.equal(await page.locator(".alpr-sticker").count(), 4, "four stickers");
    assert.equal(await page.locator(".alpr-box").count(), 0, "no boxes in sticker style");
    await shot("desk-stickers");

    const s1 = page.getByRole("button", { name: "הערה 1", exact: true });
    // Hover previews…
    await s1.hover();
    await page.waitForSelector(".alpr-preview", { timeout: 2_000 });
    assert.match(await page.locator(".alpr-preview").innerText(), /מדעי המחשב/);
    await shot("desk-sticker-hover");
    await page.mouse.move(640, 880);
    await page.waitForSelector(".alpr-preview", { state: "detached", timeout: 2_000 });
    // …a click opens it and selects, a second click closes it, Escape too.
    await s1.click();
    assert.equal(await s1.getAttribute("aria-expanded"), "true");
    assert.equal(await s1.getAttribute("aria-pressed"), "true", "selected");
    await page.mouse.move(640, 880);
    assert.equal(await page.locator(".alpr-preview").count(), 1, "stays open after the mouse leaves");
    await s1.click();
    assert.equal(await s1.getAttribute("aria-expanded"), "false", "second click closes");
    await s1.click();
    await page.keyboard.press("Escape");
    assert.equal(await s1.getAttribute("aria-expanded"), "false", "Escape closes");
    await s1.click();
    const b1 = await pageBox(1);
    await page.mouse.click(b1.x + b1.width * 0.5, b1.y + 40);
    assert.equal(await s1.getAttribute("aria-expanded"), "false", "a click on the page closes");
    // States: resolved = green + check, draft = dashed.
    assert.equal(await page.locator('.alpr-note[data-resolved] .alpr-sticker-check').count(), 1);
    assert.equal(await page.locator(".alpr-note[data-draft]").count(), 1);

    // Tap-to-place: one click in draw mode marks the default area around it.
    await sc.evaluate((el) => (el.scrollTop = 0));
    await page.getByRole("button", { name: "סימון אזור להערה" }).click();
    assert.equal(await page.locator(".alpr-modebar").count(), 1, "mode bar explains draw mode");
    let box = await pageBox(1);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.42);
    await page.waitForFunction(() => window.__drawResults.length === 1, null, { timeout: 10_000 });
    let a = (await results())[0].anchor;
    near(a.width, 0.28, 0.001, "tap width");
    near(a.height, 0.045, 0.001, "tap height");
    near(a.x + a.width / 2, 0.5, 0.002, "tap centre x");
    near(a.y + a.height / 2, 0.42, 0.002, "tap centre y");
    // …at a corner it is shifted onto the page, not shrunk.
    box = await pageBox(1);
    await page.mouse.click(box.x + box.width * 0.995, box.y + 2);
    await page.waitForFunction(() => window.__drawResults.length === 2, null, { timeout: 10_000 });
    a = (await results())[1].anchor;
    near(a.x + a.width, 1, 0.001, "corner tap right edge");
    near(a.y, 0, 0.001, "corner tap top");
    near(a.width, 0.28, 0.001, "corner tap keeps its width");
    // A drag still draws a rectangle; a thin stroke along a line gets a line's height.
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.36, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => window.__drawResults.length === 3, null, { timeout: 10_000 });
    a = (await results())[2].anchor;
    near(a.x, 0.2, 0.01, "drag x");
    near(a.height, 0.06, 0.01, "drag height");
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5 + 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => window.__drawResults.length === 4, null, { timeout: 10_000 });
    a = (await results())[3].anchor;
    near(a.width, 0.35, 0.01, "stroke width");
    near(a.height, 0.045, 0.002, "stroke gets a line's height");
    await shot("desk-draw");
    await page.getByRole("button", { name: "סיום" }).click();
    assert.equal(await page.getByRole("button", { name: "סימון אזור להערה" }).getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator(".alpr-sticker").count(), 8, "four new draft stickers");

    // Magnifier.
    const magBtn = page.getByRole("button", { name: "זכוכית מגדלת", exact: true });
    await magBtn.click();
    assert.equal(await magBtn.getAttribute("aria-pressed"), "true");
    // Bring page 1's fine print (7pt, ~89% down the page) to the middle of the view.
    await sc.evaluate((el) => {
      const p = document.querySelector('.alpr-page[data-page="1"]');
      el.scrollTop = p.offsetTop + p.offsetHeight * 0.887 - el.clientHeight / 2;
    });
    await page.waitForTimeout(300);
    box = await pageBox(1);
    const mx = box.x + box.width * 0.62;
    const my = box.y + box.height * 0.8875;
    await page.mouse.move(mx - 40, my - 30);
    await page.mouse.move(mx, my, { steps: 4 });
    await page.waitForSelector(".alpr-lens:not([hidden])", { timeout: 2_000 });
    await page.waitForSelector('.alpr-lens[data-sharp="true"]', { timeout: 5_000 });
    const lb = await page.locator(".alpr-lens").boundingBox();
    near(lb.x + lb.width / 2, mx, 1.5, "lens centred on the mouse (x)");
    near(lb.y + lb.height / 2, my, 1.5, "lens centred on the mouse (y)");
    near(lb.width, 160, 0.5, "lens size");
    let q = await page.evaluate(lensQuality);
    console.log("lens at ×2.5:", q);
    assert.equal(q.power, 2.5);
    assert.ok(q.ink > 0.02, "the lens is over text");
    assert.ok(q.meanDiff < 18, `lens shows the right spot (mean diff ${q.meanDiff.toFixed(1)})`);
    assert.ok(q.lensEnergy > q.stretchedEnergy * 1.25, "lens is sharper than stretched pixels");
    await shot("desk-lens");
    // Alt+wheel and the +/- buttons set the power.
    await page.keyboard.down("Alt");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Alt");
    await page.waitForFunction(() => document.querySelector(".alpr-modebar-power")?.textContent === "×3");
    await page.getByRole("button", { name: "יותר הגדלה בזכוכית" }).click();
    await page.waitForFunction(() => document.querySelector(".alpr-modebar-power")?.textContent === "×3.5");
    await page.mouse.move(mx, my, { steps: 2 });
    await page.waitForSelector('.alpr-lens[data-sharp="true"][data-power="3.5"]', { timeout: 5_000 });
    q = await page.evaluate(lensQuality);
    assert.ok(q.meanDiff < 18 && q.lensEnergy > q.stretchedEnergy * 1.25, `×3.5 sharp and in place ${JSON.stringify(q)}`);
    await shot("desk-lens-35");
    // A plain wheel still scrolls, and the lens follows the content.
    const top0 = await sc.evaluate((el) => el.scrollTop);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    assert.ok((await sc.evaluate((el) => el.scrollTop)) > top0 + 100, "wheel scrolls in magnifier mode");
    assert.equal(await page.locator(".alpr-lens:not([hidden])").count(), 1, "lens still up");
    // Ctrl+wheel zooms the document around the mouse.
    const under = () =>
      page.evaluate(([x, y]) => {
        for (const p of document.querySelectorAll(".alpr-page")) {
          const r = p.getBoundingClientRect();
          if (y >= r.top && y <= r.bottom) return { page: p.dataset.page, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height };
        }
        return null;
      }, [mx, my]);
    const u0 = await under();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    await page.waitForTimeout(400);
    const u1 = await under();
    assert.equal(u1.page, u0.page);
    near(u1.fx, u0.fx, 0.003, "zoom keeps the point under the mouse (x)");
    near(u1.fy, u0.fy, 0.003, "zoom keeps the point under the mouse (y)");
    await page.waitForSelector('.alpr-lens[data-sharp="true"]', { timeout: 5_000 });
    // Escape leaves the mode; the lens goes.
    await page.keyboard.press("Escape");
    assert.equal(await magBtn.getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator(".alpr-lens").count(), 0);

    // Page navigation, and the floating "1 / 2".
    await page.getByRole("button", { name: "התאמה לרוחב" }).click();
    await sc.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "עמוד הבא" }).click();
    await page.waitForSelector(".alpr-pill[data-visible]", { timeout: 2_000 });
    await page.waitForFunction(() => document.querySelector(".alpr-page-input")?.value === "2", null, { timeout: 3_000 });
    assert.equal(await page.getByRole("button", { name: "עמוד הבא" }).isDisabled(), true, "no page after the last");
    await shot("desk-page2");
    await page.getByRole("button", { name: "עמוד קודם" }).click();
    await page.waitForFunction(() => document.querySelector(".alpr-page-input")?.value === "1", null, { timeout: 3_000 });

    assert.deepEqual(errors, [], "sticker style: no page errors");
    console.log("desktop · stickers, tap/drag/stroke, magnifier, ctrl+wheel, navigation: ok");
    await ctx.close();
  }

  /* ================= phone, touch ================= */
  {
    const { ctx, page, errors, shot, results, pageBox } = await open({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3,
    });
    const sc = page.locator(".alpr-scroller");
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

    const geo = await page.evaluate(() => {
      const s = document.querySelector(".alpr-scroller");
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toolbar: document.querySelector(".alpr-toolbar").getBoundingClientRect().height,
        page: document.querySelector(".alpr-page").getBoundingClientRect().width,
        view: s.clientWidth,
        sw: s.scrollWidth,
        btn: document.querySelector(".alpr-btn").getBoundingClientRect().height,
      };
    });
    assert.equal(geo.docOverflow, 0, "no sideways overflow");
    assert.ok(geo.toolbar <= 56, `one-row toolbar (${geo.toolbar}px)`);
    assert.ok(geo.btn >= 44, `44px touch targets (${geo.btn}px)`);
    near(geo.page + 16, geo.view, 1, "fit width on a phone");
    assert.equal(geo.sw, geo.view, "no sideways scroll");
    assert.equal(await page.locator(".alpr-page-now").innerText(), "עמוד 1 / 2");
    await shot("phone-stickers");

    // Tap a sticker: it opens; tap the page: it closes.
    const s1 = page.locator('[data-comment-id="c1"]');
    await s1.tap();
    assert.equal(await s1.getAttribute("aria-expanded"), "true");
    await shot("phone-sticker-open");
    let box = await pageBox(1);
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.08);
    assert.equal(await s1.getAttribute("aria-expanded"), "false");

    // Draw: a tap places the default area, a drag draws one.
    await page.getByRole("button", { name: "סימון אזור להערה" }).tap();
    box = await pageBox(1);
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await page.waitForFunction(() => window.__drawResults.length === 1, null, { timeout: 10_000 });
    let a = (await results())[0].anchor;
    near(a.width, 0.28, 0.001, "phone tap width");
    near(a.y + a.height / 2, 0.4, 0.003, "phone tap centre y");
    const pt = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    await touch("touchStart", [pt(0.2, 0.5)]);
    for (let i = 1; i <= 6; i++) await touch("touchMove", [pt(0.2 + 0.08 * i, 0.5 + 0.01 * i)]);
    await touch("touchEnd", []);
    await page.waitForFunction(() => window.__drawResults.length === 2, null, { timeout: 10_000 });
    a = (await results())[1].anchor;
    near(a.width, 0.48, 0.01, "phone drag width");
    await shot("phone-draw");
    await page.getByRole("button", { name: "סיום" }).tap();

    // Magnifier: hold, then drag; the lens floats above the finger; the page does not scroll.
    await page.getByRole("button", { name: "זכוכית מגדלת", exact: true }).tap();
    await sc.evaluate((el) => {
      const p = document.querySelector('.alpr-page[data-page="1"]');
      el.scrollTop = p.offsetTop + p.offsetHeight * 0.887 - el.clientHeight / 2;
    });
    await page.waitForTimeout(300);
    box = await pageBox(1);
    const fx = box.x + box.width * 0.6;
    const fy = box.y + box.height * 0.8875;
    const top0 = await sc.evaluate((el) => el.scrollTop);
    await touch("touchStart", [[fx, fy]]);
    await page.waitForTimeout(450);
    for (let i = 1; i <= 5; i++) await touch("touchMove", [[fx - 6 * i, fy]]);
    await page.waitForSelector(".alpr-lens:not([hidden])", { timeout: 2_000 });
    await page.waitForSelector('.alpr-lens[data-sharp="true"]', { timeout: 5_000 });
    const lb = await page.locator(".alpr-lens").boundingBox();
    assert.ok(lb.y + lb.height < fy, "lens is above the finger");
    near(lb.x + lb.width / 2, fx - 30, 1.5, "lens follows the finger");
    assert.equal(await sc.evaluate((el) => el.scrollTop), top0, "no scroll while magnifying");
    const q = await page.evaluate(lensQuality);
    console.log("phone lens:", q);
    assert.ok(q.lensEnergy > q.stretchedEnergy * 1.25, "phone lens sharper than stretched pixels");
    await shot("phone-lens");
    await touch("touchEnd", []);
    await page.waitForSelector(".alpr-lens", { state: "hidden", timeout: 2_000 });

    // A quick swipe in magnifier mode still scrolls, and shows no lens.
    const t1 = await sc.evaluate((el) => el.scrollTop);
    await touch("touchStart", [[200, 500]]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [[200, 500 + 30 * i]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(500);
    const t2 = await sc.evaluate((el) => el.scrollTop);
    assert.ok(t2 < t1 - 50, `swipe scrolls (${t1} -> ${t2})`);
    assert.equal(await page.locator(".alpr-lens:not([hidden])").count(), 0, "no lens on a swipe");
    await page.getByRole("button", { name: "סגירת הזכוכית המגדלת" }).tap();

    // Pinch zooms.
    const z0 = await page.locator(".alpr-zoom").textContent();
    await touch("touchStart", [
      [150, 400],
      [240, 400],
    ]);
    for (let i = 1; i <= 6; i++)
      await touch("touchMove", [
        [150 - 12 * i, 400],
        [240 + 12 * i, 400],
      ]);
    await touch("touchEnd", []);
    await page.waitForTimeout(400);
    const z1 = await page.locator(".alpr-zoom").textContent();
    assert.ok(parseInt(z1) > parseInt(z0) * 1.5, `pinch zooms in (${z0} -> ${z1})`);
    await shot("phone-pinch");

    assert.deepEqual(errors, [], "phone: no page errors");
    console.log("phone · stickers, tap/drag, magnifier hold+drag, swipe, pinch: ok");
    await ctx.close();
  }
  console.log("smoke test passed");
} finally {
  await browser.close();
  await server.close();
}
