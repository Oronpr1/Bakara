/**
 * The arithmetic behind document zoom: pinch, ctrl/⌘+wheel and the zoom
 * buttons. Pure, so the hook only measures and applies.
 *
 * Taken from pdf-guard (src/ui/viewerGestures.ts, same author) with its tests.
 *
 * Coordinate space: CSS pixels. `focalX/focalY` are measured from the SCROLL
 * CONTAINER's own top-left (clientX − containerRect.left), which is the frame
 * scrollLeft/scrollTop live in.
 */

/** The zoom range every zoom path shares, so a pinch can never reach a
 *  magnification the − / + buttons cannot undo. */
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4;

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * The scale factor of a pinch: how much the gap between the two fingers has
 * grown since they went down. A degenerate start distance (two fingers on the
 * same spot) yields 1 rather than infinity.
 */
export function pinchScale(startDist: number, dist: number): number {
  if (!Number.isFinite(startDist) || !Number.isFinite(dist) || startDist <= 0 || dist <= 0) return 1;
  return dist / startDist;
}

export interface FocalScrollInput {
  scrollLeft: number;
  scrollTop: number;
  /** the focal point, measured from the scroll container's top-left */
  focalX: number;
  focalY: number;
  /** how much the CONTENT grew (1.5 = half again as big) */
  k: number;
}

/**
 * Where the scroller must land so the content point under the fingers stays
 * under the fingers.
 *
 * The content coordinate beneath the focal point is `scroll + focal`. Scaling
 * the content by k moves it to `(scroll + focal) * k`, so to leave it at the
 * same place on screen the scroller must go to `(scroll + focal) * k − focal`.
 * Negative results are clamped to 0 — a scroller cannot scroll past its start,
 * and letting a negative through would silently become 0 anyway with the
 * arithmetic no longer matching what the caller believes.
 */
export function focalScroll(i: FocalScrollInput): { scrollLeft: number; scrollTop: number } {
  const k = Number.isFinite(i.k) && i.k > 0 ? i.k : 1;
  return {
    scrollLeft: Math.max(0, (i.scrollLeft + i.focalX) * k - i.focalX),
    scrollTop: Math.max(0, (i.scrollTop + i.focalY) * k - i.focalY),
  };
}

/** A wheel line is about this many px, a page about this many — the numbers
 *  browsers themselves use when they normalize deltaMode. */
const LINE_PX = 16;
const PAGE_PX = 400;
/**
 * How hard one notch bites, per pixel of delta. Exponential, so zooming in and
 * back out over the same travel returns to exactly where it started.
 *
 * The number is set by the DISCRETE mouse wheel, which is the harsher of the
 * two inputs: one notch is ~100px of deltaY, and ln(1.25)/100 ≈ 0.0022 makes
 * that a 1.25× step — the same order as the browser's own ctrl+wheel zoom. A
 * trackpad pinch sends the same event with deltas of a few px and dozens of
 * them per gesture, so it lands on a smooth ramp of the same curve.
 */
const WHEEL_GAIN = 0.0022;
/** No single event may more than half or double the zoom — a trackpad can
 *  deliver a 400px delta in one go when the user flicks. */
const WHEEL_STEP_MAX = 2;

/**
 * The multiplicative zoom factor for one ctrl/⌘+wheel event. A NEGATIVE deltaY
 * (wheel up / pinch open on a trackpad) zooms IN, which is the convention every
 * document viewer uses.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const px = deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1);
  const f = Math.exp(-px * WHEEL_GAIN);
  return Math.min(WHEEL_STEP_MAX, Math.max(1 / WHEEL_STEP_MAX, f));
}

/** Distance between two touch points. */
export function touchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/** The point a pinch is centred on — halfway between the two fingers. */
export function touchMidpoint(
  a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number },
): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}
