"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampPoint,
  clampRectToPage,
  normToPixelRect,
  pageIndexAt,
  pixelRectToNorm,
  rectFromDrag,
  scrollToReveal,
  type NormRect,
  type Point,
  type Size,
} from "./geometry";
import {
  captureAnchor,
  computeLayout,
  fitWidthZoom,
  navState,
  scrollForAnchor,
  spacingFor,
  type ZoomAnchor,
} from "./layout";
import { LENS_POWER, LENS_SIZE, clampPower, effectivePower, stepPower } from "./lens";
import { Magnifier, formatPower, type LensTarget, type MagnifierHandle } from "./Magnifier";
import { PageView } from "./PageView";
import {
  CSS_UNITS,
  PdfEngineError,
  PdfPasswordError,
  openPdf,
  renderRegionSnapshot,
  type PDFDocumentProxy,
  type PdfOpenError,
  type PdfSource,
} from "./pdf";
import { startPointerDrag, type PointerDragHandle, type PointerPoint } from "./pointerDrag";
import { StickerNote, percentBox } from "./StickerNote";
import { STICKER_SIZE, TAP_AREA, layoutStickers, resolveMarkGesture, stickerFace } from "./stickers";
import { useZoomGestures } from "./useZoomGestures";
import { clampZoom } from "./viewerGestures";

/** Structurally the same as @al/domain's CommentAnchor. */
export interface ReviewAnchor extends NormRect {
  versionNumber: number;
  /** 1-based */
  page: number;
}

export interface ReviewComment extends NormRect {
  id: string;
  /** 1-based */
  page: number;
  status: string;
  /**
   * Short text shown on the box, e.g. the comment's number. In sticker style a
   * label of up to 4 characters is the sticker's face; a longer one is shown
   * in its preview and the face shows the comment's position in `comments`.
   */
  label?: string;
  /** Sticker style: the text its preview shows (e.g. the start of the comment). */
  text?: string;
  /** Not published yet: drawn with a dashed outline. */
  draft?: boolean;
}

export interface DrawResult {
  anchor: ReviewAnchor;
  /** PNG of the marked area with a small margin. */
  snapshot: Blob;
}

export interface MagnifierOptions {
  /** Starting magnification over the page as displayed. Default 2.5 (1.5–6). */
  power?: number;
  /** Lens diameter, CSS px. Default 160. */
  size?: number;
}

export interface PdfReviewViewerProps {
  src: PdfSource;
  versionNumber: number;
  comments?: readonly ReviewComment[];
  selectedCommentId?: string | null;
  onSelectComment?: (id: string) => void;
  /** How resolved comments are drawn; a selected one is always shown. Default "faint". */
  resolvedComments?: "faint" | "hidden";
  /** Default: any status starting with "RESOLVED". */
  isResolved?: (status: string) => boolean;
  /** Accessible name of a comment box or sticker. Default: "הערה <label>". */
  commentAriaLabel?: (comment: ReviewComment) => string;
  /**
   * "box" (default): an outlined box over each marked area.
   * "sticker": a small numbered note beside the area that opens to a preview
   * on hover, keyboard focus or click/tap.
   */
  commentStyle?: "box" | "sticker";
  /** Offer the draw-mode toggle. */
  canDraw?: boolean;
  /** Controlled draw mode; omit to let the viewer own it. */
  drawMode?: boolean;
  onDrawModeChange?: (on: boolean) => void;
  onDrawComplete?: (result: DrawResult) => void;
  /**
   * In draw mode a single tap/click marks an area of this size (fractions of
   * the page) around the point. Default { width: 0.28, height: 0.045 };
   * false: only a drag marks.
   */
  tapArea?: { width: number; height: number } | false;
  /** The magnifier button: shown unless false; an object sets its defaults. */
  magnifier?: boolean | MagnifierOptions;
  /** Controlled magnifier mode; omit to let the viewer own it. */
  magnifierMode?: boolean;
  onMagnifierModeChange?: (on: boolean) => void;
  /** The floating bar that explains and ends draw / magnifier mode. Default true. */
  modeBar?: boolean;
  /** Device pixels per PDF point for snapshots. Default 2 × devicePixelRatio, at most 4. */
  snapshotScale?: number;
  onLoad?: (info: { doc: PDFDocumentProxy; numPages: number }) => void;
  onError?: (error: PdfOpenError) => void;
  onPageChange?: (page: number) => void;
  className?: string;
  style?: CSSProperties;
}

const ZOOM_STEP = 1.2;
/** Pages within this many viewport heights of the view keep a bitmap. */
const RENDER_MARGIN = 1;
/** Re-raster pages only once the zoom has been still this long (a stretched bitmap shows meanwhile). */
const RASTER_SETTLE_MS = 140;
/** How long the "1 / 2" pill stays after scrolling stops. */
const PILL_MS = 1200;
/** Touch: hold this long in magnifier mode before the lens appears… */
const HOLD_MS = 260;
/** …without moving more than this (a move is a scroll). */
const HOLD_SLOP = 8;
/** Alt+wheel: this much delta per power step. */
const WHEEL_POWER_DELTA = 60;

const defaultIsResolved = (s: string) => s.startsWith("RESOLVED");
const defaultAriaLabel = (c: ReviewComment) => (c.label ? `הערה ${c.label}` : "הערה");

interface Draft {
  pageIndex: number;
  rect: NormRect;
  pending?: boolean;
}

const ERROR_TEXT = {
  password: "הקובץ מוגן בסיסמה ולא ניתן להציגו.",
  engine: "רכיב התצוגה לא נטען. נסו לרענן את הדף.",
  corrupt: "לא ניתן לפתוח את הקובץ.",
};

export function PdfReviewViewer(props: PdfReviewViewerProps) {
  const {
    src,
    versionNumber,
    comments = [],
    selectedCommentId = null,
    resolvedComments = "faint",
    isResolved = defaultIsResolved,
    commentAriaLabel = defaultAriaLabel,
    commentStyle = "box",
    canDraw = false,
    modeBar = true,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<MagnifierHandle>(null);
  const cb = useRef(props);
  cb.current = props;

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [baseSizes, setBaseSizes] = useState<Size[]>([]);
  const [error, setError] = useState<PdfOpenError | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rasterZoom, setRasterZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [view, setView] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [ownDrawMode, setOwnDrawMode] = useState(false);
  const [ownMagnifier, setOwnMagnifier] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const [pill, setPill] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const coarse = useMedia("(pointer: coarse)");

  const magnifierOpts = typeof props.magnifier === "object" ? props.magnifier : {};
  const magnifierAvailable = props.magnifier !== false;
  const lensSize = magnifierOpts.size ?? LENS_SIZE;
  const [lensPower, setLensPower] = useState(() => clampPower(magnifierOpts.power ?? LENS_POWER));

  const dragRef = useRef<PointerDragHandle | null>(null);
  const anchorAfterZoom = useRef<ZoomAnchor | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const fitRef = useRef(fitWidth);
  fitRef.current = fitWidth;

  const drawMode = canDraw && (props.drawMode ?? ownDrawMode);
  const magnifying = magnifierAvailable && !drawMode && (props.magnifierMode ?? ownMagnifier);

  const setMagnifierMode = useCallback((on: boolean) => {
    setOwnMagnifier(on);
    cb.current.onMagnifierModeChange?.(on);
  }, []);
  const setDrawMode = useCallback(
    (on: boolean) => {
      setOwnDrawMode(on);
      cb.current.onDrawModeChange?.(on);
      if (on && magnifying) setMagnifierMode(false); // one mode at a time
    },
    [magnifying, setMagnifierMode],
  );
  const toggleMagnifier = () => {
    if (!magnifying && drawMode) setDrawMode(false);
    setMagnifierMode(!magnifying);
  };

  /* ---------- loading ---------- */
  useEffect(() => {
    setDoc(null);
    setBaseSizes([]);
    setError(null);
    setOpenId(null);
    const opened = openPdf(src);
    let live = true;
    opened.promise
      .then(async (d) => {
        const pages = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1)));
        if (!live) return;
        const sizes = pages.map((p) => {
          const vp = p.getViewport({ scale: CSS_UNITS });
          return { width: vp.width, height: vp.height };
        });
        // Fit the width before the first paint, so pages never render at 100% and then again.
        const w = scrollerRef.current?.clientWidth ?? 0;
        if (fitRef.current && w > 0) {
          const z = clampZoom(fitWidthZoom(sizes, w, spacingFor(w)));
          setZoom(z);
          setRasterZoom(z);
        }
        setBaseSizes(sizes);
        setDoc(d);
        cb.current.onLoad?.({ doc: d, numPages: d.numPages });
      })
      .catch((err: PdfOpenError) => {
        if (!live) return;
        setError(err);
        cb.current.onError?.(err);
      });
    return () => {
      live = false;
      opened.destroy();
    };
  }, [src]);

  /* ---------- layout (all derived from page sizes and zoom) ---------- */
  const sp = spacingFor(view.width);
  const layout = useMemo(
    () => computeLayout(baseSizes, zoom, view.width, sp),
    [baseSizes, zoom, view.width, sp.pad, sp.gap], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const numPages = baseSizes.length;
  const nav = navState(layout, view.top, view.height);
  const currentPage = nav.index + 1;

  useEffect(() => {
    if (!currentPage) return;
    setPageInput(String(currentPage));
    cb.current.onPageChange?.(currentPage);
  }, [currentPage]);

  // Track the scroller's viewport (rAF-throttled) and size; flash the page pill while scrolling.
  const onScrollExtra = useRef<() => void>(() => {});
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    let pillTimer = 0;
    const measure = () => {
      frame = 0;
      setView((v) =>
        v.top === el.scrollTop && v.left === el.scrollLeft && v.width === el.clientWidth && v.height === el.clientHeight
          ? v
          : { top: el.scrollTop, left: el.scrollLeft, width: el.clientWidth, height: el.clientHeight },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onScroll = () => {
      schedule();
      onScrollExtra.current();
      setPill(true);
      window.clearTimeout(pillTimer);
      pillTimer = window.setTimeout(() => setPill(false), PILL_MS);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(pillTimer);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  /* ---------- zoom ---------- */
  const zoomTo = useCallback((next: number, focal?: { x: number; y: number }) => {
    const el = scrollerRef.current;
    const z = clampZoom(next);
    if (!el || Math.abs(z - zoomRef.current) < 1e-6) return;
    const f = focal ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    anchorAfterZoom.current = captureAnchor(layoutRef.current, el.scrollLeft, el.scrollTop, f);
    setZoom(z);
  }, []);

  // Put the anchored point back under the focal point, before the browser paints.
  useLayoutEffect(() => {
    const a = anchorAfterZoom.current;
    const el = scrollerRef.current;
    anchorAfterZoom.current = null;
    if (a && el) {
      const s = scrollForAnchor(layout, a);
      el.scrollLeft = s.scrollLeft;
      el.scrollTop = s.scrollTop;
    }
    refreshLens();
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-raster once the zoom settles; until then the old bitmap is stretched.
  useEffect(() => {
    if (rasterZoom === zoom) return;
    const t = window.setTimeout(() => setRasterZoom(zoom), RASTER_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [zoom, rasterZoom]);

  useEffect(() => {
    if (!fitWidth || !view.width || !baseSizes.length) return;
    zoomTo(fitWidthZoom(baseSizes, view.width, spacingFor(view.width)), { x: view.width / 2, y: 0 });
  }, [fitWidth, view.width, baseSizes, zoomTo]);

  const userZoom = (next: number, focal?: { x: number; y: number }) => {
    setFitWidth(false);
    zoomTo(next, focal);
  };
  useZoomGestures(scrollerRef, innerRef, { zoom, onCommit: userZoom });

  /* ---------- navigation ---------- */
  const goToPage = (n: number) => {
    const el = scrollerRef.current;
    if (!el || !numPages) return;
    const page = Math.min(numPages, Math.max(1, Math.round(n)));
    el.scrollTo({ top: Math.max(0, layout.tops[page - 1]! - sp.pad), behavior: scrollBehavior() });
  };

  /* ---------- comments ---------- */
  const visible = useMemo(() => {
    const m = new Map<number, Array<{ c: ReviewComment; serial: number }>>();
    comments.forEach((c, i) => {
      if (isResolved(c.status) && resolvedComments === "hidden" && c.id !== selectedCommentId) return;
      const list = m.get(c.page) ?? [];
      list.push({ c, serial: i + 1 });
      m.set(c.page, list);
    });
    return m;
  }, [comments, isResolved, resolvedComments, selectedCommentId]);

  const stickerSpots = useMemo(() => {
    const out = new Map<string, Point>();
    if (commentStyle !== "sticker") return out;
    for (const [page, list] of visible) {
      const size = layout.sizes[page - 1];
      if (!size) continue;
      const spots = layoutStickers(
        list.map(({ c }) => ({ id: c.id, area: normToPixelRect(c, size) })),
        size,
        STICKER_SIZE,
      );
      for (const [id, p] of spots) out.set(id, p);
    }
    return out;
  }, [commentStyle, visible, layout.sizes]);

  // The host selected a comment: open its sticker.
  useEffect(() => {
    if (commentStyle === "sticker") setOpenId(selectedCommentId);
  }, [selectedCommentId, commentStyle]);

  // A press anywhere but on a sticker closes an open preview.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.(".alpr-sticker, .alpr-note-area")) return;
      setOpenId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openId]);

  const activate = (id: string) => {
    setOpenId((o) => (o === id ? null : id));
    cb.current.onSelectComment?.(id);
  };

  // Bring the selected comment into view (once per selection, once the layout exists).
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCommentId) {
      revealed.current = null;
      return;
    }
    const el = scrollerRef.current;
    const c = comments.find((x) => x.id === selectedCommentId);
    if (!el || !c || !numPages || revealed.current === selectedCommentId) return;
    const i = c.page - 1;
    const size = layout.sizes[i];
    if (!size) return;
    revealed.current = selectedCommentId;
    let r = normToPixelRect(c, size);
    const spot = stickerSpots.get(c.id);
    if (spot) {
      const left = Math.min(r.left, spot.x);
      const top = Math.min(r.top, spot.y);
      r = {
        left,
        top,
        width: Math.max(r.left + r.width, spot.x + STICKER_SIZE.width) - left,
        height: Math.max(r.top + r.height, spot.y + STICKER_SIZE.height) - top,
      };
    }
    const top = scrollToReveal(el.scrollTop, el.clientHeight, layout.tops[i]! + r.top, r.height);
    const left = scrollToReveal(el.scrollLeft, el.clientWidth, layout.lefts[i]! + r.left, r.width);
    if (top !== null || left !== null)
      el.scrollTo({ top: top ?? el.scrollTop, left: left ?? el.scrollLeft, behavior: scrollBehavior() });
  }, [selectedCommentId, comments, layout, numPages, stickerSpots]);

  /* ---------- drawing ---------- */
  const tapArea = props.tapArea === false ? null : (props.tapArea ?? TAP_AREA);

  const finishDraw = async (pageIndex: number, rect: NormRect) => {
    if (!doc) return;
    setDraft({ pageIndex, rect, pending: true });
    const anchor: ReviewAnchor = { versionNumber, page: pageIndex + 1, ...rect };
    const scale = cb.current.snapshotScale ?? Math.min(4, 2 * Math.max(1, window.devicePixelRatio || 1));
    try {
      const snapshot = await renderRegionSnapshot(doc, anchor, scale);
      cb.current.onDrawComplete?.({ anchor, snapshot });
    } catch (err) {
      console.error("[@al/pdf-review] snapshot failed", err);
    } finally {
      setDraft((d) => (d?.pending ? null : d));
    }
  };

  const startDraw = (pageIndex: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawMode || dragRef.current?.active() || draft?.pending) return;
    const overlay = e.currentTarget;
    const local = (ev: PointerPoint) => {
      const r = overlay.getBoundingClientRect();
      return { size: { width: r.width, height: r.height }, point: { x: ev.clientX - r.left, y: ev.clientY - r.top } };
    };
    const first = local(e);
    const start = clampPoint(first.point, first.size);
    dragRef.current = startPointerDrag(e, {
      threshold: 0,
      onMove: (ev) => {
        const { size, point } = local(ev);
        const rect = clampRectToPage(rectFromDrag(start, point), size);
        setDraft({ pageIndex, rect: pixelRectToNorm(rect, size) });
      },
      onCancel: () => {
        dragRef.current = null;
        setDraft(null);
      },
      onUp: (ev) => {
        dragRef.current = null;
        const { size, point } = local(ev);
        const mark = resolveMarkGesture(start, point, size, { tapArea });
        if (!mark) {
          setDraft(null);
          return;
        }
        void finishDraw(pageIndex, pixelRectToNorm(mark.rect, size));
      },
    });
  };

  useEffect(() => {
    if (!drawMode) dragRef.current?.cancel();
  }, [drawMode]);

  /* ---------- magnifier ---------- */
  const lensPointer = useRef<{ x: number; y: number; touch: boolean } | null>(null);
  const hold = useRef<{ id: number; x0: number; y0: number; x: number; y: number; timer: number; active: boolean } | null>(
    null,
  );

  const lensTargetAt = (clientX: number, clientY: number, touch: boolean): LensTarget | null => {
    const inner = innerRef.current;
    const stage = stageRef.current;
    const L = layoutRef.current;
    if (!inner || !stage || !L.sizes.length) return null;
    const ir = inner.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const cx = clientX - ir.left;
    const cy = clientY - ir.top;
    let i = Math.max(0, pageIndexAt(L.tops, cy));
    const next = i + 1;
    // In the gap between two pages the nearer one is magnified.
    if (next < L.sizes.length && cy - (L.tops[i]! + L.sizes[i]!.height) > L.tops[next]! - cy) i = next;
    return { pageIndex: i, x: cx - L.lefts[i]!, y: cy - L.tops[i]!, boxX: clientX - sr.left, boxY: clientY - sr.top, touch };
  };

  const showLensAt = (x: number, y: number, touch: boolean) => {
    lensPointer.current = { x, y, touch };
    const t = lensTargetAt(x, y, touch);
    if (t) lensRef.current?.show(t);
    else lensRef.current?.hide();
  };
  const hideLens = () => {
    lensPointer.current = null;
    lensRef.current?.hide();
  };
  const cancelHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };
  /** The content moved under a still pointer (scroll, zoom): look again. */
  function refreshLens() {
    const p = lensPointer.current;
    if (p && lensRef.current?.visible()) showLensAt(p.x, p.y, p.touch);
  }
  onScrollExtra.current = refreshLens;

  const lensHandlers = magnifying
    ? {
        onPointerDown: (e: ReactPointerEvent) => {
          if (e.pointerType !== "touch") return showLensAt(e.clientX, e.clientY, false);
          cancelHold();
          if (!e.isPrimary) return hideLens(); // a second finger: that is a pinch
          const h = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, timer: 0, active: false };
          h.timer = window.setTimeout(() => {
            h.active = true;
            showLensAt(h.x, h.y, true);
            navigator.vibrate?.(8);
          }, HOLD_MS);
          hold.current = h;
        },
        onPointerMove: (e: ReactPointerEvent) => {
          if (e.pointerType !== "touch") return showLensAt(e.clientX, e.clientY, false);
          const h = hold.current;
          if (!h || h.id !== e.pointerId) return;
          h.x = e.clientX;
          h.y = e.clientY;
          if (h.active) showLensAt(e.clientX, e.clientY, true);
          else if (Math.hypot(e.clientX - h.x0, e.clientY - h.y0) > HOLD_SLOP) cancelHold(); // a scroll
        },
        onPointerUp: (e: ReactPointerEvent) => {
          if (e.pointerType !== "touch" || hold.current?.id !== e.pointerId) return;
          cancelHold();
          hideLens();
        },
        onPointerCancel: (e: ReactPointerEvent) => {
          if (e.pointerType !== "touch") return;
          cancelHold();
          hideLens();
        },
        onPointerLeave: (e: ReactPointerEvent) => {
          if (e.pointerType !== "touch") hideLens();
        },
      }
    : {};

  // While the lens follows a finger the page must not scroll; Alt+wheel sets the power.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!magnifying || !el) return;
    let acc = 0;
    const onTouchMove = (e: TouchEvent) => {
      if (hold.current?.active && e.cancelable) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      acc += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (Math.abs(acc) < WHEEL_POWER_DELTA) return;
      const dir = acc < 0 ? 1 : -1;
      acc = 0;
      setLensPower((p) => stepPower(p, dir));
    };
    const onContextMenu = (e: Event) => {
      if (hold.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
      cancelHold();
      lensPointer.current = null;
    };
  }, [magnifying]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      const active = document.activeElement;
      const ours = !active || active === document.body || !!root?.contains(active);
      if (e.key === "Escape") {
        if (dragRef.current?.active()) {
          e.preventDefault();
          dragRef.current.cancel();
          return;
        }
        if (!ours) return;
        if (drawMode) setDrawMode(false);
        else if (magnifying) setMagnifierMode(false);
        else if (openId) setOpenId(null);
        else return;
        e.preventDefault();
        return;
      }
      if (!magnifying || !ours || e.ctrlKey || e.metaKey || e.altKey || isTyping(active)) return;
      if (e.key === "+" || e.key === "=") setLensPower((p) => stepPower(p, 1));
      else if (e.key === "-" || e.key === "_") setLensPower((p) => stepPower(p, -1));
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawMode, magnifying, openId, setDrawMode, setMagnifierMode]);

  /* ---------- render ---------- */
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const rasterScale = rasterZoom * CSS_UNITS * dpr;
  const near = { from: view.top - view.height * RENDER_MARGIN, to: view.top + view.height * (1 + RENDER_MARGIN) };
  const shownPower = effectivePower(lensPower, zoom);

  const errorText =
    error instanceof PdfPasswordError
      ? ERROR_TEXT.password
      : error instanceof PdfEngineError
        ? ERROR_TEXT.engine
        : error
          ? ERROR_TEXT.corrupt
          : null;

  return (
    <div
      ref={rootRef}
      className={["alpr-root", props.className].filter(Boolean).join(" ")}
      style={props.style}
      dir="rtl"
      data-draw-mode={drawMode || undefined}
      data-magnifier={magnifying || undefined}
      data-comment-style={commentStyle}
    >
      <div className="alpr-toolbar" role="toolbar" aria-label="כלי תצוגת מסמך">
        <div className="alpr-group">
          <button
            type="button"
            className="alpr-btn"
            aria-label="עמוד קודם"
            disabled={!numPages || nav.atStart}
            onClick={() => goToPage(currentPage - 1)}
          >
            <Icon d="M6 15l6-6 6 6" />
          </button>
          <button
            type="button"
            className="alpr-btn"
            aria-label="עמוד הבא"
            disabled={!numPages || nav.atEnd || currentPage >= numPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            <Icon d="M6 9l6 6 6-6" />
          </button>
          <label className="alpr-page-label">
            <span className="alpr-sr">מספר עמוד</span>
            <input
              className="alpr-page-input"
              inputMode="numeric"
              value={pageInput}
              disabled={!numPages}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToPage(Number(pageInput) || 1);
              }}
              onBlur={() => setPageInput(String(currentPage || 1))}
            />
            <span aria-hidden="true">/ {numPages || "–"}</span>
          </label>
          {/* a phone has no room for the field: the same "1 / 2" as plain text */}
          <span className="alpr-page-now" dir="ltr">
            <span className="alpr-sr">עמוד </span>
            {currentPage || "–"} / {numPages || "–"}
          </span>
        </div>
        <div className="alpr-group">
          <button type="button" className="alpr-btn" aria-label="הקטנה" onClick={() => userZoom(zoom / ZOOM_STEP)}>
            <Icon d="M5 12h14" />
          </button>
          <output className="alpr-zoom" aria-live="polite" aria-label="רמת הגדלה">
            {Math.round(zoom * 100)}%
          </output>
          <button type="button" className="alpr-btn" aria-label="הגדלה" onClick={() => userZoom(zoom * ZOOM_STEP)}>
            <Icon d="M5 12h14M12 5v14" />
          </button>
          <button
            type="button"
            className="alpr-btn"
            aria-label="התאמה לרוחב"
            aria-pressed={fitWidth}
            onClick={() => setFitWidth(true)}
          >
            <Icon d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
          </button>
        </div>
        {(magnifierAvailable || canDraw) && (
          <div className="alpr-group">
            {magnifierAvailable && (
              <button
                type="button"
                className="alpr-btn"
                aria-pressed={magnifying}
                aria-label="זכוכית מגדלת"
                title="זכוכית מגדלת (Esc לסגירה)"
                disabled={!doc}
                onClick={toggleMagnifier}
              >
                <Icon d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20" />
              </button>
            )}
            {canDraw && (
              <button
                type="button"
                className="alpr-btn alpr-btn-draw"
                aria-pressed={drawMode}
                aria-label="סימון אזור להערה"
                title="סימון אזור להערה (Esc לביטול)"
                onClick={() => setDrawMode(!drawMode)}
              >
                <Icon d="M4 4h6M14 4h6v6M20 14v6h-6M10 20H4v-6M4 10V4" />
                <span className="alpr-btn-text">סימון אזור</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="alpr-stage" ref={stageRef}>
        <div
          className="alpr-scroller"
          ref={scrollerRef}
          dir="ltr"
          tabIndex={0}
          aria-label="מסמך"
          {...lensHandlers}
        >
          <div
            className="alpr-pages"
            ref={innerRef}
            style={{ width: layout.contentWidth, height: numPages ? layout.contentHeight : "100%" }}
          >
            {!doc && !error && (
              <div className="alpr-message" role="status" dir="rtl">
                טוען מסמך…
              </div>
            )}
            {errorText && (
              <div className="alpr-message alpr-error" role="alert" dir="rtl">
                {errorText}
              </div>
            )}
            {doc &&
              layout.sizes.map((size, i) => {
                const top = layout.tops[i]!;
                const inRange = top + size.height >= near.from && top <= near.to;
                const inView = top + size.height >= view.top && top <= view.top + view.height;
                const list = visible.get(i + 1) ?? [];
                return (
                  <PageView
                    key={i}
                    doc={doc}
                    pageNumber={i + 1}
                    left={layout.lefts[i]!}
                    top={top}
                    width={size.width}
                    height={size.height}
                    rasterScale={rasterScale}
                    render={inRange}
                    priority={inView ? 2 : 1}
                    drawing={drawMode}
                    onPointerDown={drawMode ? startDraw(i) : undefined}
                  >
                    {commentStyle === "sticker"
                      ? list.map(({ c, serial }) => {
                          const resolved = isResolved(c.status);
                          const face = stickerFace(c.label, serial);
                          const longLabel = c.label && face !== c.label.trim() ? c.label : undefined;
                          return (
                            <StickerNote
                              key={c.id}
                              id={c.id}
                              area={c}
                              pos={stickerSpots.get(c.id) ?? { x: 0, y: 0 }}
                              page={size}
                              size={STICKER_SIZE}
                              face={face}
                              heading={`הערה ${face}${c.draft ? " · טיוטה" : resolved ? " · נסגרה" : ""}`}
                              body={c.text ?? longLabel}
                              open={!drawMode && (openId === c.id || hoverId === c.id || focusId === c.id)}
                              selected={c.id === selectedCommentId}
                              resolved={resolved}
                              draft={!!c.draft}
                              ariaLabel={commentAriaLabel(c)}
                              onActivate={() => activate(c.id)}
                              onHover={(on) => setHoverId((h) => (on ? c.id : h === c.id ? null : h))}
                              onKeyboardFocus={(on) => setFocusId((f) => (on ? c.id : f === c.id ? null : f))}
                            />
                          );
                        })
                      : list.map(({ c }) => (
                          <CommentBox
                            key={c.id}
                            comment={c}
                            selected={c.id === selectedCommentId}
                            resolved={isResolved(c.status)}
                            ariaLabel={commentAriaLabel(c)}
                            onSelect={props.onSelectComment}
                          />
                        ))}
                    {draft?.pageIndex === i && (
                      <div
                        className="alpr-draft"
                        data-pending={draft.pending || undefined}
                        style={percentBox(draft.rect)}
                        aria-hidden="true"
                      />
                    )}
                  </PageView>
                );
              })}
          </div>
        </div>

        {magnifying && doc && (
          <Magnifier
            ref={lensRef}
            doc={doc}
            zoom={zoom}
            power={lensPower}
            size={lensSize}
            pageSize={(i) => layoutRef.current.sizes[i]}
            pageCanvas={(i) => scrollerRef.current?.querySelector<HTMLCanvasElement>(`.alpr-page[data-page="${i + 1}"] canvas`) ?? null}
            bounds={() => ({ width: stageRef.current?.clientWidth ?? 0, height: stageRef.current?.clientHeight ?? 0 })}
          />
        )}

        {numPages > 1 && (
          <div className="alpr-pill" data-visible={pill || undefined} aria-hidden="true" dir="ltr">
            {currentPage} / {numPages}
          </div>
        )}

        {modeBar && drawMode && (
          <div className="alpr-modebar" role="group" aria-label="סימון אזור">
            <span className="alpr-modebar-text">
              {coarse ? "הקישו על המקום, או גררו מלבן" : "לחצו על המקום, או גררו מלבן"}
            </span>
            <button type="button" className="alpr-btn alpr-modebar-done" onClick={() => setDrawMode(false)}>
              סיום
            </button>
          </div>
        )}
        {modeBar && magnifying && (
          <div className="alpr-modebar" role="group" aria-label="זכוכית מגדלת">
            <span className="alpr-modebar-text">{coarse ? "לחיצה ארוכה וגרירה" : "הזיזו את העכבר על המסמך"}</span>
            <button
              type="button"
              className="alpr-btn"
              aria-label="פחות הגדלה בזכוכית"
              disabled={lensPower <= clampPower(0)}
              onClick={() => setLensPower((p) => stepPower(p, -1))}
            >
              <Icon d="M5 12h14" />
            </button>
            <output className="alpr-modebar-power" aria-live="polite" aria-label="הגדלת הזכוכית" dir="ltr">
              ×{formatPower(shownPower)}
            </output>
            <button
              type="button"
              className="alpr-btn"
              aria-label="יותר הגדלה בזכוכית"
              disabled={lensPower >= clampPower(Infinity)}
              onClick={() => setLensPower((p) => stepPower(p, 1))}
            >
              <Icon d="M5 12h14M12 5v14" />
            </button>
            <button
              type="button"
              className="alpr-btn"
              aria-label="סגירת הזכוכית המגדלת"
              onClick={() => setMagnifierMode(false)}
            >
              <Icon d="M6 6l12 12M18 6L6 18" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentBox(props: {
  comment: ReviewComment;
  selected: boolean;
  resolved: boolean;
  ariaLabel: string;
  onSelect?: (id: string) => void;
}) {
  const { comment, selected, resolved } = props;
  return (
    <button
      type="button"
      className="alpr-box"
      data-status={comment.status}
      data-resolved={resolved || undefined}
      data-draft={comment.draft || undefined}
      data-selected={selected || undefined}
      data-comment-id={comment.id}
      aria-pressed={selected}
      aria-label={props.ariaLabel}
      style={percentBox(comment)}
      onClick={() => props.onSelect?.(comment.id)}
    >
      {comment.label && (
        <span className="alpr-box-label" dir="auto">
          {comment.label}
        </span>
      )}
    </button>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function scrollBehavior(): ScrollBehavior {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function isTyping(el: Element | null): boolean {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
