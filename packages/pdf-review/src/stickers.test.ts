import { describe, expect, it } from "vitest";
import { STICKER_GAP, STICKER_SIZE, layoutStickers, previewPlacement, stickerPosition } from "./stickers";

const page = { width: 800, height: 1131 }; // an A4 page at ~1.0 zoom, CSS px

describe("stickerPosition", () => {
  const s = STICKER_SIZE;

  it("sits just outside the area's right edge, centred on a short area", () => {
    const p = stickerPosition({ left: 300, top: 200, width: 300, height: 20 }, page);
    expect(p.x).toBe(600 + STICKER_GAP);
    expect(p.y + s.height / 2).toBe(210);
  });

  it("aligns with the top of a tall area", () => {
    expect(stickerPosition({ left: 100, top: 400, width: 200, height: 300 }, page).y).toBe(400);
  });

  it("can sit on the left edge instead", () => {
    expect(stickerPosition({ left: 300, top: 200, width: 300, height: 40 }, page, s, "left").x).toBe(300 - STICKER_GAP - s.width);
  });

  it("moves over the area when there is no room outside, and never leaves the page", () => {
    const p = stickerPosition({ left: 500, top: -5, width: 300, height: 10 }, page);
    expect(p).toEqual({ x: page.width - s.width, y: 0 });
    const q = stickerPosition({ left: 0, top: page.height - 4, width: 10, height: 4 }, page, s, "left");
    expect(q).toEqual({ x: 0, y: page.height - s.height });
  });
});

describe("layoutStickers", () => {
  it("leaves stickers that do not collide where they are", () => {
    const a = { left: 100, top: 100, width: 300, height: 20 };
    const b = { left: 100, top: 400, width: 300, height: 20 };
    const m = layoutStickers([{ id: "a", area: a }, { id: "b", area: b }], page);
    expect(m.get("a")).toEqual(stickerPosition(a, page));
    expect(m.get("b")).toEqual(stickerPosition(b, page));
  });

  it("stacks notes on one line instead of covering one with another", () => {
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
  });

  it("steps across when a column at the page bottom is full", () => {
    const area = { left: 100, top: page.height - 10, width: 300, height: 10 };
    const m = layoutStickers([{ id: "a", area }, { id: "b", area }], page);
    const a = m.get("a")!;
    const b = m.get("b")!;
    expect(b.y).toBe(a.y);
    expect(a.x - b.x).toBe(STICKER_SIZE.width + STICKER_GAP);
  });
});

describe("previewPlacement", () => {
  it("opens below an anchor near the top, right-aligned with it", () => {
    const p = previewPlacement({ left: 500, top: 100, width: 28, height: 28 }, page, 260);
    expect(p).toEqual({ left: 268, width: 260, top: 134 });
  });

  it("opens above an anchor near the bottom", () => {
    const st = { left: 500, top: page.height - 40, width: 28, height: 28 };
    const p = previewPlacement(st, page, 260);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(page.height - (st.top - 6));
  });

  it("stays inside a narrow page", () => {
    const p = previewPlacement({ left: 2, top: 10, width: 28, height: 28 }, { width: 200, height: 300 }, 260);
    expect(p.width).toBe(184);
    expect(p.left).toBe(8);
  });
});
