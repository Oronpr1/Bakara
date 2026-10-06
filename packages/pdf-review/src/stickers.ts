/**
 * Pure geometry for sticker-style comments and for placing a mark with a
 * single tap. CSS pixels of the displayed page, origin top-left, exactly as in
 * ./geometry.ts. No DOM, no pdf.js, so all of it is node-testable.
 *
 * pdf-guard (same author) places its own sticky "note" with a single click and
 * treats a press that barely moved as a tap (src/ui/Viewer.tsx, MARKUP_TAP_PX);
 * the tap-or-drag split below follows the same idea.
 */
import { MIN_DRAW_PX, clampPoint, clampRectToPage, meetsMinSize, rectFromDrag, type PixelRect, type Point, type Size } from "./geometry";

/**
 * The area a single tap marks, as fractions of the page: about one line of a
 * letter, a little over a quarter of its width.
 */
export const TAP_AREA: Size = { width: 0.28, height: 0.045 };

/** A sticker's box, CSS px. Touch hosts may scale it up; the geometry takes any size. */
export const STICKER_SIZE: Size = { width: 28, height: 28 };

/** Gap between a sticker and its neighbours / the area it sits beside, CSS px. */
export const STICKER_GAP = 3;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(lo, hi), Math.max(lo, v));

/**
 * The area a tap at `p` marks: `size` (fractions of the page) centred on the
 * point, shifted — never shrunk, unless it is larger than the page itself — so
 * that it stays on the page.
 */
export function tapRectAt(p: Point, page: Size, size: Size = TAP_AREA): PixelRect {
  const w = Math.min(page.width, Math.max(0, size.width) * page.width);
  const h = Math.min(page.height, Math.max(0, size.height) * page.height);
  const c = clampPoint(p, page);
  return {
    left: clamp(c.x - w / 2, 0, page.width - w),
    top: clamp(c.y - h / 2, 0, page.height - h),
    width: w,
    height: h,
  };
}

export interface MarkGesture {
  /** "tap": the press barely moved; "drag": a rectangle was drawn. */
  kind: "tap" | "drag";
  /** The area to mark, CSS px of the page, inside the page. */
  rect: PixelRect;
}

export interface MarkGestureOptions {
  /** Area a tap marks (fractions of the page); null turns tap-to-place off. Default TAP_AREA. */
  tapArea?: Size | null;
  /** Smallest side of a drawn rectangle, CSS px. Default MIN_DRAW_PX. */
  min?: number;
}

/**
 * What a press at `start` released at `end` marks on a page — the whole
 * decision the draw gesture makes.
 *
 * - A rectangle at least `min` px on both sides is kept as drawn.
 * - A press that moved less than `min` px on both axes is a tap: the default
 *   area around the press point.
 * - A long, thin stroke (along a line of text) keeps its length and gets the
 *   tap area's thickness on the thin axis, centred on the stroke.
 *
 * With `tapArea: null` the old rule holds: anything under `min` is nothing.
 */
export function resolveMarkGesture(start: Point, end: Point, page: Size, opts: MarkGestureOptions = {}): MarkGesture | null {
  const { tapArea = TAP_AREA, min = MIN_DRAW_PX } = opts;
  const r = clampRectToPage(rectFromDrag(clampPoint(start, page), end), page);
  if (meetsMinSize(r, min)) return { kind: "drag", rect: r };
  if (!tapArea) return null;
  if (r.width < min && r.height < min) return { kind: "tap", rect: tapRectAt(start, page, tapArea) };

  const grown = { ...r };
  if (r.height < min) {
    const h = Math.min(page.height, Math.max(min, tapArea.height * page.height));
    grown.top = clamp(r.top + r.height / 2 - h / 2, 0, page.height - h);
    grown.height = h;
  }
  if (r.width < min) {
    const w = Math.min(page.width, Math.max(min, tapArea.width * page.width));
    grown.left = clamp(r.left + r.width / 2 - w / 2, 0, page.width - w);
    grown.width = w;
  }
  return meetsMinSize(grown, min) ? { kind: "drag", rect: grown } : null;
}

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
 * one that would cover a sticker already placed (two comments on one line)
 * steps down below it, and when it runs out of page, steps across instead.
 * Items are placed top to bottom so the order on screen follows the page.
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
  /** Set when the preview opens below the sticker. */
  top?: number;
  /** Set when it opens above: distance from the page's bottom edge. */
  bottom?: number;
}

/**
 * Where a sticker's preview card opens: right-aligned with the sticker (RTL),
 * at most `maxWidth` wide and kept `margin` px inside the page; below the
 * sticker unless that sticker is in the lower part of the page and there is
 * more room above.
 */
export function previewPlacement(
  sticker: PixelRect,
  page: Size,
  maxWidth = 260,
  estHeight = 120,
  margin = 8,
): PreviewPlacement {
  const width = Math.max(0, Math.min(maxWidth, page.width - 2 * margin));
  const left = clamp(sticker.left + sticker.width - width, margin, page.width - width - margin);
  const gap = 6;
  const below = sticker.top + sticker.height + gap;
  const roomBelow = page.height - below;
  const roomAbove = sticker.top - gap;
  if (roomBelow >= estHeight || roomBelow >= roomAbove) return { left, width, top: below };
  return { left, width, bottom: page.height - roomAbove };
}

/**
 * The text on a sticker's face: the comment's label when it is short (a
 * number, "חדשה"), otherwise its 1-based position among the comments.
 */
export function stickerFace(label: string | undefined, serial: number): string {
  const t = label?.trim();
  return t && [...t].length <= 4 ? t : String(serial);
}
