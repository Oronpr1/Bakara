import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD, DragListenerHost, PointerDownLike, PointerPoint,
  isPrimaryPointer, pointerDragActive, startPointerDrag,
} from './pointerDrag';

/** The drag primitive driven by synthetic pointer sequences (from pdf-guard, src/ui/pointerDrag.test.ts). */

/** A `document` stand-in that records what is bound and can dispatch to it. */
function stubHost() {
  const bound = new Map<string, Set<(ev: any) => void>>();
  const host: DragListenerHost = {
    addEventListener(type, fn) {
      if (!bound.has(type)) bound.set(type, new Set());
      bound.get(type)!.add(fn);
    },
    removeEventListener(type, fn) { bound.get(type)?.delete(fn); },
  };
  return {
    host,
    count: () => [...bound.values()].reduce((n, s) => n + s.size, 0),
    fire(type: string, ev: PointerPoint) { [...(bound.get(type) ?? [])].forEach(fn => fn(ev)); },
  };
}

const down = (x: number, y: number, extra: Partial<PointerDownLike> = {}): PointerDownLike => ({
  clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: 0, ...extra,
});
const at = (x: number, y: number, pointerId = 7): PointerPoint => ({ clientX: x, clientY: y, pointerId });

/** Record every callback the primitive makes, in order. */
function recorder() {
  const moves: Array<{ dx: number; dy: number; moved: boolean }> = [];
  const ups: Array<{ dx: number; dy: number; moved: boolean }> = [];
  let cancels = 0;
  return {
    moves, ups, get cancels() { return cancels; },
    opts: {
      onMove: (_e: PointerPoint, d: any) => { moves.push({ ...d }); },
      onUp: (_e: PointerPoint, d: any) => { ups.push({ ...d }); },
      onCancel: () => { cancels++; },
    },
  };
}

describe('startPointerDrag — the one drag primitive', () => {
  it('down → moves → up streams deltas past the threshold and commits ONCE', () => {
    const h = stubHost();
    const r = recorder();
    const drag = startPointerDrag(down(100, 100), { ...r.opts, host: h.host });

    expect(drag.active()).toBe(true);
    for (let i = 1; i <= 5; i++) h.fire('pointermove', at(100 + i * 10, 100 + i * 6));
    h.fire('pointerup', at(150, 130));

    expect(r.moves).toHaveLength(5);
    expect(r.moves[0]).toEqual({ dx: 10, dy: 6, moved: true });
    expect(r.moves[4]).toEqual({ dx: 50, dy: 30, moved: true });
    expect(r.ups).toEqual([{ dx: 50, dy: 30, moved: true }]);   // exactly one commit
    expect(r.cancels).toBe(0);
    expect(drag.active()).toBe(false);
    expect(drag.moved()).toBe(true);
  });

  it('a press that never passes the threshold is a CLICK: no onMove at all, onUp with moved=false', () => {
    const h = stubHost();
    const r = recorder();
    const drag = startPointerDrag(down(40, 40), { ...r.opts, host: h.host });

    h.fire('pointermove', at(41, 41));
    h.fire('pointermove', at(42, 42));          // 2px — still under DRAG_THRESHOLD
    h.fire('pointerup', at(42, 42));

    expect(DRAG_THRESHOLD).toBe(3);
    expect(r.moves).toEqual([]);                 // the old `if (!moved && …) return`
    expect(r.ups).toEqual([{ dx: 2, dy: 2, moved: false }]);
    expect(drag.moved()).toBe(false);
  });

  it('crosses the threshold on the RELEASE alone when every move was dropped (the CDP shape)', () => {
    const h = stubHost();
    const r = recorder();
    startPointerDrag(down(0, 0), { ...r.opts, host: h.host });
    h.fire('pointerup', at(60, 36));             // no pointermove ever arrived

    expect(r.ups).toEqual([{ dx: 60, dy: 36, moved: true }]);
  });

  it('threshold 0 reports every move — what the rubber-band draws need', () => {
    const h = stubHost();
    const r = recorder();
    startPointerDrag(down(10, 10), { ...r.opts, threshold: 0, host: h.host });

    h.fire('pointermove', at(11, 10));
    h.fire('pointermove', at(12, 10));
    h.fire('pointerup', at(12, 10));

    expect(r.moves.map(m => m.dx)).toEqual([1, 2]);
    expect(r.ups[0]?.moved).toBe(true);
  });

  it('…but a press and release on the SAME pixel is still not a drag, even at threshold 0', () => {
    const h = stubHost();
    const r = recorder();
    startPointerDrag(down(10, 10), { ...r.opts, threshold: 0, host: h.host });
    h.fire('pointerup', at(10, 10));

    expect(r.ups).toEqual([{ dx: 0, dy: 0, moved: false }]);
  });

  it('pointercancel abandons: onCancel once, never onUp', () => {
    const h = stubHost();
    const r = recorder();
    const drag = startPointerDrag(down(0, 0), { ...r.opts, host: h.host });

    h.fire('pointermove', at(30, 30));
    h.fire('pointercancel', at(30, 30));

    expect(r.cancels).toBe(1);
    expect(r.ups).toEqual([]);
    expect(drag.active()).toBe(false);
    expect(h.count()).toBe(0);                   // and it cleaned up after itself
  });

  it('cancel() ends the gesture without a commit (Escape)', () => {
    const h = stubHost();
    const r = recorder();
    const drag = startPointerDrag(down(0, 0), { ...r.opts, threshold: 0, host: h.host });

    h.fire('pointermove', at(20, 0));
    drag.cancel();
    h.fire('pointermove', at(40, 0));            // after the cancel: ignored
    h.fire('pointerup', at(40, 0));

    expect(r.cancels).toBe(1);
    expect(r.moves).toHaveLength(1);
    expect(r.ups).toEqual([]);
    expect(h.count()).toBe(0);
  });

  it('a NON-PRIMARY mouse button starts nothing (the right-click menu keeps it)', () => {
    const h = stubHost();
    const r = recorder();
    const drag = startPointerDrag(down(0, 0, { button: 2 }), { ...r.opts, host: h.host });

    h.fire('pointermove', at(50, 50));
    h.fire('pointerup', at(50, 50));

    expect(drag.active()).toBe(false);
    expect(h.count()).toBe(0);                   // nothing was ever bound
    expect(r.moves).toEqual([]);
    expect(r.ups).toEqual([]);
  });

  it('pen and touch are always primary; the SECOND finger of a pinch is not', () => {
    expect(isPrimaryPointer({ clientX: 0, clientY: 0, pointerType: 'touch', button: 0 })).toBe(true);
    expect(isPrimaryPointer({ clientX: 0, clientY: 0, pointerType: 'pen', button: 5 })).toBe(true);
    expect(isPrimaryPointer({ clientX: 0, clientY: 0, pointerType: 'touch', isPrimary: false })).toBe(false);
    expect(isPrimaryPointer({ clientX: 0, clientY: 0, pointerType: 'mouse', button: 1 })).toBe(false);
  });

  it('only OUR pointer drives the gesture — another finger`s events are ignored', () => {
    const h = stubHost();
    const r = recorder();
    startPointerDrag(down(0, 0), { ...r.opts, host: h.host });

    h.fire('pointermove', at(99, 99, 8));        // a different pointerId
    h.fire('pointerup', at(99, 99, 8));
    expect(r.moves).toEqual([]);
    expect(r.ups).toEqual([]);

    h.fire('pointerup', at(20, 20));             // ours
    expect(r.ups).toEqual([{ dx: 20, dy: 20, moved: true }]);
  });

  it('captures the pointer on the element and releases it on the way out', () => {
    const h = stubHost();
    const captured: number[] = [];
    const released: number[] = [];
    startPointerDrag(
      down(0, 0, {
        currentTarget: {
          setPointerCapture: id => captured.push(id),
          releasePointerCapture: id => released.push(id),
        },
      }),
      { host: h.host },
    );
    expect(captured).toEqual([7]);
    h.fire('pointerup', at(1, 1));
    expect(released).toEqual([7]);
  });

  it('a lostpointercapture does NOT kill a live drag (the events still bubble to us)', () => {
    const h = stubHost();
    const r = recorder();
    startPointerDrag(down(0, 0), { ...r.opts, host: h.host });

    h.fire('lostpointercapture', at(0, 0));      // React replaced the node, say
    h.fire('pointermove', at(50, 0));
    h.fire('pointerup', at(50, 0));

    expect(r.cancels).toBe(0);
    expect(r.ups).toEqual([{ dx: 50, dy: 0, moved: true }]);
  });

  it('pointerDragActive() is true only while a drag is live (the pinch gate)', () => {
    const h = stubHost();
    expect(pointerDragActive()).toBe(false);
    startPointerDrag(down(0, 0), { host: h.host });
    expect(pointerDragActive()).toBe(true);
    h.fire('pointerup', at(0, 0));
    expect(pointerDragActive()).toBe(false);
  });
});
