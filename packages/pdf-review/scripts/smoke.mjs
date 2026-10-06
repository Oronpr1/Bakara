// Headless check of the demo in a real Chromium, desktop (1280) and phone (390,
// touch): the original area boxes, the note / X / line tools (tap and drag,
// mouse and touch), colours, editing and deleting a draft, published marks
// staying read-only, the bottom zoom bar (±5%, typed %, fit width / page),
// ctrl+wheel and pinch zoom, scrolling and page navigation.
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
  const h = {
    ctx,
    page,
    errors,
    sc: page.locator(".alpr-scroller"),
    shot: async (name) => shotsDir && page.screenshot({ path: `${shotsDir}/${name}.png` }),
    events: () => page.evaluate(() => window.__events),
    /** Wait for the n-th event (1-based) and return it. */
    event: async (n) => {
      await page.waitForFunction((k) => window.__events.length >= k, n, { timeout: 10_000 });
      return (await page.evaluate(() => window.__events))[n - 1];
    },
    pageBox: (n) => page.locator(`.alpr-page[data-page="${n}"] .alpr-overlay`).boundingBox(),
    tool: (name) => page.getByRole("toolbar", { name: "כלי סימון" }).getByRole("button", { name, exact: true }),
    pressed: (loc) => loc.getAttribute("aria-pressed"),
    zoomField: () => page.getByRole("textbox", { name: "אחוז הגדלה" }),
  };
  return h;
}

try {
  /* ================= desktop: area boxes, the original contract ================= */
  {
    const { ctx, page, errors, pageBox, tool } = await open({ viewport: { width: 1280, height: 900 }, hasTouch: true }, "?legacy=1");
    const results = () => page.evaluate(() => window.__drawResults);
    assert.equal(await page.locator(".alpr-page").count(), 2, "two pages laid out");
    assert.equal(await page.locator(".alpr-box").count(), 4, "four area boxes");
    assert.equal(await page.locator(".alpr-box[data-draft]").count(), 1, "the draft box is dashed");

    // Mouse: drag from bottom-right to top-left.
    await tool("פתק").click();
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
    for (const [k, v] of Object.entries({ x: 0.2, y: 0.3, width: 0.5, height: 0.1 })) near(first.anchor[k], v, 0.01, `drag anchor.${k}`);
    assert.equal(first.snapshotType, "image/png");
    assert.ok(first.snapshotSize > 500, `non-empty PNG (${first.snapshotSize} bytes)`);
    assert.equal(await tool("בחירה").getAttribute("aria-pressed"), "true", "back to select after a mark");

    // Escape cancels a drag in progress.
    await tool("פתק").click();
    await page.mouse.move(...at(0.1, 0.45));
    await page.mouse.down();
    await page.mouse.move(...at(0.4, 0.55), { steps: 4 });
    assert.equal(await page.locator(".alpr-draft").count(), 1, "rubber band visible while dragging");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.equal((await results()).length, 1, "Escape: nothing reported");
    assert.equal(await page.locator(".alpr-draft").count(), 0);

    // Touch drag (pointerType "touch"); the tool is still on.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, [x, y]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", at(0.1, 0.45));
    for (let i = 1; i <= 5; i++) await touch("touchMove", at(0.1 + 0.06 * i, 0.45 + 0.02 * i));
    await touch("touchEnd", at(0.4, 0.55));
    await page.waitForFunction(() => window.__drawResults.length === 2, null, { timeout: 10_000 });
    const second = (await results())[1];
    near(second.anchor.x, 0.1, 0.01, "touch anchor x");
    near(second.anchor.width, 0.3, 0.01, "touch anchor width");

    // Escape leaves a tool.
    await tool("סימון X").click();
    await page.keyboard.press("Escape");
    assert.equal(await tool("בחירה").getAttribute("aria-pressed"), "true");

    // Selecting a page-2 comment scrolls it into view and the page renders.
    await page.getByRole("complementary").getByRole("button", { name: /אזור 3/ }).click();
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
    assert.deepEqual(errors, [], "boxes: no page errors");
    console.log("desktop · area boxes, drag (mouse + touch), Escape, select: ok");
    await ctx.close();
  }

  /* ================= desktop: marks, tools, editing, zoom ================= */
  {
    const h = await open({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const { page, errors, shot, event, events, pageBox, tool, sc, zoomField } = h;
    const fit = await page.evaluate(() => {
      const s = document.querySelector(".alpr-scroller");
      return { page: document.querySelector(".alpr-page").getBoundingClientRect().width, view: s.clientWidth, sw: s.scrollWidth };
    });
    near(fit.page + 32, fit.view, 1, "fit width by default");
    assert.equal(fit.sw, fit.view, "no sideways scroll at fit width");
    assert.equal(await page.getByRole("button", { name: "התאם לרוחב" }).getAttribute("aria-pressed"), "true");

    assert.equal(await page.locator(".alpr-mark").count(), 4, "four marks");
    assert.equal(await page.locator(".alpr-sticker").count(), 2, "two notes");
    assert.equal(await page.locator(".alpr-x").count(), 1, "one X");
    assert.equal(await page.locator(".alpr-line").count(), 1, "one line");
    const s1 = page.locator('[data-comment-id="c1"]');
    assert.equal(await s1.evaluate((el) => getComputedStyle(el).color), "rgb(255, 255, 255)", "white number on a red note");
    assert.equal(await page.locator('.alpr-mark[data-resolved] .alpr-badge-check').count(), 1, "closed X carries a check");
    await shot("desk-marks");

    // A note's preview: hover, click (selects), click again, Escape, a click on the page.
    let box = await pageBox(1);
    const empty = [box.x + box.width * 0.12, box.y + box.height * 0.12];
    await s1.hover();
    await page.waitForSelector(".alpr-preview", { timeout: 2_000 });
    assert.match(await page.locator(".alpr-preview").innerText(), /מדעי המחשב/);
    await shot("desk-note-hover");
    await page.mouse.move(...empty);
    await page.waitForSelector(".alpr-preview", { state: "detached", timeout: 2_000 });
    await s1.click();
    assert.equal(await s1.getAttribute("aria-expanded"), "true");
    assert.equal(await s1.getAttribute("aria-pressed"), "true", "selected");
    await page.mouse.move(...empty);
    assert.equal(await page.locator(".alpr-preview").count(), 1, "stays open after the mouse leaves");
    await s1.click();
    assert.equal(await s1.getAttribute("aria-expanded"), "false", "second click closes");
    await s1.click();
    await page.keyboard.press("Escape");
    assert.equal(await s1.getAttribute("aria-expanded"), "false", "Escape closes");
    await page.mouse.click(...empty);
    assert.equal((await events()).at(-1)?.type, "clear", "a click on the page clears the selection");
    assert.equal(await s1.getAttribute("aria-pressed"), "false");

    // A published mark is read-only: no handles, the palette and a drag change nothing.
    await s1.click();
    assert.equal(await page.locator(".alpr-handle").count(), 0, "no handles on a published mark");
    await page.getByRole("radio", { name: "כחול" }).click();
    const sb = await s1.boundingBox();
    await page.mouse.move(sb.x + 14, sb.y + 14);
    await page.mouse.down();
    await page.mouse.move(sb.x + 90, sb.y + 60, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert.equal((await events()).filter((e) => e.type === "update").length, 0, "published: no edits");
    await page.getByRole("radio", { name: "אדום" }).click();
    await page.mouse.click(...empty);
    let n = (await events()).length;

    // Note by a tap; then the new draft is selected with handles, in the chosen colour.
    await tool("פתק").click();
    assert.match(await page.locator(".alpr-hint").innerText(), /פתק/);
    box = await pageBox(1);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.42);
    let ev = await event(++n);
    assert.equal(ev.type, "create");
    assert.equal(ev.kind, "NOTE");
    assert.equal(ev.color, "#d92d20");
    near(ev.anchor.width, 0.28, 0.001, "tap width");
    near(ev.anchor.height, 0.045, 0.001, "tap height");
    near(ev.anchor.x + ev.anchor.width / 2, 0.5, 0.002, "tap centre x");
    near(ev.anchor.y + ev.anchor.height / 2, 0.42, 0.002, "tap centre y");
    assert.ok(ev.snapshotSize > 500 && ev.snapshotType === "image/png", "snapshot");
    assert.equal(await tool("בחירה").getAttribute("aria-pressed"), "true", "back to select");
    await page.waitForSelector(".alpr-mark[data-selected][data-draft]");
    assert.equal(await page.locator(".alpr-handle").count(), 4, "four resize handles");
    const created = ev.anchor;

    // Recolour the selected draft.
    await page.getByRole("radio", { name: "כחול" }).click();
    ev = await event(++n);
    assert.deepEqual(ev.patch, { color: "#2563eb" });
    const draftId = ev.id;
    await page.waitForFunction(
      () => document.querySelector(".alpr-mark[data-selected]")?.style.getPropertyValue("--mark") === "#2563eb",
    );

    // Move it by dragging its area.
    const area = await page.locator(".alpr-mark[data-selected] .alpr-note-area").boundingBox();
    box = await pageBox(1);
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width / 2 - 80, area.y + area.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    ev = await event(++n);
    assert.equal(ev.type, "update");
    assert.equal(ev.id, draftId);
    near(ev.patch.anchor.x, created.x - 80 / box.width, 0.002, "moved x");
    near(ev.patch.anchor.y, created.y + 40 / box.height, 0.002, "moved y");
    near(ev.patch.anchor.width, created.width, 1e-4, "same width");
    assert.equal(ev.patch.anchor.versionNumber, 1);
    const moved = ev.patch.anchor;

    // Resize it from its bottom-right corner.
    const se = await page.locator('.alpr-handle[data-grip="se"]').boundingBox();
    await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
    await page.mouse.down();
    await page.mouse.move(se.x + se.width / 2 + 60, se.y + se.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    ev = await event(++n);
    near(ev.patch.anchor.x, moved.x, 1e-4, "resize keeps the far corner");
    near(ev.patch.anchor.width, moved.width + 60 / box.width, 0.002, "resized width");
    near(ev.patch.anchor.height, moved.height + 30 / box.height, 0.002, "resized height");
    await shot("desk-edit");

    // Delete it with the Delete key.
    await page.keyboard.press("Delete");
    ev = await event(++n);
    assert.deepEqual(ev, { type: "delete", id: draftId });
    await page.waitForFunction(() => document.querySelectorAll(".alpr-mark").length === 4);

    // X by a drag, deleted with the toolbar button; X by a tap (lower on the page: scroll there).
    await sc.evaluate((el) => (el.scrollTop = 500));
    await page.waitForTimeout(250);
    box = await pageBox(1);
    await tool("סימון X").click();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.65, { steps: 6 });
    await page.mouse.up();
    ev = await event(++n);
    assert.equal(ev.kind, "X");
    for (const [k, v] of Object.entries({ x: 0.2, y: 0.6, width: 0.25, height: 0.05 })) near(ev.anchor[k], v, 0.003, `X anchor.${k}`);
    await page.getByRole("button", { name: "מחיקת הסימון" }).click();
    ev = await event(++n);
    assert.equal(ev.type, "delete");
    await tool("סימון X").click();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
    ev = await event(++n);
    assert.equal(ev.kind, "X");
    near(ev.anchor.width, 0.28, 0.001, "X tap width");

    // Line: a tap draws nothing; a nearly level drag draws a level line.
    await tool("קו").click();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.75);
    await page.waitForTimeout(400);
    assert.equal((await events()).length, n, "a tap with the line tool draws nothing");
    assert.equal(await tool("קו").getAttribute("aria-pressed"), "true", "line tool still on");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.8 + 6, { steps: 8 });
    await page.mouse.up();
    ev = await event(++n);
    assert.equal(ev.kind, "LINE");
    assert.equal(ev.points.length, 2);
    near(ev.points[0].x, 0.2, 0.002, "line start x");
    near(ev.points[1].x, 0.6, 0.002, "line end x");
    assert.equal(ev.points[1].y, ev.points[0].y, "nearly level line straightened");
    assert.equal(ev.anchor.height, 0, "a level line's box has no height");
    await page.waitForSelector(".alpr-mark[data-selected][data-kind='LINE']");
    assert.equal(await page.locator(".alpr-handle").count(), 2, "two end handles");
    // Move its end, then the whole line.
    const end = await page.locator('.alpr-handle[data-grip="1"]').boundingBox();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 6 });
    await page.mouse.up();
    ev = await event(++n);
    near(ev.patch.points[1].x, 0.7, 0.003, "end moved x");
    near(ev.patch.points[1].y, 0.7, 0.003, "end moved y");
    near(ev.patch.points[0].x, 0.2, 0.002, "start stays");
    near(ev.patch.anchor.height, 0.1, 0.004, "box follows the line");
    const lineBox = await page.locator(".alpr-mark[data-selected] .alpr-line").boundingBox();
    await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2 - 30, { steps: 5 });
    await page.mouse.up();
    ev = await event(++n);
    near(ev.patch.points[0].y - 0.8, -30 / box.height, 0.003, "whole line moved");
    await shot("desk-line");

    // Zoom bar: ±5%, typed %, fit page, fit width.
    const zf = zoomField();
    const z0 = parseInt(await zf.inputValue());
    await page.getByRole("button", { name: "הגדלה", exact: true }).click();
    assert.equal(await zf.inputValue(), `${(Math.floor(z0 / 5) + 1) * 5}%`, "+ goes to the next 5%");
    await page.getByRole("button", { name: "הקטנה", exact: true }).click();
    await page.getByRole("button", { name: "הקטנה", exact: true }).click();
    assert.equal(await zf.inputValue(), `${(Math.floor(z0 / 5) - 1) * 5}%`, "− steps 5% at a time");
    assert.equal(await page.getByRole("button", { name: "התאם לרוחב" }).getAttribute("aria-pressed"), "false");
    await zf.click();
    await zf.fill("150");
    await zf.press("Enter");
    assert.equal(await zf.inputValue(), "150%");
    near((await pageBox(1)).width, (595.28 * 96) / 72 * 1.5, 1, "typed 150%");
    await page.getByRole("button", { name: "התאם לעמוד" }).click();
    await page.waitForTimeout(300);
    const fp = await page.evaluate(() => ({
      h: document.querySelector(".alpr-page").getBoundingClientRect().height,
      view: document.querySelector(".alpr-scroller").clientHeight,
    }));
    near(fp.h + 32, fp.view, 1.5, "fit page: a whole page in view");
    await shot("desk-fit-page");
    await page.getByRole("button", { name: "התאם לרוחב" }).click();
    await page.waitForTimeout(300);
    near((await pageBox(1)).width + 32, fit.view, 1, "fit width again");

    // Ctrl+wheel zooms around the mouse.
    await sc.evaluate((el) => (el.scrollTop = 300));
    await page.waitForTimeout(200);
    box = await pageBox(1);
    const mx = box.x + box.width * 0.6;
    const my = box.y + 500;
    const under = () =>
      page.evaluate(([x, y]) => {
        for (const p of document.querySelectorAll(".alpr-page")) {
          const r = p.getBoundingClientRect();
          if (y >= r.top && y <= r.bottom) return { page: p.dataset.page, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height };
        }
        return null;
      }, [mx, my]);
    await page.mouse.move(mx, my);
    const u0 = await under();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    await page.waitForTimeout(400);
    const u1 = await under();
    assert.equal(u1.page, u0.page);
    near(u1.fx, u0.fx, 0.003, "ctrl+wheel keeps the point under the mouse (x)");
    near(u1.fy, u0.fy, 0.003, "ctrl+wheel keeps the point under the mouse (y)");
    assert.ok(parseInt(await zf.inputValue()) > Math.round((fit.view - 32) / 7.937), "ctrl+wheel zoomed in");

    // Page navigation and the floating "1 / 2".
    await page.getByRole("button", { name: "התאם לרוחב" }).click();
    await sc.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "עמוד הבא" }).click();
    await page.waitForSelector(".alpr-pill[data-visible]", { timeout: 2_000 });
    await page.waitForFunction(() => document.querySelector(".alpr-page-now")?.textContent?.includes("2 / 2"), null, { timeout: 3_000 });
    assert.equal(await page.getByRole("button", { name: "עמוד הבא" }).isDisabled(), true, "no page after the last");
    await shot("desk-page2");
    await page.getByRole("button", { name: "עמוד קודם" }).click();
    await page.waitForFunction(() => document.querySelector(".alpr-page-now")?.textContent?.includes("1 / 2"), null, { timeout: 3_000 });

    assert.deepEqual(errors, [], "marks: no page errors");
    console.log("desktop · notes, X, lines, colours, edit/move/resize/delete, read-only published, zoom bar, ctrl+wheel, pages: ok");
    await h.ctx.close();
  }

  /* ================= phone, touch ================= */
  {
    const h = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    const { page, errors, shot, event, events, pageBox, tool, sc, zoomField } = h;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    const drag = async (from, to, steps = 6) => {
      await touch("touchStart", [from]);
      for (let i = 1; i <= steps; i++)
        await touch("touchMove", [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
      await touch("touchEnd", []);
    };

    const geo = await page.evaluate(() => {
      const s = document.querySelector(".alpr-scroller");
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toolbar: document.querySelector(".alpr-toolbar").getBoundingClientRect().height,
        zoombar: document.querySelector(".alpr-zoombar").getBoundingClientRect().height,
        page: document.querySelector(".alpr-page").getBoundingClientRect().width,
        view: s.clientWidth,
        sw: s.scrollWidth,
        minBtn: Math.min(...[...document.querySelectorAll(".alpr-btn")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height)),
      };
    });
    assert.equal(geo.docOverflow, 0, "no sideways overflow");
    assert.ok(geo.toolbar <= 56, `one-row tool bar (${geo.toolbar}px)`);
    assert.ok(geo.zoombar <= 60, `one-row zoom bar (${geo.zoombar}px)`);
    assert.ok(geo.minBtn >= 44, `44px touch targets (${geo.minBtn}px)`);
    near(geo.page + 16, geo.view, 1, "fit width on a phone");
    assert.equal(geo.sw, geo.view, "no sideways scroll");
    await shot("phone-marks");

    // Palette behind one button.
    await page.getByRole("button", { name: /^צבע:/ }).tap();
    assert.ok(await page.locator(".alpr-palette").isVisible(), "palette opens");
    await shot("phone-palette");
    await page.getByRole("radio", { name: "ירוק" }).tap();
    assert.ok(!(await page.locator(".alpr-palette").isVisible()), "palette closes");
    assert.equal(await page.getByRole("button", { name: /^צבע:/ }).getAttribute("aria-label"), "צבע: ירוק");

    // Tap a published note: it opens; tap the page: it closes and clears.
    const s1 = page.locator('[data-comment-id="c1"]');
    await s1.tap();
    assert.equal(await s1.getAttribute("aria-expanded"), "true");
    await shot("phone-note-open");
    let box = await pageBox(1);
    await page.touchscreen.tap(box.x + box.width * 0.12, box.y + box.height * 0.1);
    assert.equal(await s1.getAttribute("aria-expanded"), "false");
    assert.equal((await events()).at(-1)?.type, "clear");

    // A swipe that starts on a mark still scrolls the letter.
    const sb = await s1.boundingBox();
    const t0 = await sc.evaluate((el) => el.scrollTop);
    await drag([sb.x + 10, sb.y + 10], [sb.x + 10, sb.y - 190], 8);
    await page.waitForTimeout(400);
    const t1 = await sc.evaluate((el) => el.scrollTop);
    assert.ok(t1 > t0 + 50, `swipe on a mark scrolls (${t0} -> ${t1})`);
    await sc.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(200);
    let n = (await events()).length;

    // Note by a tap, in green; it comes back selected and can be dragged with a finger.
    await tool("פתק").tap();
    box = await pageBox(1);
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.4);
    let ev = await event(++n);
    assert.equal(ev.kind, "NOTE");
    assert.equal(ev.color, "#16a34a");
    near(ev.anchor.y + ev.anchor.height / 2, 0.4, 0.003, "phone tap centre y");
    await page.waitForSelector(".alpr-mark[data-selected][data-draft] .alpr-sticker");
    const created = ev.anchor;
    const st = await page.locator(".alpr-mark[data-selected] .alpr-sticker").boundingBox();
    const top0 = await sc.evaluate((el) => el.scrollTop);
    await drag([st.x + 14, st.y + 14], [st.x + 14 - 40, st.y + 14 + 30]);
    ev = await event(++n);
    assert.equal(ev.type, "update", JSON.stringify(ev));
    near(ev.patch.anchor.x, created.x - 40 / box.width, 0.004, `finger moved the note x ${JSON.stringify({ created, ev })}`);
    near(ev.patch.anchor.y, created.y + 30 / box.height, 0.004, "finger moved the note y");
    assert.equal(await sc.evaluate((el) => el.scrollTop), top0, "dragging a mark does not scroll");
    await shot("phone-edit");

    // X by a tap, line by a drag.
    await tool("סימון X").tap();
    await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.6);
    ev = await event(++n);
    assert.equal(ev.kind, "X");
    await tool("קו").tap();
    await drag([box.x + box.width * 0.15, box.y + box.height * 0.7], [box.x + box.width * 0.75, box.y + box.height * 0.7 + 3], 8);
    ev = await event(++n);
    assert.equal(ev.kind, "LINE");
    assert.equal(ev.points[0].y, ev.points[1].y, "level line by finger");
    await shot("phone-line");

    // Zoom: the + button, then a pinch.
    const zf = zoomField();
    const z0 = parseInt(await zf.inputValue());
    await page.getByRole("button", { name: "הגדלה", exact: true }).tap();
    assert.equal(await zf.inputValue(), `${(Math.floor(z0 / 5) + 1) * 5}%`);
    const z1 = parseInt(await zf.inputValue());
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
    const z2 = parseInt(await zf.inputValue());
    assert.ok(z2 > z1 * 1.5, `pinch zooms in (${z1}% -> ${z2}%)`);
    await shot("phone-pinch");
    await page.getByRole("button", { name: "התאם לרוחב" }).tap();
    await page.waitForTimeout(300);
    near((await pageBox(1)).width + 16, geo.view, 1, "fit width again");

    assert.deepEqual(errors, [], "phone: no page errors");
    console.log("phone · palette, notes open/close, swipe on a mark scrolls, tap note, finger drag, X, line, ±5%, pinch: ok");
    await h.ctx.close();
  }
  console.log("smoke test passed");
} finally {
  await browser.close();
  await server.close();
}
