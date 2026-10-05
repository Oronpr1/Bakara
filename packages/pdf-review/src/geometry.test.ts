import { describe, expect, it } from "vitest";
import {
  MIN_DRAW_PX,
  capRasterScale,
  clampPoint,
  clampRectToPage,
  dragToPageRect,
  meetsMinSize,
  normToPixelRect,
  pageIndexAt,
  pixelRectToNorm,
  rectFromDrag,
  scrollToReveal,
  snapshotCropRect,
} from "./geometry";

const A4 = { width: 595.28, height: 841.89 }; // points; scaled per zoom below

describe("rectFromDrag", () => {
  const expected = { left: 10, top: 20, width: 90, height: 60 };
  it.each([
    ["top-left to bottom-right", { x: 10, y: 20 }, { x: 100, y: 80 }],
    ["bottom-right to top-left", { x: 100, y: 80 }, { x: 10, y: 20 }],
    ["top-right to bottom-left", { x: 100, y: 20 }, { x: 10, y: 80 }],
    ["bottom-left to top-right", { x: 10, y: 80 }, { x: 100, y: 20 }],
  ])("%s gives the same rect", (_name, a, b) => {
    expect(rectFromDrag(a, b)).toEqual(expected);
  });

  it("a click is an empty rect at the press point", () => {
    expect(rectFromDrag({ x: 5, y: 7 }, { x: 5, y: 7 })).toEqual({ left: 5, top: 7, width: 0, height: 0 });
  });
});

describe("clamping", () => {
  const page = { width: 200, height: 300 };

  it("clampPoint pins a point to the page box", () => {
    expect(clampPoint({ x: -5, y: 400 }, page)).toEqual({ x: 0, y: 300 });
    expect(clampPoint({ x: 50, y: 60 }, page)).toEqual({ x: 50, y: 60 });
  });

  it("clampRectToPage keeps the overlapping part", () => {
    expect(clampRectToPage({ left: -20, top: -10, width: 70, height: 40 }, page)).toEqual({
      left: 0,
      top: 0,
      width: 50,
      height: 30,
    });
    expect(clampRectToPage({ left: 150, top: 280, width: 100, height: 100 }, page)).toEqual({
      left: 150,
      top: 280,
      width: 50,
      height: 20,
    });
  });

  it("a rect wholly outside the page collapses to zero size", () => {
    const r = clampRectToPage({ left: 300, top: 10, width: 50, height: 50 }, page);
    expect(r.width).toBe(0);
    expect(meetsMinSize(r)).toBe(false);
  });

  it("a rect covering more than the page becomes the page", () => {
    expect(clampRectToPage({ left: -1, top: -1, width: 1000, height: 1000 }, page)).toEqual({
      left: 0,
      top: 0,
      width: 200,
      height: 300,
    });
  });
});

describe("minimum size", () => {
  it("needs both sides at least the minimum", () => {
    expect(meetsMinSize({ left: 0, top: 0, width: MIN_DRAW_PX, height: MIN_DRAW_PX })).toBe(true);
    expect(meetsMinSize({ left: 0, top: 0, width: MIN_DRAW_PX - 1, height: 100 })).toBe(false);
    expect(meetsMinSize({ left: 0, top: 0, width: 100, height: MIN_DRAW_PX - 0.5 })).toBe(false);
    expect(meetsMinSize({ left: 0, top: 0, width: 3, height: 3 }, 2)).toBe(true);
  });

  it("dragToPageRect rejects a tiny drag and clamps a big one in any direction", () => {
    const page = { width: 200, height: 300 };
    expect(dragToPageRect({ x: 10, y: 10 }, { x: 14, y: 40 }, page)).toBeNull();
    expect(dragToPageRect({ x: 250, y: -30 }, { x: 150, y: 50 }, page)).toEqual({
      left: 150,
      top: 0,
      width: 50,
      height: 50,
    });
    // dragging mostly off the page leaves too little on it
    expect(dragToPageRect({ x: 196, y: 10 }, { x: 400, y: 100 }, page)).toBeNull();
  });
});

describe("anchor conversion", () => {
  it.each([0.5, 1, 4 / 3, 2, 3.7])("round-trips at zoom %s", (zoom) => {
    const page = { width: A4.width * zoom, height: A4.height * zoom };
    const anchor = { x: 0.125, y: 0.4, width: 0.3, height: 0.05 };
    const px = normToPixelRect(anchor, page);
    expect(px.left).toBeCloseTo(0.125 * page.width, 9);
    const back = pixelRectToNorm(px, page);
    expect(back.x).toBeCloseTo(anchor.x, 5);
    expect(back.y).toBeCloseTo(anchor.y, 5);
    expect(back.width).toBeCloseTo(anchor.width, 5);
    expect(back.height).toBeCloseTo(anchor.height, 5);
  });

  it("the same mark drawn at two zoom levels gives the same anchor", () => {
    const at = (zoom: number) =>
      pixelRectToNorm(
        { left: 100 * zoom, top: 200 * zoom, width: 150 * zoom, height: 40 * zoom },
        { width: A4.width * zoom, height: A4.height * zoom },
      );
    const a = at(1);
    const b = at(2.5);
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.width).toBeCloseTo(a.width, 5);
    expect(b.height).toBeCloseTo(a.height, 5);
  });

  it("pixel -> anchor -> pixel stays within a pixel at large zoom", () => {
    const page = { width: A4.width * 4, height: A4.height * 4 };
    const r = { left: 333.3, top: 1234.5, width: 456.7, height: 89.1 };
    const back = normToPixelRect(pixelRectToNorm(r, page), page);
    expect(Math.abs(back.left - r.left)).toBeLessThan(0.1);
    expect(Math.abs(back.top + back.height - (r.top + r.height))).toBeLessThan(0.1);
  });

  it("keeps the anchor inside the unit square", () => {
    const page = { width: 300, height: 300 };
    const n = pixelRectToNorm({ left: 299.999, top: 0, width: 50, height: 300.0001 }, page);
    expect(n.x + n.width).toBeLessThanOrEqual(1);
    expect(n.y + n.height).toBeLessThanOrEqual(1);
    expect(n.x).toBeGreaterThanOrEqual(0);
    const full = pixelRectToNorm({ left: 0, top: 0, width: 300, height: 300 }, page);
    expect(full).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("rejects a degenerate page", () => {
    expect(() => pixelRectToNorm({ left: 0, top: 0, width: 1, height: 1 }, { width: 0, height: 10 })).toThrow(
      RangeError,
    );
  });
});

describe("snapshotCropRect", () => {
  const canvas = { width: 1000, height: 1400 };

  it("grows the anchor by the margin and snaps outwards to whole pixels", () => {
    const r = snapshotCropRect({ x: 0.1005, y: 0.2, width: 0.3, height: 0.1 }, canvas, 20);
    expect(r).toEqual({ left: 80, top: 260, width: 341, height: 180 });
  });

  it("is cut at the canvas edges", () => {
    expect(snapshotCropRect({ x: 0, y: 0.95, width: 0.2, height: 0.05 }, canvas, 30)).toEqual({
      left: 0,
      top: 1300,
      width: 230,
      height: 100,
    });
  });

  it("never returns an empty crop", () => {
    const r = snapshotCropRect({ x: 1, y: 1, width: 0, height: 0 }, canvas, 0);
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it("treats a negative margin as none", () => {
    expect(snapshotCropRect({ x: 0.5, y: 0.5, width: 0.1, height: 0.1 }, canvas, -10)).toEqual({
      left: 500,
      top: 700,
      width: 100,
      height: 140,
    });
  });
});

describe("capRasterScale", () => {
  it("keeps a scale that fits", () => {
    expect(capRasterScale({ width: 600, height: 800 }, 3, 16_000_000)).toBe(3);
  });
  it("shrinks a scale whose bitmap would be too large", () => {
    const s = capRasterScale({ width: 600, height: 800 }, 10, 16_000_000);
    expect(600 * s * 800 * s).toBeCloseTo(16_000_000, 3);
  });
});

describe("pageIndexAt", () => {
  const tops = [0, 1100, 2200, 3300];
  it("finds the page under an offset", () => {
    expect(pageIndexAt(tops, 0)).toBe(0);
    expect(pageIndexAt(tops, 1099)).toBe(0);
    expect(pageIndexAt(tops, 1100)).toBe(1);
    expect(pageIndexAt(tops, 99999)).toBe(3);
    expect(pageIndexAt(tops, -5)).toBe(0);
    expect(pageIndexAt([], 10)).toBe(-1);
  });
});

describe("scrollToReveal", () => {
  it("leaves a visible span alone", () => {
    expect(scrollToReveal(100, 500, 200, 100)).toBeNull();
  });
  it("centres a span that is out of view", () => {
    expect(scrollToReveal(0, 500, 1000, 100)).toBe(800);
    expect(scrollToReveal(2000, 500, 100, 100)).toBe(0);
  });
  it("aligns a span taller than the view to its start", () => {
    expect(scrollToReveal(0, 500, 1000, 800)).toBe(984);
  });
});
