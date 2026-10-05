"use client";
import { memo, useEffect, useRef, type PointerEventHandler, type ReactNode } from "react";
import { renderPageCanvas, type PDFDocumentProxy } from "./pdf";

export interface PageViewProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Device pixels per PDF point for the bitmap. */
  rasterScale: number;
  /** false releases the bitmap and cancels any render in flight. */
  render: boolean;
  /** Higher renders first; read when a render is queued. */
  priority: number;
  drawing: boolean;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

/**
 * One page: a canvas painted through the shared render queue plus an overlay
 * for marks. A new bitmap is rendered off-screen and swapped in, so the old one
 * (stretched by CSS) stays visible while a zoom re-renders.
 */
export const PageView = memo(function PageView(props: PageViewProps) {
  const { doc, pageNumber, rasterScale, render } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintedScale = useRef<number | null>(null);
  const priority = useRef(props.priority);
  priority.current = props.priority;

  useEffect(() => {
    paintedScale.current = null;
  }, [doc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!render) {
      canvas.width = 0;
      canvas.height = 0;
      paintedScale.current = null;
      delete canvas.dataset.rendered;
      return;
    }
    if (paintedScale.current === rasterScale) return;
    const job = renderPageCanvas(doc, pageNumber, rasterScale, priority.current);
    void job.promise.then((bitmap) => {
      if (!bitmap) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.width = 0; // free the off-screen copy now rather than at GC
      paintedScale.current = rasterScale;
      canvas.dataset.rendered = "true";
    });
    return () => job.cancel();
  }, [doc, pageNumber, rasterScale, render]);

  return (
    <div
      className="alpr-page"
      role="group"
      aria-label={`עמוד ${pageNumber}`}
      data-page={pageNumber}
      style={{ left: props.left, top: props.top, width: props.width, height: props.height }}
    >
      <canvas ref={canvasRef} className="alpr-canvas" aria-hidden="true" />
      <div className="alpr-overlay" data-drawing={props.drawing || undefined} onPointerDown={props.onPointerDown}>
        {props.children}
      </div>
    </div>
  );
});
