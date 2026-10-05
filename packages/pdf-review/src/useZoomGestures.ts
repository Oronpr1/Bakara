import { useEffect, useRef, type RefObject } from "react";
import { cancelPointerDrags, pointerDragActive, pointerDragMoved } from "./pointerDrag";
import { clampZoom, pinchScale, touchDistance, touchMidpoint, wheelZoomFactor } from "./viewerGestures";

/**
 * Pinch and ctrl/⌘+wheel zoom. A live gesture only paints a CSS transform on
 * the page column (no React, no canvas work); the real zoom is committed once,
 * on release, together with the focal point the caller re-anchors around.
 *
 * Adapted from pdf-guard (src/ui/useViewerGestures.ts, same author), without
 * its double-tap and tool-specific rules.
 */
export interface ZoomGestureOptions {
  zoom: number;
  /** Commit a zoom; `focal` is the client point to keep still, relative to the scroller. */
  onCommit: (zoom: number, focal: { x: number; y: number }) => void;
}

const WHEEL_COMMIT_MS = 80;

interface Preview {
  k: number;
  originX: number;
  originY: number;
  focalX: number;
  focalY: number;
  zoomAtStart: number;
}

export function useZoomGestures(
  scrollRef: RefObject<HTMLElement | null>,
  innerRef: RefObject<HTMLElement | null>,
  opts: ZoomGestureOptions,
): void {
  const live = useRef(opts);
  live.current = opts;

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let preview: Preview | null = null;
    let pinchStart = 0;
    let pinching = false;
    let wheelTimer = 0;

    const paint = () => {
      const el = innerRef.current;
      if (!el || !preview) return;
      el.style.transformOrigin = `${preview.originX}px ${preview.originY}px`;
      el.style.transform = `scale(${preview.k})`;
    };
    const unpaint = () => {
      const el = innerRef.current;
      if (!el) return;
      el.style.transform = "";
      el.style.transformOrigin = "";
    };

    const begin = (clientX: number, clientY: number): boolean => {
      const el = innerRef.current;
      if (!el) return false;
      const ir = el.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      preview = {
        k: 1,
        originX: clientX - ir.left,
        originY: clientY - ir.top,
        focalX: clientX - rr.left,
        focalY: clientY - rr.top,
        zoomAtStart: live.current.zoom,
      };
      return true;
    };

    const scaleTo = (rawK: number) => {
      if (!preview) return;
      preview.k = clampZoom(preview.zoomAtStart * rawK) / preview.zoomAtStart;
      paint();
    };

    const commit = () => {
      const p = preview;
      preview = null;
      if (!p) return;
      unpaint();
      const next = clampZoom(p.zoomAtStart * p.k);
      if (Math.abs(next - p.zoomAtStart) < 0.0005) return;
      live.current.onCommit(next, { x: p.focalX, y: p.focalY });
    };

    const abandon = () => {
      preview = null;
      pinching = false;
      pinchStart = 0;
      unpaint();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2 || pinching) return;
      // A drag that is really under way keeps the pointer; one that has only
      // been armed (the first finger of a pinch always is) yields to the zoom.
      if (pointerDragMoved()) return;
      if (pointerDragActive()) cancelPointerDrags();
      const a = e.touches[0]!;
      const b = e.touches[1]!;
      const d = touchDistance(a, b);
      if (d < 1) return;
      const mid = touchMidpoint(a, b);
      if (!begin(mid.x, mid.y)) return;
      pinchStart = d;
      pinching = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || !preview || e.touches.length < 2) return;
      e.preventDefault(); // ours, not the browser's page zoom
      scaleTo(pinchScale(pinchStart, touchDistance(e.touches[0]!, e.touches[1]!)));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinching && e.touches.length < 2) {
        pinching = false;
        pinchStart = 0;
        commit();
      }
    };

    const onTouchCancel = () => {
      if (pinching) abandon();
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a plain wheel scrolls
      e.preventDefault();
      if (pinching || pointerDragActive()) return;
      if (!preview && !begin(e.clientX, e.clientY)) return;
      if (!preview) return;
      scaleTo(preview.k * wheelZoomFactor(e.deltaY, e.deltaMode) || 1);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(commit, WHEEL_COMMIT_MS);
    };

    // iOS Safari ignores touch-action for page zoom and fires these instead.
    const onSafariGesture = (e: Event) => {
      const t = e.target as Node | null;
      if (t && root.contains(t)) e.preventDefault();
    };

    const nonPassive: AddEventListenerOptions = { passive: false };
    root.addEventListener("touchstart", onTouchStart, nonPassive);
    root.addEventListener("touchmove", onTouchMove, nonPassive);
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchCancel);
    root.addEventListener("wheel", onWheel, nonPassive);
    document.addEventListener("gesturestart", onSafariGesture, nonPassive);
    document.addEventListener("gesturechange", onSafariGesture, nonPassive);

    return () => {
      window.clearTimeout(wheelTimer);
      abandon();
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
      root.removeEventListener("wheel", onWheel);
      document.removeEventListener("gesturestart", onSafariGesture);
      document.removeEventListener("gesturechange", onSafariGesture);
    };
  }, [scrollRef, innerRef]);
}
