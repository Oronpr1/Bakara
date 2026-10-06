"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Size } from "./geometry";
import { LENS_TILE, effectivePower, lensBlit, lensPlacement, tileRange, tileRect } from "./lens";
import { CSS_UNITS, releaseCanvas, renderPageTile, type PDFDocumentProxy } from "./pdf";
import type { RenderJob } from "./renderQueue";

/** What the lens looks at, and where the pointer is. */
export interface LensTarget {
  /** 0-based */
  pageIndex: number;
  /** The pointer on that page, page px at the current zoom (may be off the page, in a margin). */
  x: number;
  y: number;
  /** The pointer in the lens's positioning box (the viewer's document area), px. */
  boxX: number;
  boxY: number;
  /** A finger: the lens floats above it instead of on it. */
  touch: boolean;
}

export interface MagnifierHandle {
  show(target: LensTarget): void;
  hide(): void;
  visible(): boolean;
}

export interface MagnifierProps {
  doc: PDFDocumentProxy;
  /** The document's zoom. */
  zoom: number;
  /** Requested magnification over the page as displayed. */
  power: number;
  /** Lens diameter, CSS px. */
  size: number;
  /** Displayed size of a page (page px at the current zoom). */
  pageSize: (pageIndex: number) => Size | undefined;
  /** The page's current bitmap, drawn stretched until the sharp tiles arrive. */
  pageCanvas: (pageIndex: number) => HTMLCanvasElement | null;
  /** Size of the box the lens floats in. */
  bounds: () => Size;
}

/** Sharp tiles kept around: 16 × 512² × 4 bytes ≈ 16 MB at most. */
const CACHE_TILES = 16;
/** Wait for the pointer to settle this long before rendering new sharp tiles. */
const SETTLE_MS = 70;

/**
 * The magnifier lens. It is driven imperatively (show/hide on every pointer
 * move) so that following the pointer never re-renders React.
 *
 * Each frame paints the page's current bitmap, stretched — instant but soft —
 * and then every sharp tile already in the cache on top. Once the pointer
 * settles, the missing tiles of that spot are rendered by pdf.js at the lens's
 * own scale (page zoom × power × devicePixelRatio), through the shared render
 * queue, ahead of page renders. `data-sharp="true"` on the lens says the frame
 * on screen came entirely from sharp tiles.
 */
export const Magnifier = forwardRef<MagnifierHandle, MagnifierProps>(function Magnifier(props, ref) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  const st = useRef({
    target: null as LensTarget | null,
    frame: 0,
    timer: 0,
    scaleKey: "",
    cache: new Map<string, HTMLCanvasElement>(),
    jobs: new Map<string, RenderJob<HTMLCanvasElement>>(),
    bg: "",
  });

  /** Everything one frame needs, derived from the target and the props. */
  const frameFor = (t: LensTarget) => {
    const { zoom, size, pageSize } = live.current;
    const page = pageSize(t.pageIndex);
    if (!page) return null;
    const power = effectivePower(live.current.power, zoom);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const k = power * dpr; // tile px per page px
    const D = Math.round(size * dpr);
    const full = { width: page.width * k, height: page.height * k };
    const scale = zoom * CSS_UNITS * k;
    const win = { left: Math.round(t.x * k - D / 2), top: Math.round(t.y * k - D / 2), width: D, height: D };
    return { page, power, dpr, k, D, full, scale, win, range: tileRange(win, full), scaleKey: scale.toFixed(5) };
  };

  const dropCache = () => {
    const s = st.current;
    for (const c of s.cache.values()) releaseCanvas(c);
    s.cache.clear();
    for (const j of s.jobs.values()) j.cancel();
    s.jobs.clear();
  };

  const draw = () => {
    const s = st.current;
    s.frame = 0;
    const t = s.target;
    const box = boxRef.current;
    const cv = canvasRef.current;
    if (!t || !box || !cv) return;
    const f = frameFor(t);
    if (!f) return;
    const { size } = live.current;

    const at = lensPlacement({ x: t.boxX, y: t.boxY }, size, live.current.bounds(), t.touch ? "above" : "center");
    box.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    box.hidden = false;
    if (!s.bg) s.bg = getComputedStyle(box).getPropertyValue("--alpr-bg").trim() || "#eceef1";

    if (cv.width !== f.D || cv.height !== f.D) {
      cv.width = f.D;
      cv.height = f.D;
    }
    const g = cv.getContext("2d");
    if (!g) return;
    g.fillStyle = s.bg;
    g.fillRect(0, 0, f.D, f.D);

    const blit = lensBlit({ x: t.x, y: t.y }, f.page, size, f.power);
    if (!blit) {
      box.dataset.sharp = "false";
      return;
    }
    const d = f.dpr;
    g.fillStyle = "#ffffff";
    g.fillRect(blit.dest.left * d, blit.dest.top * d, blit.dest.width * d, blit.dest.height * d);

    // 1. The page's own bitmap, stretched: never an empty lens.
    const pc = live.current.pageCanvas(t.pageIndex);
    if (pc && pc.width > 0 && pc.height > 0) {
      const kx = pc.width / f.page.width;
      const ky = pc.height / f.page.height;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(
        pc,
        blit.src.left * kx,
        blit.src.top * ky,
        blit.src.width * kx,
        blit.src.height * ky,
        blit.dest.left * d,
        blit.dest.top * d,
        blit.dest.width * d,
        blit.dest.height * d,
      );
    }

    // 2. Sharp tiles on top.
    let sharp = !!f.range;
    let missing = false;
    if (f.range)
      for (let ty = f.range.y0; ty <= f.range.y1; ty++)
        for (let tx = f.range.x0; tx <= f.range.x1; tx++) {
          const key = tileKey(t.pageIndex, f.scaleKey, tx, ty);
          const tile = s.cache.get(key);
          if (!tile) {
            sharp = false;
            missing = true;
            continue;
          }
          s.cache.delete(key); // most recently used goes last
          s.cache.set(key, tile);
          g.drawImage(tile, tx * LENS_TILE - f.win.left, ty * LENS_TILE - f.win.top);
        }
    box.dataset.sharp = String(sharp);
    if (missing) settle();
  };

  const requestDraw = () => {
    const s = st.current;
    if (!s.frame) s.frame = requestAnimationFrame(draw);
  };

  const settle = () => {
    const s = st.current;
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(fetchTiles, SETTLE_MS);
  };

  /** Render the sharp tiles the lens needs right now; drop work it no longer needs. */
  const fetchTiles = () => {
    const s = st.current;
    const t = s.target;
    if (!t) return;
    const f = frameFor(t);
    if (!f) return;
    if (s.scaleKey && s.scaleKey !== f.scaleKey) dropCache(); // zoom or power changed: old tiles are useless
    s.scaleKey = f.scaleKey;
    const wanted = new Map<string, [number, number]>();
    if (f.range)
      for (let ty = f.range.y0; ty <= f.range.y1; ty++)
        for (let tx = f.range.x0; tx <= f.range.x1; tx++) wanted.set(tileKey(t.pageIndex, f.scaleKey, tx, ty), [tx, ty]);
    for (const [key, job] of s.jobs)
      if (!wanted.has(key)) {
        job.cancel();
        s.jobs.delete(key);
      }
    for (const [key, [tx, ty]] of wanted) {
      if (s.cache.has(key) || s.jobs.has(key)) continue;
      const scaleKey = f.scaleKey;
      const job = renderPageTile(live.current.doc, t.pageIndex + 1, f.scale, tileRect(tx, ty, f.full));
      s.jobs.set(key, job);
      void job.promise.then((tile) => {
        if (s.jobs.get(key) === job) s.jobs.delete(key);
        if (!tile) return;
        if (s.scaleKey !== scaleKey) {
          releaseCanvas(tile); // the zoom moved on while it rendered
          return;
        }
        s.cache.set(key, tile);
        while (s.cache.size > CACHE_TILES) {
          const oldest = s.cache.keys().next().value as string;
          releaseCanvas(s.cache.get(oldest));
          s.cache.delete(oldest);
        }
        if (s.target) requestDraw();
      });
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      show(target) {
        st.current.target = target;
        requestDraw();
      },
      hide() {
        const s = st.current;
        s.target = null;
        cancelAnimationFrame(s.frame);
        s.frame = 0;
        window.clearTimeout(s.timer);
        for (const j of s.jobs.values()) j.cancel();
        s.jobs.clear();
        if (boxRef.current) boxRef.current.hidden = true;
      },
      visible: () => !!st.current.target,
    }),
    [],
  );

  // A new zoom or power: repaint the spot under the pointer at the new scale.
  useEffect(() => {
    if (st.current.target) requestDraw();
  }, [props.zoom, props.power, props.size]); // eslint-disable-line react-hooks/exhaustive-deps

  // A different document: nothing cached belongs to it.
  useEffect(() => dropCache, [props.doc]);

  // Gone for good: free every tile and the lens's own pixels.
  useEffect(
    () => () => {
      const s = st.current;
      cancelAnimationFrame(s.frame);
      window.clearTimeout(s.timer);
      dropCache();
      releaseCanvas(canvasRef.current);
    },
    [],
  );

  const shown = effectivePower(props.power, props.zoom);
  return (
    <div
      ref={boxRef}
      className="alpr-lens"
      hidden
      aria-hidden="true"
      style={{ width: props.size, height: props.size }}
      data-power={shown}
    >
      <canvas ref={canvasRef} className="alpr-lens-canvas" />
      <span className="alpr-lens-power" dir="ltr">
        ×{formatPower(shown)}
      </span>
    </div>
  );
});

const tileKey = (pageIndex: number, scaleKey: string, tx: number, ty: number) => `${pageIndex}:${scaleKey}:${tx}:${ty}`;

export function formatPower(p: number): string {
  return (Math.round(p * 10) / 10).toString();
}
