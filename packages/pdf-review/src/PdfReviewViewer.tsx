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
  dragToPageRect,
  pageIndexAt,
  pixelRectToNorm,
  rectFromDrag,
  scrollToReveal,
  type NormRect,
  type Size,
} from "./geometry";
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
import { useZoomGestures } from "./useZoomGestures";
import { clampZoom, focalScroll } from "./viewerGestures";

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
  /** Short text shown on the box, e.g. the comment's number. */
  label?: string;
}

export interface DrawResult {
  anchor: ReviewAnchor;
  /** PNG of the marked area with a small margin. */
  snapshot: Blob;
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
  /** Accessible name of a comment box. Default: "הערה <label>". */
  commentAriaLabel?: (comment: ReviewComment) => string;
  /** Offer the draw-mode toggle. */
  canDraw?: boolean;
  /** Controlled draw mode; omit to let the viewer own it. */
  drawMode?: boolean;
  onDrawModeChange?: (on: boolean) => void;
  onDrawComplete?: (result: DrawResult) => void;
  /** Device pixels per PDF point for snapshots. Default 2 × devicePixelRatio, at most 4. */
  snapshotScale?: number;
  onLoad?: (info: { doc: PDFDocumentProxy; numPages: number }) => void;
  onError?: (error: PdfOpenError) => void;
  onPageChange?: (page: number) => void;
  className?: string;
  style?: CSSProperties;
}

const PAD = 16;
const GAP = 16;
const ZOOM_STEP = 1.2;
/** Pages within this many viewport heights of the view keep a bitmap. */
const RENDER_MARGIN = 1;

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
    canDraw = false,
  } = props;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [baseSizes, setBaseSizes] = useState<Size[]>([]);
  const [error, setError] = useState<PdfOpenError | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [view, setView] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [ownDrawMode, setOwnDrawMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const dragRef = useRef<PointerDragHandle | null>(null);
  const anchorAfterZoom = useRef<{ scrollLeft: number; scrollTop: number; x: number; y: number; k: number } | null>(
    null,
  );

  const drawMode = canDraw && (props.drawMode ?? ownDrawMode);
  const setDrawMode = useCallback((on: boolean) => {
    setOwnDrawMode(on);
    cb.current.onDrawModeChange?.(on);
  }, []);

  /* ---------- loading ---------- */
  useEffect(() => {
    setDoc(null);
    setBaseSizes([]);
    setError(null);
    const opened = openPdf(src);
    let live = true;
    opened.promise
      .then(async (d) => {
        const pages = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1)));
        if (!live) return;
        setBaseSizes(
          pages.map((p) => {
            const vp = p.getViewport({ scale: CSS_UNITS });
            return { width: vp.width, height: vp.height };
          }),
        );
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
  const layout = useMemo(() => {
    const sizes = baseSizes.map((s) => ({ width: s.width * zoom, height: s.height * zoom }));
    const maxW = sizes.reduce((m, s) => Math.max(m, s.width), 0);
    const contentWidth = Math.max(view.width, maxW + 2 * PAD);
    const tops: number[] = [];
    let y = PAD;
    for (const s of sizes) {
      tops.push(y);
      y += s.height + GAP;
    }
    const lefts = sizes.map((s) => (contentWidth - s.width) / 2);
    return { sizes, tops, lefts, contentWidth, contentHeight: y - GAP + PAD };
  }, [baseSizes, zoom, view.width]);

  const numPages = baseSizes.length;
  const currentPage = numPages ? pageIndexAt(layout.tops, view.top + view.height / 3) + 1 : 0;

  useEffect(() => {
    if (!currentPage) return;
    setPageInput(String(currentPage));
    cb.current.onPageChange?.(currentPage);
  }, [currentPage]);

  // Track the scroller's viewport (rAF-throttled) and size.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
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
    measure();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
    };
  }, []);

  /* ---------- zoom ---------- */
  const zoomTo = useCallback(
    (next: number, focal?: { x: number; y: number }) => {
      const el = scrollerRef.current;
      const z = clampZoom(next);
      if (!el || z === zoom) return;
      const f = focal ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
      anchorAfterZoom.current = { scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, x: f.x, y: f.y, k: z / zoom };
      setZoom(z);
    },
    [zoom],
  );

  useLayoutEffect(() => {
    const a = anchorAfterZoom.current;
    const el = scrollerRef.current;
    anchorAfterZoom.current = null;
    if (!a || !el) return;
    const s = focalScroll({ scrollLeft: a.scrollLeft, scrollTop: a.scrollTop, focalX: a.x, focalY: a.y, k: a.k });
    el.scrollLeft = s.scrollLeft;
    el.scrollTop = s.scrollTop;
  }, [zoom]);

  useEffect(() => {
    if (!fitWidth || !view.width || !baseSizes.length) return;
    const maxW = baseSizes.reduce((m, s) => Math.max(m, s.width), 0);
    zoomTo((view.width - 2 * PAD) / maxW, { x: view.width / 2, y: 0 });
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
    el.scrollTo({ top: layout.tops[page - 1]! - PAD, behavior: scrollBehavior() });
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
    const top = scrollToReveal(el.scrollTop, el.clientHeight, layout.tops[i]! + c.y * size.height, c.height * size.height);
    const left = scrollToReveal(el.scrollLeft, el.clientWidth, layout.lefts[i]! + c.x * size.width, c.width * size.width);
    if (top !== null || left !== null)
      el.scrollTo({ top: top ?? el.scrollTop, left: left ?? el.scrollLeft, behavior: scrollBehavior() });
  }, [selectedCommentId, comments, layout, numPages]);

  /* ---------- drawing ---------- */
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
        const rect = dragToPageRect(start, point, size);
        if (!rect) {
          setDraft(null);
          return;
        }
        void finishDraw(pageIndex, pixelRectToNorm(rect, size));
      },
    });
  };

  // Escape cancels a drag in progress, or else leaves draw mode.
  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dragRef.current?.active()) {
        e.preventDefault();
        dragRef.current.cancel();
        return;
      }
      const root = scrollerRef.current?.parentElement;
      const active = document.activeElement;
      if (!active || active === document.body || root?.contains(active)) {
        e.preventDefault();
        setDrawMode(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawMode, setDrawMode]);

  useEffect(() => {
    if (!drawMode) dragRef.current?.cancel();
  }, [drawMode]);

  /* ---------- render ---------- */
  const byPage = useMemo(() => {
    const m = new Map<number, ReviewComment[]>();
    for (const c of comments) {
      const resolved = isResolved(c.status);
      if (resolved && resolvedComments === "hidden" && c.id !== selectedCommentId) continue;
      const list = m.get(c.page) ?? [];
      list.push(c);
      m.set(c.page, list);
    }
    return m;
  }, [comments, isResolved, resolvedComments, selectedCommentId]);

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const rasterScale = zoom * CSS_UNITS * dpr;
  const near = { from: view.top - view.height * RENDER_MARGIN, to: view.top + view.height * (1 + RENDER_MARGIN) };

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
      className={["alpr-root", props.className].filter(Boolean).join(" ")}
      style={props.style}
      dir="rtl"
      data-draw-mode={drawMode || undefined}
    >
      <div className="alpr-toolbar" role="toolbar" aria-label="כלי תצוגת מסמך">
        <div className="alpr-group">
          <button
            type="button"
            className="alpr-btn"
            aria-label="עמוד קודם"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            <Icon d="M6 15l6-6 6 6" />
          </button>
          <button
            type="button"
            className="alpr-btn"
            aria-label="עמוד הבא"
            disabled={!numPages || currentPage >= numPages}
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
        {canDraw && (
          <div className="alpr-group">
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
          </div>
        )}
      </div>

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
                  {(byPage.get(i + 1) ?? []).map((c) => (
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

function percentBox(r: NormRect): CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}

function scrollBehavior(): ScrollBehavior {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
