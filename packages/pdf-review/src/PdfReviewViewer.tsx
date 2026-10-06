"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampPoint,
  clampRectToPage,
  normToPixelRect,
  pixelRectToNorm,
  rectFromDrag,
  scrollToReveal,
  type NormRect,
  type PixelRect,
  type Point,
  type Size,
} from "./geometry";
import {
  captureAnchor,
  computeLayout,
  fitPageZoom,
  fitWidthZoom,
  navState,
  scrollForAnchor,
  spacingFor,
  stepZoomPercent,
  type ZoomAnchor,
} from "./layout";
import {
  DEFAULT_MARK_COLOR,
  TAP_AREA,
  lineFromDrag,
  markColor,
  moveEndpoint,
  movePoints,
  moveRect,
  normPoint,
  pointsBounds,
  pxPoint,
  resizeRect,
  resolveMarkGesture,
  type MarkKind,
} from "./marks";
import { MarkToolbar, type ViewerTool } from "./MarkToolbar";
import { MarkView, percentBox, type Grip } from "./MarkView";
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
import { STICKER_SIZE, layoutStickers } from "./stickers";
import { useZoomGestures } from "./useZoomGestures";
import { clampZoom } from "./viewerGestures";
import { ZoomBar, type FitMode } from "./ZoomBar";

export type { MarkKind, ViewerTool };

/** Structurally the same as @al/domain's CommentAnchor. */
export interface ReviewAnchor extends NormRect {
  versionNumber: number;
  /** 1-based */
  page: number;
}

/** A point on the page as displayed, 0..1 of its width / height, top-left origin. */
export interface MarkPoint {
  x: number;
  y: number;
}

export interface ReviewComment extends NormRect {
  id: string;
  /** 1-based */
  page: number;
  status: string;
  /**
   * The comment's text: shown in a mark's preview card. A comment without a
   * `kind` (an area box, the original style) shows it on the box itself.
   */
  label?: string;
  /** What is drawn: a note (sticker), an X, or a line. None: an outlined area box (the original style). */
  kind?: MarkKind | null;
  /** "#rrggbb"; null/absent: red. */
  color?: string | null;
  /** A line's two ends. */
  points?: ReadonlyArray<MarkPoint> | null;
  /** The number on the mark. Default: its position in `comments`, from 1. */
  number?: string | number;
  /** Not published yet: drawn dashed, and (with onUpdateDraft / onDelete) editable. */
  draft?: boolean;
}

export interface DrawResult {
  anchor: ReviewAnchor;
  /** PNG of the marked area with a small margin, the mark drawn on it. */
  snapshot: Blob;
}

/** A new mark. `anchor` is its area (a line's: the box around it). */
export interface CreateResult extends DrawResult {
  kind: MarkKind;
  color: string;
  /** A line's two ends; absent for a note or an X. */
  points?: MarkPoint[];
}

/** A change to one of my draft marks: only the fields that changed. */
export interface DraftPatch {
  anchor?: ReviewAnchor;
  color?: string;
  points?: MarkPoint[];
}

export interface PdfReviewViewerProps {
  src: PdfSource;
  versionNumber: number;
  comments?: readonly ReviewComment[];
  selectedCommentId?: string | null;
  onSelectComment?: (id: string) => void;
  /** A click on an empty part of the page (select tool), or Escape. */
  onClearSelection?: () => void;
  /** How resolved comments are drawn; a selected one is always shown. Default "faint". */
  resolvedComments?: "faint" | "hidden";
  /** Default: any status starting with "RESOLVED". */
  isResolved?: (status: string) => boolean;
  /** Accessible name of a mark. Default: "הערה <number>" (or "הערה <label>" for an area box). */
  commentAriaLabel?: (comment: ReviewComment) => string;
  /** Show the marking tools. */
  canDraw?: boolean;
  /** Controlled tool; omit to let the viewer own it. */
  tool?: ViewerTool;
  onToolChange?: (tool: ViewerTool) => void;
  /** Older switch: true = a marking tool is active (the last one used, a note at first). */
  drawMode?: boolean;
  onDrawModeChange?: (on: boolean) => void;
  /** Controlled colour of the next mark ("#rrggbb"); omit to let the viewer own it (red at first). */
  color?: string;
  onColorChange?: (color: string) => void;
  /** A new mark was placed. */
  onCreate?: (result: CreateResult) => void;
  /** Older name for onCreate (called with the same object, only when onCreate is absent). */
  onDrawComplete?: (result: DrawResult) => void;
  /** A draft mark was moved, resized, re-coloured or had a line end moved. Without it drafts are not editable. */
  onUpdateDraft?: (id: string, patch: DraftPatch) => void;
  /** Delete a draft mark (Delete key or the toolbar button). */
  onDelete?: (id: string) => void;
  /**
   * A tap with the note or X tool marks an area of this size (fractions of
   * the page) around the point. Default { width: 0.28, height: 0.045 };
   * false: only a drag marks.
   */
  tapArea?: { width: number; height: number } | false;
  /** Device pixels per PDF point for snapshots. Default 2 × devicePixelRatio, at most 4. */
  snapshotScale?: number;
  onLoad?: (info: { doc: PDFDocumentProxy; numPages: number }) => void;
  onError?: (error: PdfOpenError) => void;
  onPageChange?: (page: number) => void;
  className?: string;
  style?: CSSProperties;
}

/** Pages within this many viewport heights of the view keep a bitmap. */
const RENDER_MARGIN = 1;
/** Re-raster pages only once the zoom has been still this long (a stretched bitmap shows meanwhile). */
const RASTER_SETTLE_MS = 140;
/** How long the "1 / 2" pill stays after scrolling stops. */
const PILL_MS = 1200;
/** How long a tool's hint stays. */
const HINT_MS = 3500;

const defaultIsResolved = (s: string) => s.startsWith("RESOLVED");

interface Draft {
  pageIndex: number;
  kind: MarkKind | "AREA";
  rect: NormRect;
  points?: MarkPoint[];
  pending?: boolean;
}

/** Geometry/colour shown instead of the comment's own while it is being edited. */
interface Edit {
  rect?: NormRect;
  points?: MarkPoint[];
  color?: string;
}

const ERROR_TEXT = {
  password: "הקובץ מוגן בסיסמה ולא ניתן להציגו.",
  engine: "רכיב התצוגה לא נטען. נסו לרענן את הדף.",
  corrupt: "לא ניתן לפתוח את הקובץ.",
};

const sig = (c: ReviewComment) =>
  `${c.x},${c.y},${c.width},${c.height},${c.color ?? ""},${(c.points ?? []).map((p) => `${p.x}:${p.y}`).join(";")}`;

export function PdfReviewViewer(props: PdfReviewViewerProps) {
  const {
    src,
    versionNumber,
    comments = [],
    selectedCommentId = null,
    resolvedComments = "faint",
    isResolved = defaultIsResolved,
    canDraw = false,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [baseSizes, setBaseSizes] = useState<Size[]>([]);
  const [error, setError] = useState<PdfOpenError | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rasterZoom, setRasterZoom] = useState(1);
  const [fit, setFit] = useState<FitMode>("width");
  const [view, setView] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [ownTool, setOwnTool] = useState<ViewerTool>("select");
  const [lastTool, setLastTool] = useState<MarkKind>("NOTE");
  const [ownColor, setOwnColor] = useState<string>(DEFAULT_MARK_COLOR);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pill, setPill] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Map<string, Edit & { base: string }>>(() => new Map());
  const [liveEdit, setLiveEdit] = useState<(Edit & { id: string }) | null>(null);
  const coarse = useMedia("(pointer: coarse)");

  const dragRef = useRef<PointerDragHandle | null>(null);
  const suppressClick = useRef<string | null>(null);
  const anchorAfterZoom = useRef<ZoomAnchor | null>(null);
  const alignPageAfterZoom = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const fitRef = useRef(fit);
  fitRef.current = fit;

  /* ---------- tool and colour (each controlled or owned) ---------- */
  const tool: ViewerTool = !canDraw
    ? "select"
    : (props.tool ??
      (props.drawMode === undefined ? ownTool : props.drawMode ? (ownTool !== "select" ? ownTool : lastTool) : "select"));
  const drawing = tool !== "select";
  const color = markColor(props.color ?? ownColor);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const coarseRef = useRef(coarse);
  coarseRef.current = coarse;
  const setTool = useCallback(
    (t: ViewerTool) => {
      const was = toolRef.current;
      setOwnTool(t);
      if (t !== "select") setLastTool(t);
      cb.current.onToolChange?.(t);
      if ((was !== "select") !== (t !== "select")) cb.current.onDrawModeChange?.(t !== "select");
      if (t !== "select" && t !== was) setHint(hintFor(t, coarseRef.current));
    },
    [],
  );

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), HINT_MS);
    return () => window.clearTimeout(t);
  }, [hint]);

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
        // Fit before the first paint, so pages never render at 100% and then again.
        const el = scrollerRef.current;
        if (fitRef.current && el && el.clientWidth > 0) {
          const v = { width: el.clientWidth, height: el.clientHeight };
          const sp = spacingFor(v.width);
          const z = clampZoom(fitRef.current === "page" ? fitPageZoom(sizes, v, sp) : fitWidthZoom(sizes, v.width, sp));
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
    if (currentPage) cb.current.onPageChange?.(currentPage);
  }, [currentPage]);

  // Track the scroller's viewport (rAF-throttled) and size; flash the page pill while scrolling.
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
    const el = scrollerRef.current;
    const a = anchorAfterZoom.current;
    const align = alignPageAfterZoom.current;
    anchorAfterZoom.current = null;
    alignPageAfterZoom.current = null;
    if (!el) return;
    if (align !== null && layout.tops[align] !== undefined) {
      el.scrollTop = Math.max(0, layout.tops[align]! - sp.pad);
      el.scrollLeft = 0;
    } else if (a) {
      const s = scrollForAnchor(layout, a);
      el.scrollLeft = s.scrollLeft;
      el.scrollTop = s.scrollTop;
    }
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-raster once the zoom settles; until then the old bitmap is stretched.
  useEffect(() => {
    if (rasterZoom === zoom) return;
    const t = window.setTimeout(() => setRasterZoom(zoom), RASTER_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [zoom, rasterZoom]);

  // Keep fitting while the view changes size.
  useEffect(() => {
    if (!fit || !view.width || !baseSizes.length) return;
    const s = spacingFor(view.width);
    const z = fit === "page" ? fitPageZoom(baseSizes, view, s) : fitWidthZoom(baseSizes, view.width, s);
    zoomTo(z, { x: view.width / 2, y: 0 });
  }, [fit, view.width, view.height, baseSizes, zoomTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const userZoom = (next: number, focal?: { x: number; y: number }) => {
    setFit(null);
    zoomTo(next, focal);
  };
  const chooseFit = (mode: "width" | "page") => {
    if (mode === "page" && nav.index >= 0) alignPageAfterZoom.current = nav.index;
    setFit(mode);
    // already at that zoom: still bring the current page into place
    if (mode === "page" && nav.index >= 0) {
      const el = scrollerRef.current;
      const z = fitPageZoom(baseSizes, view, spacingFor(view.width));
      if (el && Math.abs(clampZoom(z) - zoomRef.current) < 1e-6) {
        alignPageAfterZoom.current = null;
        el.scrollTo({ top: Math.max(0, layout.tops[nav.index]! - sp.pad), behavior: scrollBehavior() });
      }
    }
  };
  useZoomGestures(scrollerRef, innerRef, { zoom, onCommit: userZoom });

  /* ---------- navigation ---------- */
  const goToPage = (n: number) => {
    const el = scrollerRef.current;
    if (!el || !numPages) return;
    const page = Math.min(numPages, Math.max(1, Math.round(n)));
    el.scrollTo({ top: Math.max(0, layout.tops[page - 1]! - sp.pad), behavior: scrollBehavior() });
  };

  /* ---------- comments, with edits in flight ---------- */
  // An edit waits here until the host's copy of the comment changes (it caught up, or overruled it).
  useEffect(() => {
    if (!pendingEdits.size) return;
    let changed = false;
    const next = new Map(pendingEdits);
    for (const [id, e] of pendingEdits) {
      const c = comments.find((x) => x.id === id);
      if (!c || sig(c) !== e.base) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) setPendingEdits(next);
  }, [comments, pendingEdits]);

  const effective = useCallback(
    (c: ReviewComment): ReviewComment => {
      const pend = pendingEdits.get(c.id);
      const edits = [pend && pend.base === sig(c) ? pend : null, liveEdit?.id === c.id ? liveEdit : null];
      let out = c;
      for (const e of edits) {
        if (!e) continue;
        out = { ...out, ...(e.rect ?? {}), ...(e.points ? { points: e.points } : {}), ...(e.color ? { color: e.color } : {}) };
      }
      return out;
    },
    [pendingEdits, liveEdit],
  );

  const visible = useMemo(() => {
    const m = new Map<number, Array<{ c: ReviewComment; number: string }>>();
    comments.forEach((raw, i) => {
      if (isResolved(raw.status) && resolvedComments === "hidden" && raw.id !== selectedCommentId) return;
      const c = effective(raw);
      const list = m.get(c.page) ?? [];
      list.push({ c, number: String(c.number ?? i + 1) });
      m.set(c.page, list);
    });
    return m;
  }, [comments, isResolved, resolvedComments, selectedCommentId, effective]);

  const stickerSpots = useMemo(() => {
    const out = new Map<string, Point>();
    for (const [page, list] of visible) {
      const size = layout.sizes[page - 1];
      if (!size) continue;
      const notes = list.filter(({ c }) => c.kind === "NOTE");
      const spots = layoutStickers(
        notes.map(({ c }) => ({ id: c.id, area: normToPixelRect(c, size) })),
        size,
        STICKER_SIZE,
      );
      for (const [id, p] of spots) out.set(id, p);
    }
    return out;
  }, [visible, layout.sizes]);

  const selected = selectedCommentId ? comments.find((c) => c.id === selectedCommentId) : undefined;
  const canEdit = (c: ReviewComment | undefined) => !!c?.draft && !!props.onUpdateDraft;
  const canDelete = !!selected?.draft && !!props.onDelete;

  // The host selected a mark: open its preview.
  useEffect(() => {
    const c = selectedCommentId ? comments.find((x) => x.id === selectedCommentId) : undefined;
    setOpenId(c?.kind ? c.id : null);
  }, [selectedCommentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A press anywhere but on a mark closes an open preview.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.(".alpr-mark")) return;
      setOpenId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openId]);

  const activate = (c: ReviewComment) => {
    if (suppressClick.current === c.id) {
      suppressClick.current = null;
      return;
    }
    if (c.kind) setOpenId((o) => (o === c.id ? null : c.id));
    setHoverId(null); // a click decides; hovering on opens it again only after the pointer leaves
    cb.current.onSelectComment?.(c.id);
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
    if (spot) r = union(r, { left: spot.x, top: spot.y, width: STICKER_SIZE.width, height: STICKER_SIZE.height });
    const top = scrollToReveal(el.scrollTop, el.clientHeight, layout.tops[i]! + r.top, r.height);
    const left = scrollToReveal(el.scrollLeft, el.clientWidth, layout.lefts[i]! + r.left, r.width);
    if (top !== null || left !== null)
      el.scrollTo({ top: top ?? el.scrollTop, left: left ?? el.scrollLeft, behavior: scrollBehavior() });
  }, [selectedCommentId, comments, layout, numPages, stickerSpots]);

  /* ---------- editing a draft mark ---------- */
  const commitEdit = (raw: ReviewComment, edit: Edit) => {
    setPendingEdits((m) => {
      const next = new Map(m);
      const prev = next.get(raw.id);
      next.set(raw.id, { ...(prev && prev.base === sig(raw) ? prev : {}), ...edit, base: sig(raw) });
      return next;
    });
    const patch: DraftPatch = {};
    if (edit.rect) patch.anchor = { versionNumber, page: raw.page, ...edit.rect };
    if (edit.points) patch.points = edit.points;
    if (edit.color) patch.color = edit.color;
    cb.current.onUpdateDraft?.(raw.id, patch);
  };

  const pressMark = (raw: ReviewComment, grip: Grip) => (e: ReactPointerEvent) => {
    if (drawing || !canEdit(raw) || dragRef.current?.active()) return;
    const isSelected = raw.id === selectedCommentId;
    // On a touch screen a first tap selects; dragging starts once it is selected (so a swipe still scrolls).
    if (e.pointerType === "touch" && !isSelected) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const overlay = (e.currentTarget as Element).closest(".alpr-overlay");
    if (!overlay) return;
    const c = effective(raw);
    const or = overlay.getBoundingClientRect();
    const size = { width: or.width, height: or.height };
    const local = (ev: PointerPoint): Point => ({ x: ev.clientX - or.left, y: ev.clientY - or.top });
    const baseRect = normToPixelRect(c, size);
    const basePts = (c.points ?? []).map((p) => pxPoint(p, size));
    const isLine = c.kind === "LINE" && basePts.length >= 2;
    if (!isSelected) cb.current.onSelectComment?.(raw.id);

    const geometry = (ev: PointerPoint, dx: number, dy: number): { rect: PixelRect; points?: Point[] } => {
      if (grip === "body") {
        if (isLine) {
          const pts = movePoints(basePts, dx, dy, size);
          return { rect: pointsBounds(pts), points: pts };
        }
        return { rect: moveRect(baseRect, dx, dy, size) };
      }
      if (grip === 0 || grip === 1) {
        const pts = moveEndpoint(basePts, grip, local(ev), size);
        return { rect: pointsBounds(pts), points: pts };
      }
      return { rect: resizeRect(baseRect, grip, local(ev), size) };
    };
    const toEdit = (g: { rect: PixelRect; points?: Point[] }): Edit => ({
      rect: pixelRectToNorm(g.rect, size),
      ...(g.points ? { points: g.points.map((p) => normPoint(p, size)) } : {}),
    });

    dragRef.current = startPointerDrag(e, {
      threshold: grip === "body" ? 3 : 0,
      onMove: (ev, d) => setLiveEdit({ id: raw.id, ...toEdit(geometry(ev, d.dx, d.dy)) }),
      onCancel: () => {
        dragRef.current = null;
        setLiveEdit(null);
      },
      onUp: (ev, d) => {
        dragRef.current = null;
        setLiveEdit(null);
        if (!d.moved) return; // a click: selection and the preview are the click's
        suppressClick.current = raw.id;
        window.setTimeout(() => {
          if (suppressClick.current === raw.id) suppressClick.current = null;
        }, 400);
        commitEdit(raw, toEdit(geometry(ev, d.dx, d.dy)));
      },
    });
  };

  const changeColor = (c: string) => {
    setOwnColor(c);
    cb.current.onColorChange?.(c);
    if (selected && canEdit(selected) && selected.kind && markColor(effective(selected).color) !== c)
      commitEdit(selected, { color: c });
  };

  const deleteSelected = () => {
    if (!selected || !canDelete) return;
    setOpenId(null);
    cb.current.onDelete?.(selected.id);
  };

  /* ---------- placing a new mark ---------- */
  const tapArea = props.tapArea === false ? null : (props.tapArea ?? TAP_AREA);

  const finishMark = async (pageIndex: number, kind: MarkKind, rect: NormRect, points?: MarkPoint[]) => {
    if (!doc) return;
    setDraft({ pageIndex, kind, rect, points, pending: true });
    const anchor: ReviewAnchor = { versionNumber, page: pageIndex + 1, ...rect };
    const scale = cb.current.snapshotScale ?? Math.min(4, 2 * Math.max(1, window.devicePixelRatio || 1));
    const markCol = color;
    try {
      const snapshot = await renderRegionSnapshot(doc, anchor, scale, { outline: markCol, mark: { kind, points } });
      const result: CreateResult = { anchor, snapshot, kind, color: markCol, ...(points ? { points } : {}) };
      if (cb.current.onCreate) cb.current.onCreate(result);
      else cb.current.onDrawComplete?.(result);
      setTool("select"); // one mark per pick of a tool; the new draft is ready to adjust
    } catch (err) {
      console.error("[@al/pdf-review] snapshot failed", err);
    } finally {
      setDraft((d) => (d?.pending ? null : d));
    }
  };

  const startDraw = (pageIndex: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing || dragRef.current?.active() || draft?.pending) return;
    const kind = tool;
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
        if (kind === "LINE") {
          const end = clampPoint(point, size);
          const pts = [start, end];
          setDraft({
            pageIndex,
            kind,
            rect: pixelRectToNorm(pointsBounds(pts), size),
            points: pts.map((p) => normPoint(p, size)),
          });
          return;
        }
        setDraft({ pageIndex, kind, rect: pixelRectToNorm(clampRectToPage(rectFromDrag(start, point), size), size) });
      },
      onCancel: () => {
        dragRef.current = null;
        setDraft(null);
      },
      onUp: (ev) => {
        dragRef.current = null;
        const { size, point } = local(ev);
        if (kind === "LINE") {
          const line = lineFromDrag(start, point, size);
          if (!line) {
            setDraft(null);
            setHint(hintFor("LINE", coarseRef.current));
            return;
          }
          void finishMark(pageIndex, kind, pixelRectToNorm(pointsBounds(line), size), line.map((p) => normPoint(p, size)));
          return;
        }
        const mark = resolveMarkGesture(start, point, size, { tapArea });
        if (!mark) {
          setDraft(null);
          return;
        }
        void finishMark(pageIndex, kind, pixelRectToNorm(mark.rect, size));
      },
    });
  };

  useEffect(() => {
    if (!drawing) dragRef.current?.cancel();
  }, [drawing]);

  // A click on an empty part of a page (select tool) clears the selection.
  const onOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (drawing || e.target !== e.currentTarget) return;
    setOpenId(null);
    if (selectedCommentId) cb.current.onClearSelection?.();
  };

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
        if (drawing) setTool("select");
        else if (openId) setOpenId(null);
        else if (selectedCommentId && cb.current.onClearSelection) cb.current.onClearSelection();
        else return;
        e.preventDefault();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && ours && !isTyping(active) && canDelete) {
        e.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ---------- render ---------- */
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const rasterScale = rasterZoom * CSS_UNITS * dpr;
  const near = { from: view.top - view.height * RENDER_MARGIN, to: view.top + view.height * (1 + RENDER_MARGIN) };
  const shownColor = selected && canEdit(selected) && selected.kind ? markColor(effective(selected).color) : color;

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
      data-tool={tool}
      data-draw-mode={drawing || undefined}
    >
      {canDraw && (
        <MarkToolbar
          tool={tool}
          onTool={setTool}
          color={shownColor}
          onColor={changeColor}
          canDelete={canDelete}
          onDelete={deleteSelected}
        />
      )}

      <div className="alpr-stage">
        <div className="alpr-scroller" ref={scrollerRef} dir="ltr" tabIndex={0} aria-label="מסמך">
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
                    drawing={drawing}
                    onPointerDown={drawing ? startDraw(i) : undefined}
                    onClick={drawing ? undefined : onOverlayClick}
                  >
                    {list.map(({ c, number }) => {
                      const resolved = isResolved(c.status);
                      const raw = comments.find((x) => x.id === c.id) ?? c;
                      if (!c.kind)
                        return (
                          <CommentBox
                            key={c.id}
                            comment={c}
                            selected={c.id === selectedCommentId}
                            resolved={resolved}
                            ariaLabel={props.commentAriaLabel?.(c) ?? (c.label ? `הערה ${c.label}` : "הערה")}
                            editable={canEdit(raw) && !drawing}
                            onPress={pressMark(raw, "body")}
                            onSelect={() => activate(raw)}
                          />
                        );
                      const rect = normToPixelRect(c, size);
                      const status = c.draft ? " · טיוטה" : resolved ? " · נסגרה" : "";
                      return (
                        <MarkView
                          key={c.id}
                          id={c.id}
                          kind={c.kind}
                          rect={rect}
                          points={c.points?.map((p) => pxPoint(p, size))}
                          page={size}
                          color={markColor(c.color)}
                          number={number}
                          heading={`${KIND_NAME[c.kind]} ${number}${status}`}
                          body={c.label}
                          stickerPos={stickerSpots.get(c.id)}
                          open={!drawing && !liveEdit && (openId === c.id || hoverId === c.id || focusId === c.id)}
                          selected={c.id === selectedCommentId}
                          resolved={resolved}
                          draft={!!c.draft}
                          editable={canEdit(raw)}
                          inert={drawing}
                          ariaLabel={props.commentAriaLabel?.(c) ?? `${KIND_NAME[c.kind]} ${number}${status}`}
                          onPress={(e, grip) => pressMark(raw, grip)(e)}
                          onActivate={() => activate(raw)}
                          onHover={(on) => setHoverId((h) => (on ? c.id : h === c.id ? null : h))}
                          onKeyboardFocus={(on) => setFocusId((f) => (on ? c.id : f === c.id ? null : f))}
                        />
                      );
                    })}
                    {draft?.pageIndex === i && <DraftShape draft={draft} size={size} color={color} />}
                  </PageView>
                );
              })}
          </div>
        </div>

        {numPages > 1 && (
          <div className="alpr-pill" data-visible={pill || undefined} aria-hidden="true" dir="ltr">
            {currentPage} / {numPages}
          </div>
        )}
        {hint && (
          <div className="alpr-hint" role="status">
            {hint}
          </div>
        )}
      </div>

      <ZoomBar
        zoom={zoom}
        fit={fit}
        onStep={(dir) => userZoom(stepZoomPercent(zoom, dir))}
        onZoom={(z) => userZoom(z)}
        onFit={chooseFit}
        page={currentPage}
        numPages={numPages}
        atStart={nav.atStart}
        atEnd={nav.atEnd}
        onPage={goToPage}
      />
    </div>
  );
}

const KIND_NAME: Record<MarkKind, string> = { NOTE: "פתק", X: "סימון X", LINE: "קו" };

function hintFor(t: MarkKind, coarse: boolean): string {
  const tap = coarse ? "הקישו" : "לחצו";
  if (t === "NOTE") return `${tap} על המקום להוספת פתק`;
  if (t === "X") return `${tap} על מילה, או גררו מסביב לאזור`;
  return "גררו מנקודה לנקודה";
}

function DraftShape({ draft, size, color }: { draft: Draft; size: Size; color: string }) {
  const style = { "--mark": color } as CSSProperties;
  if (draft.kind === "LINE" && draft.points && draft.points.length >= 2) {
    const [a, b] = draft.points.map((p) => pxPoint(p, size)) as [Point, Point];
    return (
      <svg className="alpr-draft-svg" style={style} aria-hidden="true" width={size.width} height={size.height}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      </svg>
    );
  }
  return (
    <div className="alpr-draft" data-kind={draft.kind} data-pending={draft.pending || undefined} style={{ ...percentBox(draft.rect), ...style }} aria-hidden="true">
      {draft.kind === "X" && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0 0L100 100M100 0L0 100" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

function CommentBox(props: {
  comment: ReviewComment;
  selected: boolean;
  resolved: boolean;
  ariaLabel: string;
  editable: boolean;
  onPress: (e: ReactPointerEvent) => void;
  onSelect: () => void;
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
      data-editable={props.editable || undefined}
      data-comment-id={comment.id}
      aria-pressed={selected}
      aria-label={props.ariaLabel}
      style={percentBox(comment)}
      onPointerDown={props.editable ? props.onPress : undefined}
      onClick={props.onSelect}
    >
      {comment.label && (
        <span className="alpr-box-label" dir="auto">
          {comment.label}
        </span>
      )}
    </button>
  );
}

function union(a: PixelRect, b: PixelRect): PixelRect {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
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
