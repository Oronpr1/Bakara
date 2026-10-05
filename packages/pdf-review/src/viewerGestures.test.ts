import { describe, expect, it } from 'vitest';
import {
  ZOOM_MAX, ZOOM_MIN,
  clampZoom, focalScroll, pinchScale, touchDistance, touchMidpoint, wheelZoomFactor,
} from './viewerGestures';

describe('clampZoom — the same range the status-bar buttons enforce', () => {
  it('holds the 0.3…4 range', () => {
    expect(ZOOM_MIN).toBe(0.3);
    expect(ZOOM_MAX).toBe(4);
    expect(clampZoom(0.05)).toBe(0.3);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(1.75)).toBe(1.75);
  });
  it('a broken number falls back to 1, never NaN on screen', () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
    expect(clampZoom(-Infinity)).toBe(1);
  });
});

describe('pinchScale', () => {
  it('is the ratio of the finger gap', () => {
    expect(pinchScale(100, 200)).toBe(2);
    expect(pinchScale(200, 100)).toBe(0.5);
    expect(pinchScale(120, 120)).toBe(1);
  });
  it('two fingers on the same spot do not produce infinity', () => {
    expect(pinchScale(0, 150)).toBe(1);
    expect(pinchScale(150, 0)).toBe(1);
    expect(pinchScale(NaN, 10)).toBe(1);
  });
});

describe('focalScroll — the point under the fingers stays under the fingers', () => {
  it('keeps the focal content point fixed when the content doubles', () => {
    // content point under the finger: 200 + 100 = 300 → at 2× it is 600,
    // so the scroller must sit at 600 − 100 = 500 for it to stay at x=100.
    const s = focalScroll({ scrollLeft: 200, scrollTop: 400, focalX: 100, focalY: 50, k: 2 });
    expect(s.scrollLeft).toBe(500);
    expect(s.scrollTop).toBe(850);
  });
  it('round-trips: zoom in then back out lands on the original offsets', () => {
    const start = { scrollLeft: 340, scrollTop: 120 };
    const focal = { focalX: 180, focalY: 300 };
    const inZoom = focalScroll({ ...start, ...focal, k: 1.6 });
    const back = focalScroll({ ...inZoom, ...focal, k: 1 / 1.6 });
    expect(back.scrollLeft).toBeCloseTo(start.scrollLeft, 6);
    expect(back.scrollTop).toBeCloseTo(start.scrollTop, 6);
  });
  it('never asks for a negative scroll offset', () => {
    const s = focalScroll({ scrollLeft: 0, scrollTop: 0, focalX: 200, focalY: 200, k: 0.4 });
    expect(s.scrollLeft).toBe(0);
    expect(s.scrollTop).toBe(0);
  });
  it('k = 1 (a pinch that ended where it began) moves nothing', () => {
    expect(focalScroll({ scrollLeft: 77, scrollTop: 88, focalX: 10, focalY: 20, k: 1 }))
      .toEqual({ scrollLeft: 77, scrollTop: 88 });
  });
});

describe('wheelZoomFactor — ctrl/⌘+wheel, the desktop trackpad pinch', () => {
  it('wheel UP (negative deltaY) zooms in, wheel down zooms out', () => {
    expect(wheelZoomFactor(-50)).toBeGreaterThan(1);
    expect(wheelZoomFactor(50)).toBeLessThan(1);
  });
  it('is symmetric: in and back out returns to 1', () => {
    expect(wheelZoomFactor(-40) * wheelZoomFactor(40)).toBeCloseTo(1, 10);
  });
  it('one event can never more than double or halve the zoom', () => {
    expect(wheelZoomFactor(-100000)).toBe(2);
    expect(wheelZoomFactor(100000)).toBe(0.5);
  });
  it('one discrete wheel notch (~100px) is a browser-sized step, not a leap', () => {
    const notch = wheelZoomFactor(-100);
    expect(notch).toBeGreaterThan(1.15);
    expect(notch).toBeLessThan(1.35);
  });
  it('honours deltaMode: a line/page delta bites harder than a pixel one', () => {
    expect(wheelZoomFactor(-3, 1)).toBeGreaterThan(wheelZoomFactor(-3, 0));
    expect(wheelZoomFactor(-1, 2)).toBeGreaterThan(wheelZoomFactor(-1, 1));
  });
  it('no movement, no zoom', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(NaN)).toBe(1);
  });
});

describe('two-finger helpers', () => {
  it('measures the gap and its midpoint', () => {
    const a = { clientX: 100, clientY: 100 }, b = { clientX: 130, clientY: 140 };
    expect(touchDistance(a, b)).toBe(50);
    expect(touchMidpoint(a, b)).toEqual({ x: 115, y: 120 });
  });
});

describe('the whole commit path, as the hook runs it', () => {
  /** What useZoomGestures does on release: clamp the committed zoom, derive
   *  the EFFECTIVE scale from it (the clamp may have eaten part of the pinch),
   *  and re-anchor with that — never with the raw finger ratio. */
  const commit = (zoomAtStart: number, rawK: number, scroll: { scrollLeft: number; scrollTop: number }, focal: { focalX: number; focalY: number }) => {
    const next = clampZoom(zoomAtStart * rawK);
    const kEff = next / zoomAtStart;
    return { next, ...focalScroll({ ...scroll, ...focal, k: kEff }) };
  };

  it('a pinch past the ceiling commits 4× and re-anchors with the scale that was ACTUALLY applied', () => {
    const r = commit(3, 4, { scrollLeft: 100, scrollTop: 100 }, { focalX: 50, focalY: 50 });
    expect(r.next).toBe(4);
    // clamped from 12× to 4×, so the content only grew by 4/3
    expect(r.scrollLeft).toBeCloseTo((100 + 50) * (4 / 3) - 50, 6);
  });

  it('a pinch that hits the floor commits 0.3 and still keeps the focal point', () => {
    const r = commit(0.4, 0.1, { scrollLeft: 800, scrollTop: 600 }, { focalX: 180, focalY: 320 });
    expect(r.next).toBe(0.3);
    expect(r.scrollLeft).toBeCloseTo((800 + 180) * 0.75 - 180, 6);
  });
});
