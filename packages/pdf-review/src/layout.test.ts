import { describe, expect, it } from "vitest";
import { captureAnchor, computeLayout, fitWidthZoom, navState, scrollForAnchor, spacingFor } from "./layout";

const A4 = { width: 793.7, height: 1122.5 }; // CSS px at zoom 1
const two = [A4, A4];

describe("computeLayout", () => {
  it("stacks pages with the gap between them and the pad around", () => {
    const sp = { pad: 16, gap: 20 };
    const l = computeLayout(two, 1, 1000, sp);
    expect(l.tops).toEqual([16, 16 + A4.height + 20]);
    expect(l.contentHeight).toBeCloseTo(16 + 2 * A4.height + 20 + 16);
    expect(l.contentWidth).toBe(1000);
    expect(l.lefts[0]).toBeCloseTo((1000 - A4.width) / 2);
  });

  it("grows wider than the view when zoomed past it", () => {
    const l = computeLayout(two, 2, 1000, { pad: 16, gap: 20 });
    expect(l.contentWidth).toBeCloseTo(2 * A4.width + 32);
    expect(l.lefts[0]).toBeCloseTo(16);
  });

  it("has no height without pages", () => {
    expect(computeLayout([], 1, 500, { pad: 16, gap: 20 }).contentHeight).toBe(0);
  });
});

describe("fit width", () => {
  it("fills the view's width minus the pad, on a phone and a desk", () => {
    for (const w of [390, 1280]) {
      const sp = spacingFor(w);
      const z = fitWidthZoom(two, w, sp);
      const l = computeLayout(two, z, w, sp);
      expect(l.sizes[0]!.width + 2 * sp.pad).toBeCloseTo(w);
      expect(l.contentWidth).toBeCloseTo(w); // no sideways scroll
    }
  });

  it("is tighter on a phone", () => {
    expect(spacingFor(390).pad).toBeLessThan(spacingFor(1280).pad);
  });
});

describe("zoom anchor", () => {
  const sp = { pad: 16, gap: 20 };

  it("keeps the document point under the focal point exactly, on either page", () => {
    for (const [scrollTop, focalY] of [
      [0, 300],
      [900, 450],
      [1300, 200], // inside page 2
    ] as const) {
      const before = computeLayout(two, 1.1, 1000, sp);
      const focal = { x: 520, y: focalY };
      const a = captureAnchor(before, 0, scrollTop, focal)!;
      for (const z of [0.5, 1.6, 3]) {
        const after = computeLayout(two, z, 1000, sp);
        const s = scrollForAnchor(after, a);
        // The same page fraction now lies at scroll + focal.
        const i = a.page;
        const y = after.tops[i]! + a.fy * after.sizes[i]!.height;
        const x = after.lefts[i]! + a.fx * after.sizes[i]!.width;
        if (s.scrollTop > 0) expect(s.scrollTop + focal.y).toBeCloseTo(y);
        if (s.scrollLeft > 0) expect(s.scrollLeft + focal.x).toBeCloseTo(x);
      }
    }
  });

  it("round-trips through a zoom and back without drifting", () => {
    const l1 = computeLayout(two, 1.2, 1000, sp);
    const focal = { x: 500, y: 400 };
    const a = captureAnchor(l1, 0, 1400, focal)!;
    const l2 = computeLayout(two, 2.4, 1000, sp);
    const s2 = scrollForAnchor(l2, a);
    const b = captureAnchor(l2, s2.scrollLeft, s2.scrollTop, focal)!;
    const s1 = scrollForAnchor(l1, b);
    expect(s1.scrollTop).toBeCloseTo(1400, 6);
  });

  it("is null without pages", () => {
    expect(captureAnchor(computeLayout([], 1, 500, sp), 0, 0, { x: 0, y: 0 })).toBeNull();
  });
});

describe("navState", () => {
  const sp = { pad: 16, gap: 20 };
  const l = computeLayout(two, 1, 1000, sp);
  const view = 800;
  const max = l.contentHeight - view;

  it("is page 1 at the top", () => {
    expect(navState(l, 0, view)).toEqual({ index: 0, atStart: true, atEnd: false });
  });

  it("moves to page 2 once its top passes a third of the view", () => {
    expect(navState(l, l.tops[1]! - view / 3 - 5, view).index).toBe(0);
    expect(navState(l, l.tops[1]! - view / 3 + 5, view).index).toBe(1);
  });

  it("is the last page at the very end, even when it is short", () => {
    const short = computeLayout([A4, { width: A4.width, height: 200 }], 1, 1000, sp);
    const end = short.contentHeight - view;
    expect(navState(short, end, view)).toEqual({ index: 1, atStart: false, atEnd: true });
    expect(navState(l, max, view).atEnd).toBe(true);
  });

  it("when the whole document fits, it is page 1 and there is nowhere to go", () => {
    const small = computeLayout(two, 0.3, 1000, sp);
    expect(navState(small, 0, 2000)).toEqual({ index: 0, atStart: true, atEnd: true });
  });

  it("has no current page without pages", () => {
    expect(navState(computeLayout([], 1, 500, sp), 0, 500).index).toBe(-1);
  });
});
