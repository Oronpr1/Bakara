import { describe, expect, it } from "vitest";
import {
  LENS_POWER,
  LENS_POWER_MAX,
  LENS_POWER_MIN,
  LENS_TILE,
  clampPower,
  effectivePower,
  lensBlit,
  lensPlacement,
  lensSourceRect,
  lensToPage,
  pageToLens,
  stepPower,
  tileRange,
  tileRect,
} from "./lens";

const page = { width: 800, height: 1131 };

describe("power", () => {
  it("clamps and steps on a 0.5 grid", () => {
    expect(clampPower(0)).toBe(LENS_POWER_MIN);
    expect(clampPower(99)).toBe(LENS_POWER_MAX);
    expect(clampPower(Number.NaN)).toBe(LENS_POWER);
    expect(stepPower(2.5, 1)).toBe(3);
    expect(stepPower(2.5, -1)).toBe(2);
    expect(stepPower(2.3, 1)).toBe(3); // snaps to 2.5 first
    expect(stepPower(LENS_POWER_MAX, 1)).toBe(LENS_POWER_MAX);
    expect(stepPower(LENS_POWER_MIN, -1)).toBe(LENS_POWER_MIN);
  });

  it("caps the total magnification at a high document zoom", () => {
    expect(effectivePower(2.5, 1)).toBe(2.5);
    expect(effectivePower(6, 3)).toBe(4);
    expect(effectivePower(6, 20)).toBe(1);
  });
});

describe("mapping a point in the lens", () => {
  const center = { x: 400, y: 300 };
  const size = 160;
  const power = 2.5;

  it("shows a square of size/power page px around the centre", () => {
    expect(lensSourceRect(center, size, power)).toEqual({ left: 368, top: 268, width: 64, height: 64 });
  });

  it("maps the lens centre to the pointer and its edges size/2/power away", () => {
    expect(lensToPage({ x: 80, y: 80 }, center, size, power)).toEqual(center);
    expect(lensToPage({ x: 0, y: 0 }, center, size, power)).toEqual({ x: 368, y: 268 });
    expect(lensToPage({ x: 160, y: 160 }, center, size, power)).toEqual({ x: 432, y: 332 });
  });

  it("pageToLens is its inverse, and magnifies distances by the power", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 37.5, y: 121 },
      { x: 160, y: 80 },
    ]) {
      const q = pageToLens(lensToPage(p, center, size, power), center, size, power);
      expect(q.x).toBeCloseTo(p.x);
      expect(q.y).toBeCloseTo(p.y);
    }
    const a = pageToLens({ x: 400, y: 300 }, center, size, power);
    const b = pageToLens({ x: 410, y: 300 }, center, size, power);
    expect(b.x - a.x).toBeCloseTo(25);
  });
});

describe("lensBlit", () => {
  it("is the whole lens in the middle of the page", () => {
    const b = lensBlit({ x: 400, y: 500 }, page, 160, 2)!;
    expect(b.src).toEqual({ left: 360, top: 460, width: 80, height: 80 });
    expect(b.dest).toEqual({ left: 0, top: 0, width: 160, height: 160 });
  });

  it("is clipped at the page's corner, and lands at the matching place in the lens", () => {
    const b = lensBlit({ x: 10, y: 20 }, page, 160, 2)!;
    expect(b.src).toEqual({ left: 0, top: 0, width: 50, height: 60 });
    expect(b.dest).toEqual({ left: 60, top: 40, width: 100, height: 120 });
  });

  it("is null far off the page", () => {
    expect(lensBlit({ x: -500, y: 20 }, page, 160, 2)).toBeNull();
  });
});

describe("lensPlacement", () => {
  const bounds = { width: 390, height: 700 };

  it("centres on a hovering mouse", () => {
    expect(lensPlacement({ x: 200, y: 300 }, 160, bounds, "center")).toEqual({ x: 120, y: 220 });
  });

  it("floats above a finger, clear of it", () => {
    const p = lensPlacement({ x: 200, y: 400 }, 160, bounds, "above", 28);
    expect(p).toEqual({ x: 120, y: 212 });
    expect(p.y + 160).toBeLessThan(400);
  });

  it("moves beside the finger when there is no room above", () => {
    const left = lensPlacement({ x: 300, y: 60 }, 160, bounds, "above", 28);
    expect(left.x + 160).toBeLessThanOrEqual(300 - 28);
    const right = lensPlacement({ x: 60, y: 60 }, 160, bounds, "above", 28);
    expect(right.x).toBeGreaterThanOrEqual(60 + 28);
  });

  it("never leaves the bounds", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 390, y: 700 },
      { x: -40, y: 900 },
    ])
      for (const mode of ["center", "above"] as const) {
        const q = lensPlacement(p, 160, bounds, mode);
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeGreaterThanOrEqual(0);
        expect(q.x + 160).toBeLessThanOrEqual(390);
        expect(q.y + 160).toBeLessThanOrEqual(700);
      }
  });
});

describe("tiles", () => {
  const full = { width: 2000, height: 2830 };

  it("covers a window with the tiles it touches", () => {
    expect(tileRange({ left: 400, top: 1000, width: 320, height: 320 }, full)).toEqual({ x0: 0, y0: 1, x1: 1, y1: 2 });
    expect(tileRange({ left: 520, top: 520, width: 100, height: 100 }, full)).toEqual({ x0: 1, y0: 1, x1: 1, y1: 1 });
  });

  it("clips at the page and is null off it", () => {
    expect(tileRange({ left: -300, top: -300, width: 320, height: 320 }, full)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
    expect(tileRange({ left: 1900, top: 2800, width: 320, height: 320 }, full)).toEqual({ x0: 3, y0: 5, x1: 3, y1: 5 });
    expect(tileRange({ left: 2100, top: 0, width: 50, height: 50 }, full)).toBeNull();
  });

  it("cuts the last row and column at the page edge", () => {
    expect(tileRect(0, 0, full)).toEqual({ left: 0, top: 0, width: LENS_TILE, height: LENS_TILE });
    expect(tileRect(3, 5, full)).toEqual({ left: 1536, top: 2560, width: 464, height: 270 });
  });
});
