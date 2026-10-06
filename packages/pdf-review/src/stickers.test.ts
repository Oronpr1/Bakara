import { describe, expect, it } from "vitest";
import {
  STICKER_GAP,
  STICKER_SIZE,
  TAP_AREA,
  layoutStickers,
  previewPlacement,
  resolveMarkGesture,
  stickerFace,
  stickerPosition,
  tapRectAt,
} from "./stickers";

const page = { width: 800, height: 1131 }; // an A4 page at ~1.0 zoom, CSS px
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("tapRectAt", () => {
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
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(page.width + 1e-9);
      expect(r.top + r.height).toBeLessThanOrEqual(page.height + 1e-9);
      expect(r.width).toBeCloseTo(TAP_AREA.width * page.width);
      expect(r.height).toBeCloseTo(TAP_AREA.height * page.height);
    }
  });

  it("is the whole page when asked for more than the page", () => {
    expect(tapRectAt({ x: 10, y: 10 }, page, { width: 2, height: 3 })).toEqual({
      left: 0,
      top: 0,
      width: page.width,
      height: page.height,
    });
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
      expect(g?.kind).toBe("tap");
      expect(g?.rect).toEqual(tapRectAt({ x: 400, y: 500 }, page));
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
    expect(g.rect.height).toBeCloseTo(TAP_AREA.height * page.height);
  });

  it("clamps a drag that leaves the page", () => {
    const g = resolveMarkGesture({ x: 700, y: 1000 }, { x: 900, y: 1300 }, page)!;
    expect(g.rect).toEqual({ left: 700, top: 1000, width: 100, height: 131 });
  });

  it("with tapArea null a tap marks nothing (the old rule)", () => {
    expect(resolveMarkGesture({ x: 10, y: 10 }, { x: 12, y: 11 }, page, { tapArea: null })).toBeNull();
    expect(resolveMarkGesture({ x: 10, y: 10 }, { x: 200, y: 12 }, page, { tapArea: null })).toBeNull();
  });
});

describe("stickerPosition", () => {
  const s = STICKER_SIZE;

  it("sits just outside the area's right edge, centred on a short area", () => {
    const area = { left: 300, top: 200, width: 300, height: 20 };
    const p = stickerPosition(area, page);
    expect(p.x).toBe(600 + STICKER_GAP);
    expect(p.y + s.height / 2).toBe(210);
  });

  it("aligns with the top of a tall area", () => {
    const p = stickerPosition({ left: 100, top: 400, width: 200, height: 300 }, page);
    expect(p.y).toBe(400);
  });

  it("can sit on the left edge instead", () => {
    const p = stickerPosition({ left: 300, top: 200, width: 300, height: 40 }, page, s, "left");
    expect(p.x).toBe(300 - STICKER_GAP - s.width);
  });

  it("moves over the area when there is no room outside, and never leaves the page", () => {
    const p = stickerPosition({ left: 500, top: -5, width: 300, height: 10 }, page);
    expect(p.x).toBe(page.width - s.width);
    expect(p.y).toBe(0);
    const q = stickerPosition({ left: 0, top: page.height - 4, width: 10, height: 4 }, page, s, "left");
    expect(q.x).toBe(0);
    expect(q.y).toBe(page.height - s.height);
  });
});

describe("layoutStickers", () => {
  it("leaves stickers that do not collide where they are", () => {
    const m = layoutStickers(
      [
        { id: "a", area: { left: 100, top: 100, width: 300, height: 20 } },
        { id: "b", area: { left: 100, top: 400, width: 300, height: 20 } },
      ],
      page,
    );
    expect(m.get("a")).toEqual(stickerPosition({ left: 100, top: 100, width: 300, height: 20 }, page));
    expect(m.get("b")).toEqual(stickerPosition({ left: 100, top: 400, width: 300, height: 20 }, page));
  });

  it("stacks two comments on one line instead of covering one with the other", () => {
    const m = layoutStickers(
      [
        { id: "a", area: { left: 100, top: 100, width: 300, height: 20 } },
        { id: "b", area: { left: 50, top: 100, width: 350, height: 20 } },
        { id: "c", area: { left: 200, top: 102, width: 200, height: 20 } },
      ],
      page,
    );
    const pts = [...m.values()];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const apart =
          Math.abs(pts[i]!.x - pts[j]!.x) >= STICKER_SIZE.width + STICKER_GAP ||
          Math.abs(pts[i]!.y - pts[j]!.y) >= STICKER_SIZE.height + STICKER_GAP;
        expect(apart).toBe(true);
      }
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(page.height - STICKER_SIZE.height);
    }
  });

  it("steps across when a column at the page bottom is full", () => {
    const area = { left: 100, top: page.height - 10, width: 300, height: 10 };
    const m = layoutStickers(
      [
        { id: "a", area },
        { id: "b", area },
      ],
      page,
    );
    const a = m.get("a")!;
    const b = m.get("b")!;
    expect(b.y).toBe(a.y);
    expect(a.x - b.x).toBe(STICKER_SIZE.width + STICKER_GAP);
  });
});

describe("previewPlacement", () => {
  it("opens below a sticker near the top, right-aligned with it", () => {
    const st = { left: 500, top: 100, width: 28, height: 28 };
    const p = previewPlacement(st, page, 260);
    expect(p.width).toBe(260);
    expect(p.left + p.width).toBe(528);
    expect(p.top).toBe(134);
    expect(p.bottom).toBeUndefined();
  });

  it("opens above a sticker near the bottom", () => {
    const st = { left: 500, top: page.height - 40, width: 28, height: 28 };
    const p = previewPlacement(st, page, 260);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(page.height - (st.top - 6));
  });

  it("stays inside a narrow page", () => {
    const narrow = { width: 200, height: 300 };
    const p = previewPlacement({ left: 2, top: 10, width: 28, height: 28 }, narrow, 260);
    expect(p.width).toBe(184);
    expect(p.left).toBe(8);
    expect(close(p.left + p.width, 192)).toBe(true);
  });
});

describe("stickerFace", () => {
  it("shows a short label and falls back to the serial number", () => {
    expect(stickerFace("3", 1)).toBe("3");
    expect(stickerFace("חדשה", 9)).toBe("חדשה");
    expect(stickerFace("שם המסלול שגוי", 2)).toBe("2");
    expect(stickerFace(undefined, 4)).toBe("4");
    expect(stickerFace("  ", 5)).toBe("5");
  });
});
