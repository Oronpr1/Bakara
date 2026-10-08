/**
 * Pure geometry for the marks a reviewer puts on a page — a note, an X, a
 * line — and for editing a draft one: placing by tap or drag, moving,
 * resizing, moving a line's ends. CSS pixels of the displayed page, origin at
 * its top-left, as in ./geometry.ts; no DOM, no pdf.js.
 *
 * pdf-guard (same author) places its sticky note with a single click and
 * treats a press that barely moved as a tap (src/ui/Viewer.tsx, MARKUP_TAP_PX);
 * the tap-or-drag split below follows the same idea.
 */
import {
  MIN_DRAW_PX,
  clampPoint,
  clampRectToPage,
  meetsMinSize,
  rectFromDrag,
  type PixelRect,
  type Point,
  type Size,
} from "./geometry";

export type MarkKind = "NOTE" | "X" | "LINE";

/** The palette: red (default), orange, green, blue, black. */
export const MARK_COLORS = ["#d92d20", "#f59e0b", "#16a34a", "#2563eb", "#1c2024"] as const;
export const DEFAULT_MARK_COLOR = MARK_COLORS[0];

/** Hebrew names of the palette, for accessible names. Unknown colours are "צבע". */
export const COLOR_NAMES: Record<string, string> = {
  "#d92d20": "אדום",
  "#f59e0b": "כתום",
  "#16a34a": "ירוק",
  "#2563eb": "כחול",
  "#1c2024": "שחור",
};

/**
 * The area a single tap marks, as fractions of the page: about one line of a
 * letter, a little over a quarter of its width.
 */
export const TAP_AREA: Size = { width: 0.28, height: 0.045 };

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
 * The area a press at `start` released at `end` marks (a note or an X):
 *
 * - a rectangle at least `min` px on both sides is kept as drawn;
 * - a press that moved less than `min` px on both axes is a tap: the default
 *   area around the press point;
 * - a long, thin stroke (along a line of text) keeps its length and gets the
 *   tap area's thickness on the thin axis, centred on the stroke.
 *
 * With `tapArea: null` anything under `min` is nothing (the old rule).
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

/** A line closer than this to level or plumb is straightened (an underline drawn by hand is never exact). */
export const LINE_SNAP_DEG = 4;
/** A line shorter than this (CSS px) is a slip, not a line. */
export const MIN_LINE_PX = 12;

/**
 * The line a drag from `start` to `end` draws: both ends on the page, nearly
 * level / plumb lines straightened (around `start`), or null when it is too
 * short to be a line (a tap draws no line).
 */
export function lineFromDrag(
  start: Point,
  end: Point,
  page: Size,
  snapDeg: number = LINE_SNAP_DEG,
  min: number = MIN_LINE_PX,
): [Point, Point] | null {
  const a = clampPoint(start, page);
  let b = clampPoint(end, page);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < min) return null;
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (deg <= snapDeg) b = { x: b.x, y: a.y };
  else if (deg >= 90 - snapDeg) b = { x: a.x, y: b.y };
  return [a, b];
}

/** The bounding box of a set of points (a line's anchor). */
export function pointsBounds(points: readonly Point[]): PixelRect {
  if (!points.length) return { left: 0, top: 0, width: 0, height: 0 };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of points) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}

/** Where a line drawn from `a` to `b` sits as a rotated bar: its start, length and angle (degrees). */
export function lineBar(a: Point, b: Point): { x: number; y: number; length: number; angle: number } {
  return { x: a.x, y: a.y, length: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}

/** `r` moved by (dx, dy), stopping at the page's edges (its size never changes). */
export function moveRect(r: PixelRect, dx: number, dy: number, page: Size): PixelRect {
  return {
    left: clamp(r.left + dx, 0, page.width - r.width),
    top: clamp(r.top + dy, 0, page.height - r.height),
    width: r.width,
    height: r.height,
  };
}

/** All of `points` moved by (dx, dy), as one: the move stops when any of them reaches an edge. */
export function movePoints(points: readonly Point[], dx: number, dy: number, page: Size): Point[] {
  const b = pointsBounds(points);
  const mx = clamp(dx, -b.left, page.width - (b.left + b.width));
  const my = clamp(dy, -b.top, page.height - (b.top + b.height));
  return points.map((p) => ({ x: p.x + mx, y: p.y + my }));
}

export type Corner = "nw" | "ne" | "sw" | "se";

/**
 * `r` resized by dragging its `corner` to `p`: the opposite corner stays put,
 * the result stays on the page and keeps at least `min` px on each side (it
 * may flip past the fixed corner, as a drag would).
 */
export function resizeRect(r: PixelRect, corner: Corner, p: Point, page: Size, min: number = MIN_DRAW_PX): PixelRect {
  const fixed = {
    x: corner === "nw" || corner === "sw" ? r.left + r.width : r.left,
    y: corner === "nw" || corner === "ne" ? r.top + r.height : r.top,
  };
  const q = clampPoint(p, page);
  let x1 = Math.min(fixed.x, q.x);
  let x2 = Math.max(fixed.x, q.x);
  let y1 = Math.min(fixed.y, q.y);
  let y2 = Math.max(fixed.y, q.y);
  if (x2 - x1 < min) {
    if (q.x < fixed.x) x1 = Math.max(0, x2 - min);
    else x2 = Math.min(page.width, x1 + min);
  }
  if (y2 - y1 < min) {
    if (q.y < fixed.y) y1 = Math.max(0, y2 - min);
    else y2 = Math.min(page.height, y1 + min);
  }
  return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}

/** A line with its end `index` moved to `p` (on the page). */
export function moveEndpoint(points: readonly Point[], index: number, p: Point, page: Size): Point[] {
  return points.map((q, i) => (i === index ? clampPoint(p, page) : q));
}

/** Page px -> fractions of the page, rounded like anchors. */
export function normPoint(p: Point, page: Size): Point {
  const r = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1e5) / 1e5;
  return { x: r(p.x / page.width), y: r(p.y / page.height) };
}

export function pxPoint(p: Point, page: Size): Point {
  return { x: p.x * page.width, y: p.y * page.height };
}

/** "#rrggbb" -> [r, g, b], or null for anything else. */
export function parseHex(color: string | null | undefined): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color ?? "");
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour as rgba() at `alpha`. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseHex(color) ?? parseHex(DEFAULT_MARK_COLOR)!;
  return `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;
}

/** Black or white, whichever reads better on `color` (WCAG relative luminance). */
export function inkOn(color: string): "#000000" | "#ffffff" {
  const c = parseHex(color) ?? parseHex(DEFAULT_MARK_COLOR)!;
  const lin = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  // contrast with white vs with black
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? "#ffffff" : "#000000";
}

/** `color` darkened toward black by `amount` (0..1) — the sticker's folded corner. */
export function shade(color: string, amount: number): string {
  const c = parseHex(color) ?? parseHex(DEFAULT_MARK_COLOR)!;
  const f = 1 - Math.min(1, Math.max(0, amount));
  const h = (v: number) => Math.round(v * f).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/** A valid "#rrggbb" colour, or the default. */
export function markColor(color: string | null | undefined): string {
  return parseHex(color) ? color!.toLowerCase() : DEFAULT_MARK_COLOR;
}
