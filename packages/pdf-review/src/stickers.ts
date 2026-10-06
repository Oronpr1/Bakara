/**
 * Where a note's sticker goes beside its area, how stickers on one page keep
 * out of each other's way, and where a mark's preview card opens. CSS pixels
 * of the displayed page; pure.
 */
import type { PixelRect, Point, Size } from "./geometry";

/** A sticker's box, CSS px (its touch target is larger, in CSS). */
export const STICKER_SIZE: Size = { width: 28, height: 28 };

/** Gap between a sticker and its neighbours / the area it sits beside, CSS px. */
export const STICKER_GAP = 3;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(lo, hi), Math.max(lo, v));

/** Which edge of its area a sticker sits beside. Hebrew letters start on the right. */
export type StickerSide = "right" | "left";

/**
 * Where a sticker goes for one area, before neighbours are considered: just
 * outside the area's `side` edge (in the margin, for a line of a letter),
 * vertically centred on a short area or aligned with the top of a tall one,
 * and always fully on the page (when there is no room outside it moves over
 * the area). Returns the sticker's top-left.
 */
export function stickerPosition(area: PixelRect, page: Size, sticker: Size = STICKER_SIZE, side: StickerSide = "right"): Point {
  const x = side === "right" ? area.left + area.width + STICKER_GAP : area.left - STICKER_GAP - sticker.width;
  const y = area.top + (Math.min(area.height, sticker.height) - sticker.height) / 2;
  return {
    x: clamp(x, 0, page.width - sticker.width),
    y: clamp(y, 0, page.height - sticker.height),
  };
}

export interface StickerItem {
  id: string;
  area: PixelRect;
}

const overlaps = (a: Point, b: Point, s: Size): boolean =>
  Math.abs(a.x - b.x) < s.width + STICKER_GAP && Math.abs(a.y - b.y) < s.height + STICKER_GAP;

/**
 * Positions for every sticker on one page. Each starts at stickerPosition();
 * one that would cover a sticker already placed (two notes on one line) steps
 * down below it, and when it runs out of page, steps across instead. Items
 * are placed top to bottom so the order on screen follows the page.
 */
export function layoutStickers(
  items: readonly StickerItem[],
  page: Size,
  sticker: Size = STICKER_SIZE,
  side: StickerSide = "right",
): Map<string, Point> {
  const out = new Map<string, Point>();
  const placed: Point[] = [];
  const order = [...items].sort((a, b) => a.area.top - b.area.top || b.area.left + b.area.width - (a.area.left + a.area.width));
  const stepY = sticker.height + STICKER_GAP;
  const stepX = (side === "right" ? -1 : 1) * (sticker.width + STICKER_GAP);
  for (const it of order) {
    const base = stickerPosition(it.area, page, sticker, side);
    let p = base;
    // Bounded search: a column of slots below, then the next column across.
    for (let tries = 0; tries < 64 && placed.some((q) => overlaps(p, q, sticker)); tries++) {
      const down = p.y + stepY;
      if (down <= page.height - sticker.height) p = { x: p.x, y: down };
      else {
        const across = p.x + stepX;
        if (across < 0 || across > page.width - sticker.width) break;
        p = { x: across, y: base.y };
      }
    }
    placed.push(p);
    out.set(it.id, p);
  }
  return out;
}

export interface PreviewPlacement {
  left: number;
  width: number;
  /** Set when the preview opens below the anchor. */
  top?: number;
  /** Set when it opens above: distance from the page's bottom edge. */
  bottom?: number;
}

/**
 * Where a mark's preview card opens: right-aligned with `anchor` (RTL), at
 * most `maxWidth` wide and kept `margin` px inside the page; below the anchor
 * unless there is too little room there and more above.
 */
export function previewPlacement(
  anchor: PixelRect,
  page: Size,
  maxWidth = 260,
  estHeight = 120,
  margin = 8,
): PreviewPlacement {
  const width = Math.max(0, Math.min(maxWidth, page.width - 2 * margin));
  const left = clamp(anchor.left + anchor.width - width, margin, page.width - width - margin);
  const gap = 6;
  const below = anchor.top + anchor.height + gap;
  const roomBelow = page.height - below;
  const roomAbove = anchor.top - gap;
  if (roomBelow >= estHeight || roomBelow >= roomAbove) return { left, width, top: below };
  return { left, width, bottom: page.height - roomAbove };
}
