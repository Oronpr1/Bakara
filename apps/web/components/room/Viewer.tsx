"use client";

// A thin wrapper around @al/pdf-review's viewer, so the room does not depend on its details and a
// richer viewer (notes on the page, a magnifier) can replace it in one place. It adds one thing:
// on a phone a tap marks a small area around the finger ("סיכה"), not only a drag.
import {
  configurePdfWorker,
  MIN_DRAW_PX,
  PdfReviewViewer,
  renderRegionSnapshot,
  type DrawResult,
  type PDFDocumentProxy,
  type ReviewComment,
} from "@al/pdf-review";
import "@al/pdf-review/styles.css";
import { useEffect, useRef } from "react";

configurePdfWorker("/pdf.worker.min.mjs");

export type { DrawResult, ReviewComment };

export interface ViewerProps {
  src: string;
  versionNumber: number;
  comments: ReviewComment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  canDraw: boolean;
  drawMode: boolean;
  onDrawModeChange: (on: boolean) => void;
  onDraw: (result: DrawResult) => void;
  showResolved: boolean;
  className?: string;
}

/** Size of the area a tap marks, in CSS pixels of the page as shown. */
const TAP_BOX = { width: 150, height: 44 };
const round = (v: number) => Math.round(v * 1e5) / 1e5;

export function Viewer(props: ViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // Tap to mark: a press on the page that does not move becomes a small box around the point.
  // A real drag is left to the viewer (it draws the rectangle itself).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !props.drawMode) return;
    let start: { x: number; y: number; id: number; page: HTMLElement } | null = null;
    const down = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const page = target?.closest?.(".alpr-page") as HTMLElement | null;
      if (!page || !target?.closest(".alpr-overlay") || target.closest(".alpr-box")) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, page };
    };
    const up = (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s || e.pointerId !== s.id) return;
      if (Math.abs(e.clientX - s.x) >= MIN_DRAW_PX || Math.abs(e.clientY - s.y) >= MIN_DRAW_PX) return;
      const doc = docRef.current;
      const r = s.page.getBoundingClientRect();
      const pageNumber = Number(s.page.dataset.page);
      if (!doc || !pageNumber || r.width <= 0 || r.height <= 0) return;
      const width = Math.min(0.6, TAP_BOX.width / r.width);
      const height = Math.min(0.3, TAP_BOX.height / r.height);
      const cx = (s.x - r.left) / r.width;
      const cy = (s.y - r.top) / r.height;
      const x = Math.min(1 - width, Math.max(0, cx - width / 2));
      const y = Math.min(1 - height, Math.max(0, cy - height / 2));
      const anchor = { versionNumber: cb.current.versionNumber, page: pageNumber, x: round(x), y: round(y), width: round(width), height: round(height) };
      const scale = Math.min(4, 2 * Math.max(1, window.devicePixelRatio || 1));
      void renderRegionSnapshot(doc, anchor, scale)
        .then((snapshot) => cb.current.onDraw({ anchor, snapshot }))
        .catch((err) => console.error("snapshot failed", err));
    };
    root.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    return () => {
      root.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
    };
  }, [props.drawMode]);

  return (
    <div ref={rootRef} className={props.className}>
      <PdfReviewViewer
        src={props.src}
        versionNumber={props.versionNumber}
        comments={props.comments}
        selectedCommentId={props.selectedId}
        onSelectComment={props.onSelect}
        resolvedComments={props.showResolved ? "faint" : "hidden"}
        canDraw={props.canDraw}
        drawMode={props.drawMode}
        onDrawModeChange={props.onDrawModeChange}
        onDrawComplete={props.onDraw}
        onLoad={({ doc }) => {
          docRef.current = doc;
        }}
      />
    </div>
  );
}
