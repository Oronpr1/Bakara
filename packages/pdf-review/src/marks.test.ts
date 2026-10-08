import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARK_COLOR,
  MARK_COLORS,
  MIN_LINE_PX,
  TAP_AREA,
  inkOn,
  lineBar,
  lineFromDrag,
  markColor,
  moveEndpoint,
  movePoints,
  moveRect,
  normPoint,
  parseHex,
  pointsBounds,
  pxPoint,
  resizeRect,
  resolveMarkGesture,
  shade,
  tapRectAt,
  withAlpha,
} from "./marks";

const page = { width: 800, height: 1131 }; // an A4 page at ~1.0 zoom, CSS px
const onPage = (r: { left: number; top: number; width: number; height: number }) => {
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.left + r.width).toBeLessThanOrEqual(page.width + 1e-9);
  expect(r.top + r.height).toBeLessThanOrEqual(page.height + 1e-9);
};

describe("tapRectAt (a note or an X placed with one tap)", () => {
  it("is the default area centred on the tap", () => {
    const r = tapRectAt({ x: 400, y: 500 }, page);
    expect(r.width).toBeCloseTo(TAP_AREA.width * page.width);
    expect(r.height).toBeCloseTo(TAP_AREA.height * page.height);
    expect(r.left + r.width / 2).toBeCloseTo(400);
    expect(r.top + r.height / 2).toBeCloseTo(500);
  });

  it("is shifted, not shrunk, at every edge of the page", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: page.width, y: 0 },
      { x: 0, y: page.height },
      { x: page.width, y: page.height },
      { x: -50, y: 2000 },
    ]) {
      const r = tapRectAt(p, page);
      onPage(r);
      expect(r.width).toBeCloseTo(TAP_AREA.width * page.width);
      expect(r.height).toBeCloseTo(TAP_AREA.height * page.height);
    }
  });

  it("is the whole page when asked for more than the page", () => {
    expect(tapRectAt({ x: 10, y: 10 }, page, { width: 2, height: 3 })).toEqual({ left: 0, top: 0, ...page });
  });
});

describe("resolveMarkGesture", () => {
  it("keeps a real rectangle as drawn", () => {
    expect(resolveMarkGesture({ x: 300, y: 200 }, { x: 100, y: 120 }, page)).toEqual({
      kind: "drag",
      rect: { left: 100, top: 120, width: 200, height: 80 },
    });
  });

  it("turns a press that barely moved into a tap at the press point", () => {
    for (const end of [
      { x: 400, y: 500 },
      { x: 403, y: 498 },
      { x: 407, y: 507 },
    ]) {
      const g = resolveMarkGesture({ x: 400, y: 500 }, end, page);
      expect(g).toEqual({ kind: "tap", rect: tapRectAt({ x: 400, y: 500 }, page) });
    }
  });

  it("gives a long thin stroke the tap area's thickness, centred on it", () => {
    const g = resolveMarkGesture({ x: 600, y: 300 }, { x: 200, y: 303 }, page)!;
    expect(g.kind).toBe("drag");
    expect(g.rect.left).toBe(200);
    expect(g.rect.width).toBe(400);
    expect(g.rect.height).toBeCloseTo(TAP_AREA.height * page.height);
    expect(g.rect.top + g.rect.height / 2).toBeCloseTo(301.5);
  });

  it("keeps a thin stroke at the page's top edge on the page", () => {
    const g = resolveMarkGesture({ x: 100, y: 1 }, { x: 500, y: 2 }, page)!;
    expect(g.rect.top).toBe(0);
    onPage(g.rect);
  });

  it("clamps a drag that leaves the page", () => {
    expect(resolveMarkGesture({ x: 700, y: 1000 }, { x: 900, y: 1300 }, page)!.rect).toEqual({
      left: 700,
      top: 1000,
      width: 100,
      height: 131,
    });
  });

  it("with tapArea null a tap marks nothing (the old rule)", () => {
    expect(resolveMarkGesture({ x: 10, y: 10 }, { x: 12, y: 11 }, page, { tapArea: null })).toBeNull();
    expect(resolveMarkGesture({ x: 10, y: 10 }, { x: 200, y: 12 }, page, { tapArea: null })).toBeNull();
  });
});

describe("lineFromDrag", () => {
  it("is the drag, ends on the page", () => {
    expect(lineFromDrag({ x: 100, y: 100 }, { x: 300, y: 250 }, page)).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 250 },
    ]);
    expect(lineFromDrag({ x: 700, y: 100 }, { x: 900, y: -50 }, page)).toEqual([
      { x: 700, y: 100 },
      { x: 800, y: 0 },
    ]);
  });

  it("straightens a nearly level underline and a nearly plumb line", () => {
    expect(lineFromDrag({ x: 100, y: 300 }, { x: 500, y: 310 }, page)![1]).toEqual({ x: 500, y: 300 });
    expect(lineFromDrag({ x: 100, y: 300 }, { x: 108, y: 600 }, page)![1]).toEqual({ x: 100, y: 600 });
    // a real slope stays
    expect(lineFromDrag({ x: 100, y: 300 }, { x: 500, y: 360 }, page)![1]).toEqual({ x: 500, y: 360 });
  });

  it("is nothing for a tap or a slip", () => {
    expect(lineFromDrag({ x: 100, y: 100 }, { x: 100, y: 100 }, page)).toBeNull();
    expect(lineFromDrag({ x: 100, y: 100 }, { x: 100 + MIN_LINE_PX - 1, y: 100 }, page)).toBeNull();
  });

  it("its bounds are the line's anchor, its bar the line", () => {
    const [a, b] = lineFromDrag({ x: 500, y: 400 }, { x: 200, y: 100 }, page)!;
    expect(pointsBounds([a, b])).toEqual({ left: 200, top: 100, width: 300, height: 300 });
    const bar = lineBar({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(bar.length).toBe(50);
    expect(bar.angle).toBeCloseTo((Math.atan2(40, 30) * 180) / Math.PI);
    expect(lineBar({ x: 10, y: 10 }, { x: 0, y: 10 }).angle).toBe(180);
  });
});

describe("editing a draft mark", () => {
  const r = { left: 100, top: 100, width: 200, height: 50 };

  it("moveRect moves and stops at the edges without resizing", () => {
    expect(moveRect(r, 30, -20, page)).toEqual({ left: 130, top: 80, width: 200, height: 50 });
    expect(moveRect(r, -500, 5000, page)).toEqual({ left: 0, top: page.height - 50, width: 200, height: 50 });
  });

  it("resizeRect keeps the opposite corner fixed", () => {
    expect(resizeRect(r, "se", { x: 400, y: 200 }, page)).toEqual({ left: 100, top: 100, width: 300, height: 100 });
    expect(resizeRect(r, "nw", { x: 50, y: 60 }, page)).toEqual({ left: 50, top: 60, width: 250, height: 90 });
    expect(resizeRect(r, "ne", { x: 350, y: 120 }, page)).toEqual({ left: 100, top: 120, width: 250, height: 30 });
    expect(resizeRect(r, "sw", { x: 90, y: 300 }, page)).toEqual({ left: 90, top: 100, width: 210, height: 200 });
  });

  it("resizeRect flips past the fixed corner, keeps a minimum and stays on the page", () => {
    expect(resizeRect(r, "se", { x: 50, y: 120 }, page)).toEqual({ left: 50, top: 100, width: 50, height: 20 });
    const tiny = resizeRect(r, "se", { x: 101, y: 101 }, page, 8);
    expect(tiny.width).toBe(8);
    expect(tiny.height).toBe(8);
    onPage(resizeRect(r, "se", { x: 5000, y: 5000 }, page));
    onPage(resizeRect(r, "nw", { x: -5000, y: -5000 }, page));
  });

  it("movePoints moves a line as one and stops when an end reaches an edge", () => {
    const line = [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ];
    expect(movePoints(line, 10, 20, page)).toEqual([
      { x: 110, y: 120 },
      { x: 310, y: 220 },
    ]);
    const far = movePoints(line, 1000, -1000, page);
    expect(far).toEqual([
      { x: 600, y: 0 },
      { x: 800, y: 100 },
    ]);
  });

  it("moveEndpoint moves one end, on the page", () => {
    const line = [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ];
    expect(moveEndpoint(line, 1, { x: 900, y: 50 }, page)).toEqual([
      { x: 100, y: 100 },
      { x: 800, y: 50 },
    ]);
  });

  it("points round-trip between page px and fractions", () => {
    const n = normPoint({ x: 200, y: 565.5 }, page);
    expect(n).toEqual({ x: 0.25, y: 0.5 });
    expect(pxPoint(n, page)).toEqual({ x: 200, y: 565.5 });
    expect(normPoint({ x: -3, y: 9999 }, page)).toEqual({ x: 0, y: 1 });
  });
});

describe("colours", () => {
  it("the palette is five hex colours, red first", () => {
    expect(MARK_COLORS).toHaveLength(5);
    expect(DEFAULT_MARK_COLOR).toBe("#d92d20");
    for (const c of MARK_COLORS) expect(parseHex(c)).not.toBeNull();
  });

  it("markColor accepts #rrggbb only", () => {
    expect(markColor("#2563EB")).toBe("#2563eb");
    expect(markColor(null)).toBe(DEFAULT_MARK_COLOR);
    expect(markColor("red")).toBe(DEFAULT_MARK_COLOR);
  });

  it("text on a sticker is white on dark colours and black on light ones", () => {
    expect(inkOn("#d92d20")).toBe("#ffffff");
    expect(inkOn("#2563eb")).toBe("#ffffff");
    expect(inkOn("#1c2024")).toBe("#ffffff");
    expect(inkOn("#f59e0b")).toBe("#000000");
    expect(inkOn("#ffffff")).toBe("#000000");
  });

  it("shade and withAlpha", () => {
    expect(shade("#ffffff", 0.5)).toBe("#808080");
    expect(shade("#d92d20", 0)).toBe("#d92d20");
    expect(withAlpha("#2563eb", 0.2)).toBe("rgb(37 99 235 / 0.2)");
  });
});
