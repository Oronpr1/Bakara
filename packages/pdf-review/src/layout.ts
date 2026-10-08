/**
 * The continuous-scroll column: where each page sits at a zoom, how to keep
 * the point under the fingers (or the cursor) still across a zoom, and which
 * page counts as "current". Pure, so it is node-testable.
 */
import { pageIndexAt, type Size } from "./geometry";

export interface ColumnLayout {
  /** Displayed page sizes at this zoom, CSS px. */
  sizes: Size[];
  tops: number[];
  lefts: number[];
  contentWidth: number;
  contentHeight: number;
}

export interface Spacing {
  /** Margin around the column. */
  pad: number;
  /** Space between pages. */
  gap: number;
}

/** Roomier spacing on a wide view, tighter on a phone so the page gets the width. */
export function spacingFor(viewWidth: number): Spacing {
  return viewWidth > 0 && viewWidth < 600 ? { pad: 8, gap: 12 } : { pad: 16, gap: 20 };
}

/** Pages stacked top to bottom and centred, each at `zoom` × its base size. */
export function computeLayout(base: readonly Size[], zoom: number, viewWidth: number, sp: Spacing): ColumnLayout {
  const sizes = base.map((s) => ({ width: s.width * zoom, height: s.height * zoom }));
  const maxW = sizes.reduce((m, s) => Math.max(m, s.width), 0);
  const contentWidth = Math.max(viewWidth, maxW + 2 * sp.pad);
  const tops: number[] = [];
  let y = sp.pad;
  for (const s of sizes) {
    tops.push(y);
    y += s.height + sp.gap;
  }
  const lefts = sizes.map((s) => (contentWidth - s.width) / 2);
  return { sizes, tops, lefts, contentWidth, contentHeight: sizes.length ? y - sp.gap + sp.pad : 0 };
}

/** The zoom at which the widest page fills the view's width. */
export function fitWidthZoom(base: readonly Size[], viewWidth: number, sp: Spacing): number {
  const maxW = base.reduce((m, s) => Math.max(m, s.width), 0);
  if (!(maxW > 0) || !(viewWidth > 0)) return 1;
  return (viewWidth - 2 * sp.pad) / maxW;
}

/** The zoom at which the largest page fits the view whole, both ways ("fit page"). */
export function fitPageZoom(base: readonly Size[], view: Size, sp: Spacing): number {
  const maxW = base.reduce((m, s) => Math.max(m, s.width), 0);
  const maxH = base.reduce((m, s) => Math.max(m, s.height), 0);
  if (!(maxW > 0) || !(maxH > 0) || !(view.width > 0) || !(view.height > 0)) return 1;
  return Math.min((view.width - 2 * sp.pad) / maxW, (view.height - 2 * sp.pad) / maxH);
}

/** Each − / + press moves the zoom this many percentage points. */
export const ZOOM_STEP_PERCENT = 5;

/**
 * One − / + step: to the next multiple of 5% in that direction (119% → 120%
 * or 115%; 120% → 125% or 115%), so a fitted zoom joins the round steps.
 */
export function stepZoomPercent(zoom: number, dir: 1 | -1, step: number = ZOOM_STEP_PERCENT): number {
  const p = zoom * 100;
  const eps = 1e-6;
  const next = dir > 0 ? (Math.floor(p / step + eps) + 1) * step : (Math.ceil(p / step - eps) - 1) * step;
  return next / 100;
}

/** What the user typed in the zoom field ("120", "120%", " 85 % ") as a zoom, or null. */
export function parseZoomInput(text: string): number | null {
  const m = /^\s*(\d{1,4}(?:[.,]\d+)?)\s*%?\s*$/.exec(text);
  if (!m) return null;
  const p = Number(m[1]!.replace(",", "."));
  return p > 0 ? p / 100 : null;
}

/** A point of the document, independent of zoom: a page and a fraction of it, plus where it was on screen. */
export interface ZoomAnchor {
  page: number;
  fx: number;
  fy: number;
  /** The point's place in the scroller's view, CSS px from its top-left. */
  focalX: number;
  focalY: number;
}

/** The document point under `focal` (view px) with the view scrolled to (scrollLeft, scrollTop). */
export function captureAnchor(
  layout: ColumnLayout,
  scrollLeft: number,
  scrollTop: number,
  focal: { x: number; y: number },
): ZoomAnchor | null {
  if (!layout.sizes.length) return null;
  const cx = scrollLeft + focal.x;
  const cy = scrollTop + focal.y;
  const page = Math.max(0, pageIndexAt(layout.tops, cy));
  const s = layout.sizes[page]!;
  return {
    page,
    fx: s.width > 0 ? (cx - layout.lefts[page]!) / s.width : 0,
    fy: s.height > 0 ? (cy - layout.tops[page]!) / s.height : 0,
    focalX: focal.x,
    focalY: focal.y,
  };
}

/**
 * The scroll position that puts the anchored document point back under its
 * focal point in a new layout. Margins and gaps do not scale with zoom, so
 * this is exact where the plain "scale the scroll offset" rule drifts.
 */
export function scrollForAnchor(layout: ColumnLayout, a: ZoomAnchor): { scrollLeft: number; scrollTop: number } {
  const i = Math.min(a.page, layout.sizes.length - 1);
  const s = layout.sizes[i];
  if (!s) return { scrollLeft: 0, scrollTop: 0 };
  return {
    scrollLeft: Math.max(0, layout.lefts[i]! + a.fx * s.width - a.focalX),
    scrollTop: Math.max(0, layout.tops[i]! + a.fy * s.height - a.focalY),
  };
}

export interface NavState {
  /** 0-based; -1 with no pages. */
  index: number;
  /** Nothing above to scroll to. */
  atStart: boolean;
  /** Nothing below to scroll to. */
  atEnd: boolean;
}

/**
 * The current page: the one under a line a third of the way down the view —
 * except that once the view is scrolled to the very end, the last page is
 * current (a short last page can never reach that line), and when the whole
 * document fits in the view, the first one is.
 */
export function navState(layout: ColumnLayout, scrollTop: number, viewHeight: number): NavState {
  const n = layout.sizes.length;
  if (!n) return { index: -1, atStart: true, atEnd: true };
  const maxScroll = Math.max(0, layout.contentHeight - viewHeight);
  const atStart = scrollTop <= 1;
  const atEnd = scrollTop >= maxScroll - 1;
  if (maxScroll <= 1) return { index: 0, atStart, atEnd }; // the whole document is in view
  if (atEnd) return { index: n - 1, atStart, atEnd };
  return { index: Math.max(0, pageIndexAt(layout.tops, scrollTop + viewHeight / 3)), atStart, atEnd };
}
