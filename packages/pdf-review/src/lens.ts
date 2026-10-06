/**
 * Pure math for the magnifier: which part of a page the lens shows, how a
 * point inside the lens maps back onto the page, where the lens floats, and
 * which high-resolution tiles cover it. No DOM, no pdf.js.
 *
 * Coordinate spaces:
 * - page px: CSS pixels of the displayed page (at the viewer's zoom), origin
 *   at the page's top-left — the same space as ./geometry.ts;
 * - lens px: CSS pixels inside the lens, origin at its top-left, the lens
 *   being `size` px square (drawn as a circle);
 * - tile px: device pixels of the page rendered at the lens's own scale
 *   (page px × power × devicePixelRatio), cut into square tiles.
 */
import type { PixelRect, Point, Size } from "./geometry";

/** Lens diameter, CSS px. */
export const LENS_SIZE = 160;
export const LENS_POWER = 2.5;
export const LENS_POWER_MIN = 1.5;
export const LENS_POWER_MAX = 6;
/** Each +/- (or wheel notch) moves the power by this much. */
export const LENS_POWER_STEP = 0.5;
/** Side of one high-resolution tile, device px. */
export const LENS_TILE = 512;

export function clampPower(p: number): number {
  if (!Number.isFinite(p)) return LENS_POWER;
  return Math.min(LENS_POWER_MAX, Math.max(LENS_POWER_MIN, p));
}

/** One step up (+1) or down (-1), snapped to the step grid. */
export function stepPower(p: number, dir: 1 | -1): number {
  const snapped = Math.round(clampPower(p) / LENS_POWER_STEP) * LENS_POWER_STEP;
  return clampPower(snapped + dir * LENS_POWER_STEP);
}

/** The part of the page (page px) the lens shows when centred on `center`. May extend past the page. */
export function lensSourceRect(center: Point, size: number, power: number): PixelRect {
  const side = size / power;
  return { left: center.x - side / 2, top: center.y - side / 2, width: side, height: side };
}

/** A point in the lens (lens px) -> the page point (page px) it shows. */
export function lensToPage(p: Point, center: Point, size: number, power: number): Point {
  return { x: center.x + (p.x - size / 2) / power, y: center.y + (p.y - size / 2) / power };
}

/** A page point (page px) -> where it appears in the lens (lens px); outside 0..size when not shown. */
export function pageToLens(q: Point, center: Point, size: number, power: number): Point {
  return { x: (q.x - center.x) * power + size / 2, y: (q.y - center.y) * power + size / 2 };
}

/**
 * The visible part of the page inside the lens: the source rect clipped to
 * the page, and where that lands in the lens. null when the lens shows no
 * page at all (the pointer is far out in the margin).
 */
export function lensBlit(
  center: Point,
  page: Size,
  size: number,
  power: number,
): { src: PixelRect; dest: PixelRect } | null {
  const s = lensSourceRect(center, size, power);
  const x1 = Math.max(0, s.left);
  const y1 = Math.max(0, s.top);
  const x2 = Math.min(page.width, s.left + s.width);
  const y2 = Math.min(page.height, s.top + s.height);
  if (x2 <= x1 || y2 <= y1) return null;
  const d = pageToLens({ x: x1, y: y1 }, center, size, power);
  return {
    src: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 },
    dest: { left: d.x, top: d.y, width: (x2 - x1) * power, height: (y2 - y1) * power },
  };
}

/**
 * Where the lens (top-left, in the bounds' px) floats for a pointer at
 * `pointer`, inside `bounds`.
 *
 * - "center": on the pointer (a mouse or pen hovering — the cursor sits in
 *   the middle of what it magnifies);
 * - "above": above the pointer by `gap`, so a finger does not cover it; when
 *   there is no room above, beside the finger (left, or right if no room).
 */
export function lensPlacement(
  pointer: Point,
  size: number,
  bounds: Size,
  mode: "center" | "above",
  gap = 28,
): Point {
  const fit = (x: number, y: number): Point => ({
    x: Math.min(Math.max(0, bounds.width - size), Math.max(0, x)),
    y: Math.min(Math.max(0, bounds.height - size), Math.max(0, y)),
  });
  if (mode === "center") return fit(pointer.x - size / 2, pointer.y - size / 2);
  const above = pointer.y - gap - size;
  if (above >= 0) return fit(pointer.x - size / 2, above);
  const leftX = pointer.x - gap - size;
  const x = leftX >= 0 ? leftX : pointer.x + gap;
  return fit(x, pointer.y - size / 2);
}

export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The tiles (inclusive index range) of a page rendered at `full` device px
 * that cover `rect` (same units). null when the rect misses the page.
 */
export function tileRange(rect: PixelRect, full: Size, tile = LENS_TILE): TileRange | null {
  const x1 = Math.min(full.width, rect.left + rect.width);
  const y1 = Math.min(full.height, rect.top + rect.height);
  const x0 = Math.max(0, rect.left);
  const y0 = Math.max(0, rect.top);
  if (x1 <= x0 || y1 <= y0) return null;
  return {
    x0: Math.floor(x0 / tile),
    y0: Math.floor(y0 / tile),
    x1: Math.ceil(x1 / tile) - 1,
    y1: Math.ceil(y1 / tile) - 1,
  };
}

/** Device-px box of tile (tx, ty), cut at the page's edge. */
export function tileRect(tx: number, ty: number, full: Size, tile = LENS_TILE): PixelRect {
  const left = tx * tile;
  const top = ty * tile;
  return {
    left,
    top,
    width: Math.max(0, Math.min(tile, Math.ceil(full.width) - left)),
    height: Math.max(0, Math.min(tile, Math.ceil(full.height) - top)),
  };
}

/**
 * The power actually used: the requested one, capped so that the lens never
 * asks for more than `maxTotal` × the page's zoom-1 size (pdf.js tiles at
 * absurd scales are slow and gain nothing).
 */
export function effectivePower(power: number, zoom: number, maxTotal = 12): number {
  const p = clampPower(power);
  if (!(zoom > 0)) return p;
  return Math.max(1, Math.min(p, maxTotal / zoom));
}
