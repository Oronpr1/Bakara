/**
 * The drag primitive: pointer events with a threshold, document-level follow-up
 * listeners and best-effort pointer capture, so mouse, touch and pen all drive
 * the same gesture and a release outside the element is still heard.
 *
 * Taken from pdf-guard (src/ui/pointerDrag.ts, same author) with its tests;
 * only comments that referred to pdf-guard's own views were trimmed.
 */

/** The bits of a pointer position any consumer reads. A native PointerEvent, a
 *  React.PointerEvent and a plain synthetic test object all satisfy it. */
export interface PointerPoint {
  clientX: number;
  clientY: number;
  pointerId?: number;
  pointerType?: string;
}

/** Capture is best-effort: a synthetic / CDP-dispatched sequence has no active
 *  pointerId to capture, and the document-level listeners cover that case. */
export interface CaptureTarget {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
}

/** The pointerdown that STARTS a drag. */
export interface PointerDownLike extends PointerPoint {
  /** 0 = primary. Only consulted for a mouse (see isPrimaryPointer). */
  button?: number;
  /** false on the SECOND finger of a multi-touch gesture — never a drag. */
  isPrimary?: boolean;
  preventDefault?: () => void;
  currentTarget?: CaptureTarget | null;
}

/** How far the gesture has travelled, and whether it counts as a drag yet. */
export interface DragDelta {
  dx: number;
  dy: number;
  /** true once the gesture passed the threshold — a click has never set it */
  moved: boolean;
}

/** Where the follow-up listeners go. `document` in the app; a stub in tests. */
export interface DragListenerHost {
  addEventListener(type: string, fn: (ev: any) => void): void;
  removeEventListener(type: string, fn: (ev: any) => void): void;
}

export interface PointerDragOpts {
  /** Streamed only ONCE THE THRESHOLD IS CROSSED — the exact shape of the old
   *  `if (!moved && |dx| < 3 && |dy| < 3) return;` early-return. */
  onMove?: (ev: PointerPoint, d: DragDelta) => void;
  /** The release. `d.moved` is false for a plain click. */
  onUp?: (ev: PointerPoint, d: DragDelta) => void;
  /** pointercancel, or an explicit `cancel()` (Escape). */
  onCancel?: () => void;
  /** px of travel (per axis) below which the gesture is still a click. 3 is
   *  what every mouse gesture in the viewer has always used; 0 means "report
   *  every move", which is what the rubber-band draws want. */
  threshold?: number;
  /** false to skip setPointerCapture (nothing in the app needs it yet). */
  capture?: boolean;
  /** Test seam: where pointermove/up/cancel are listened for. */
  host?: DragListenerHost;
}

export interface PointerDragHandle {
  /** true once the gesture passed the threshold */
  moved: () => boolean;
  /** true while the gesture is live */
  active: () => boolean;
  /** end it WITHOUT onUp (Escape) */
  cancel: () => void;
}

/** Movement under this many CSS px (per axis) is a click, not a drag. */
export const DRAG_THRESHOLD = 3;

/**
 * Is this pointerdown one that starts a drag? A mouse must use the primary
 * button (a right-click belongs to the context menu, a middle-click to the
 * browser); a finger or a pen has no buttons to speak of and is always primary
 * — except for the second finger of a pinch, which announces itself with
 * `isPrimary === false` and must never start a drag.
 */
export function isPrimaryPointer(e: PointerDownLike): boolean {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') return e.isPrimary !== false;
  return (e.button ?? 0) === 0;
}

/**
 * The drags that are live right now. useZoomGestures consults this
 * when a SECOND finger lands: two fingers mean "zoom", but they must not tear a
 * gesture that is genuinely under way out from under the user.
 *
 * `travel` is deliberately measured against DRAG_THRESHOLD and not against the
 * drag's OWN threshold. A rubber-band draw runs at threshold 0, so it counts as
 * "moved" from its very first pixel — and a pinch's two fingers never land on
 * exactly the same millisecond, so the first one always jitters a little before
 * the second arrives. Judging "is this a real drag" by a fixed 3px instead
 * lets that jitter through while a deliberate move still wins.
 */
interface LiveDrag { travel: () => number; cancel: () => void }
const liveDrags = new Set<LiveDrag>();

/** Is any drag live at all? */
export const pointerDragActive = (): boolean => liveDrags.size > 0;
/** Is any live drag a REAL one (past 3px of travel)? */
export const pointerDragMoved = (): boolean => {
  for (const d of liveDrags) if (d.travel() > DRAG_THRESHOLD) return true;
  return false;
};
/** Abandon every live drag without committing — a press that a bigger gesture
 *  (a pinch) has just superseded. */
export const cancelPointerDrags = (): void => {
  for (const d of [...liveDrags]) d.cancel();
};

const inert: PointerDragHandle = { moved: () => false, active: () => false, cancel: () => {} };

/**
 * Start a drag from a pointerdown. Returns a handle; for a non-primary press
 * the handle is inert (nothing was bound, nothing will fire) so callers never
 * have to null-check.
 */
export function startPointerDrag(e: PointerDownLike, opts: PointerDragOpts): PointerDragHandle {
  if (!isPrimaryPointer(e)) return inert;

  const threshold = opts.threshold ?? DRAG_THRESHOLD;
  const host: DragListenerHost | null = opts.host
    ?? (typeof document === 'undefined' ? null : (document as unknown as DragListenerHost));

  const sx = e.clientX, sy = e.clientY;
  const id = e.pointerId;
  const target = e.currentTarget ?? null;
  let active = true;
  let moved = false;
  let dx = 0, dy = 0;
  let captured = false;

  // No native text-selection drag, no autoscroll pan, no duplicate work from
  // the compatibility mouse events. The trailing `click` survives this.
  e.preventDefault?.();

  if (opts.capture !== false && id != null && target?.setPointerCapture) {
    // Best-effort: a synthetic/CDP sequence has no active pointerId to capture.
    try { target.setPointerCapture(id); captured = true; } catch { /* inactive pointer */ }
  }

  /** Only OUR pointer drives the gesture — a second finger must not steer it. */
  const mine = (ev: PointerPoint): boolean => id == null || ev.pointerId == null || ev.pointerId === id;

  const onMove = (ev: PointerPoint) => {
    if (!active || !mine(ev)) return;
    dx = ev.clientX - sx; dy = ev.clientY - sy;
    if (!moved && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    moved = true;
    opts.onMove?.(ev, { dx, dy, moved });
  };

  const onUp = (ev: PointerPoint) => {
    if (!active || !mine(ev)) return;
    // The RELEASE coordinates are authoritative. A press→release displacement
    // past the threshold IS a drag even when every intermediate move was
    // dropped — which a CDP-dispatched sequence routinely does. A press and
    // release on the SAME pixel is never one, whatever the threshold: with
    // threshold 0 the `>=` below is otherwise true of a perfectly still click.
    dx = ev.clientX - sx; dy = ev.clientY - sy;
    if (!moved && (dx !== 0 || dy !== 0)
      && (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold)) moved = true;
    finish();
    opts.onUp?.(ev, { dx, dy, moved });
  };

  const onCancel = (ev: PointerPoint) => {
    if (!active || !mine(ev)) return;
    finish();
    opts.onCancel?.();
  };

  /** The capture went away on its own (element replaced, implicit release on
   *  the pointerup). Just stop holding a reference to it — the document-level
   *  listeners keep the gesture alive, exactly as the mouse version was. */
  const onLostCapture = () => { captured = false; };

  const detach = () => {
    host?.removeEventListener('pointermove', onMove);
    host?.removeEventListener('pointerup', onUp);
    host?.removeEventListener('pointercancel', onCancel);
    host?.removeEventListener('lostpointercapture', onLostCapture);
  };

  /** Tear everything down exactly once, before any callback runs — so a
   *  lostpointercapture that follows the pointerup can no longer reach us. */
  function finish(): void {
    if (!active) return;
    active = false;
    liveDrags.delete(record);
    detach();
    if (captured && id != null) {
      try { target?.releasePointerCapture?.(id); } catch { /* already released */ }
      captured = false;
    }
  }

  const abandon = () => {
    if (!active) return;
    finish();
    opts.onCancel?.();
  };
  const record: LiveDrag = { travel: () => Math.max(Math.abs(dx), Math.abs(dy)), cancel: abandon };
  liveDrags.add(record);

  host?.addEventListener('pointermove', onMove);
  host?.addEventListener('pointerup', onUp);
  host?.addEventListener('pointercancel', onCancel);
  host?.addEventListener('lostpointercapture', onLostCapture);

  return {
    moved: () => moved,
    active: () => active,
    cancel: abandon,
  };
}
