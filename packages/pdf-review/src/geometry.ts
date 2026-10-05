/**
 * Pure geometry for review anchors. Two coordinate spaces meet here:
 *
 * - CSS pixels of a rendered page, origin at the page's top-left, as the page
 *   is displayed (the pdf.js viewport, /Rotate already applied);
 * - normalised anchor units (0..1 of that same displayed page), which is what
 *   @al/domain's CommentAnchor stores, so a mark survives any zoom level.
 *
 * Nothing here touches the DOM or pdf.js, so all of it is node-testable.
 *
 * The drag-rect and clamping rules are lifted out of pdf-guard's rubber-band
 * draw (src/ui/Viewer.tsx startDraw) and its normalised-rect clamping
 * (src/core/cropGeometry.ts), both by the same author.
 */

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in CSS (or canvas) pixels. */
export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rectangle in page-relative units, top-left origin. */
export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The displayed size of a page (a pdf.js viewport's width/height). */
export interface Size {
  width: number;
  height: number;
}

/** A drawn rectangle smaller than this (CSS px, either side) is treated as a stray click. */
export const MIN_DRAW_PX = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Anchors are stored with this many decimals: sub-pixel even on a 4K render of an A3 page. */
const ANCHOR_DECIMALS = 5;
const round = (v: number): number => {
  const f = 10 ** ANCHOR_DECIMALS;
  return Math.round(v * f) / f;
};

/** Clamp a point into the page box. */
export function clampPoint(p: Point, page: Size): Point {
  return { x: clamp(p.x, 0, page.width), y: clamp(p.y, 0, page.height) };
}

/**
 * The rectangle spanned by a drag, whichever direction it went: the press and
 * the current pointer are opposite corners, in any order.
 */
export function rectFromDrag(start: Point, end: Point): PixelRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** The part of `r` inside the page; an empty rect (zero size) when they do not overlap. */
export function clampRectToPage(r: PixelRect, page: Size): PixelRect {
  const x1 = clamp(r.left, 0, page.width);
  const y1 = clamp(r.top, 0, page.height);
  const x2 = clamp(r.left + r.width, 0, page.width);
  const y2 = clamp(r.top + r.height, 0, page.height);
  return { left: x1, top: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
}

/** Is the rect big enough on both axes to be a deliberate mark? */
export function meetsMinSize(r: PixelRect, min = MIN_DRAW_PX): boolean {
  return r.width >= min && r.height >= min;
}

/**
 * A drag, clamped to the page, as the rectangle to keep — or null when it is
 * too small to be a mark. This is the whole decision the draw gesture makes.
 */
export function dragToPageRect(start: Point, end: Point, page: Size, min = MIN_DRAW_PX): PixelRect | null {
  const r = clampRectToPage(rectFromDrag(start, end), page);
  return meetsMinSize(r, min) ? r : null;
}

/**
 * CSS-pixel rect -> normalised rect for a page of the given displayed size.
 * The result is clamped to the unit square and rounded so that
 * `x + width <= 1` and `y + height <= 1` always hold.
 */
export function pixelRectToNorm(r: PixelRect, page: Size): NormRect {
  if (!(page.width > 0) || !(page.height > 0)) throw new RangeError("page size must be positive");
  const x1 = round(clamp(r.left / page.width, 0, 1));
  const y1 = round(clamp(r.top / page.height, 0, 1));
  const x2 = round(clamp((r.left + r.width) / page.width, 0, 1));
  const y2 = round(clamp((r.top + r.height) / page.height, 0, 1));
  return { x: x1, y: y1, width: round(Math.max(0, x2 - x1)), height: round(Math.max(0, y2 - y1)) };
}

/** Normalised rect -> CSS-pixel rect for a page of the given displayed size. */
export function normToPixelRect(n: NormRect, page: Size): PixelRect {
  return {
    left: n.x * page.width,
    top: n.y * page.height,
    width: n.width * page.width,
    height: n.height * page.height,
  };
}

/**
 * The canvas region to cut for a snapshot of a marked area: the anchor on a
 * page rendered at `canvas` size, grown by `margin` pixels on every side,
 * snapped outwards to whole pixels and kept inside the canvas.
 */
export function snapshotCropRect(n: NormRect, canvas: Size, margin: number): PixelRect {
  const r = normToPixelRect(n, canvas);
  const m = Math.max(0, margin);
  const x1 = clamp(Math.floor(r.left - m), 0, canvas.width);
  const y1 = clamp(Math.floor(r.top - m), 0, canvas.height);
  const x2 = clamp(Math.ceil(r.left + r.width + m), 0, canvas.width);
  const y2 = clamp(Math.ceil(r.top + r.height + m), 0, canvas.height);
  return { left: x1, top: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

/**
 * The largest raster scale <= `scale` whose bitmap for a page of `size` (at
 * scale 1) stays within `maxPixels`. Browsers refuse or silently blank huge
 * canvases (iOS Safari caps around 16.7M pixels).
 */
export function capRasterScale(size: Size, scale: number, maxPixels: number): number {
  const area = size.width * size.height * scale * scale;
  if (!(area > maxPixels)) return scale;
  return Math.sqrt(maxPixels / (size.width * size.height));
}

/**
 * Index of the page whose box contains the vertical offset `y`, given each
 * page's top offset in ascending order (the gaps belong to the page above).
 */
export function pageIndexAt(tops: readonly number[], y: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The scroll offset (one axis) that brings the span [start, start + size] into
 * a viewport [scroll, scroll + view], or null when it is already fully visible.
 * A span larger than the view is aligned to its start; otherwise it is centred.
 */
export function scrollToReveal(scroll: number, view: number, start: number, size: number): number | null {
  if (start >= scroll && start + size <= scroll + view) return null;
  if (size >= view) return Math.max(0, start - 16);
  return Math.max(0, start + size / 2 - view / 2);
}
