/**
 * The pdf.js boundary: worker setup, opening documents, rasterising pages
 * through the shared render queue, and cutting region snapshots.
 *
 * pdf.js is imported lazily, on first use, so importing this package from a
 * Next.js client component never evaluates pdf.js during server rendering.
 *
 * Error classification and the queued, cancellable page render are adapted
 * from pdf-guard (src/pdf/render.ts, same author), without its project/file
 * store coupling.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { capRasterScale, snapshotCropRect, type NormRect } from "./geometry";
import { RenderQueue, type RenderJob } from "./renderQueue";

type PdfJs = typeof import("pdfjs-dist");
export type { PDFDocumentProxy, PDFPageProxy };

/** CSS pixels per PDF point at zoom 1 (pdf.js's own viewer uses the same 96/72). */
export const CSS_UNITS = 96 / 72;

/** Largest bitmap the viewer will allocate for one page or snapshot. */
export const MAX_CANVAS_PIXELS = 16_000_000;

type WorkerSource = string | URL | Worker;
let workerSource: WorkerSource | null = null;
let pdfjsPromise: Promise<PdfJs> | null = null;
let pdfjsModule: PdfJs | null = null;

function applyWorker(lib: PdfJs): void {
  if (!workerSource) return;
  if (typeof Worker !== "undefined" && workerSource instanceof Worker) {
    lib.GlobalWorkerOptions.workerPort = workerSource;
  } else {
    lib.GlobalWorkerOptions.workerSrc = String(workerSource);
  }
}

/**
 * Tell pdf.js where its worker lives. Call once on the client before the
 * first document opens, with the URL the host serves `pdf.worker.min.mjs`
 * from (or a ready module Worker). See README.md for Next.js recipes.
 */
export function configurePdfWorker(source: WorkerSource): void {
  workerSource = source;
  if (pdfjsModule) applyWorker(pdfjsModule);
}

/** The pdf.js module, loaded once. */
export function loadPdfJs(): Promise<PdfJs> {
  // The legacy build carries polyfills (e.g. Map#getOrInsertComputed) that the
  // modern build of pdf.js 6 assumes; without them Chrome < 145 and current
  // Safari fail to render.
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((lib: PdfJs) => {
    pdfjsModule = lib;
    applyWorker(lib);
    if (!workerSource && !lib.GlobalWorkerOptions.workerSrc && !lib.GlobalWorkerOptions.workerPort) {
      console.warn("[@al/pdf-review] configurePdfWorker() was not called; pdf.js will fail to start its worker.");
    }
    return lib;
  });
  return pdfjsPromise;
}

export class PdfPasswordError extends Error {
  constructor() {
    super("password");
    this.name = "PdfPasswordError";
  }
}
export class PdfCorruptError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PdfCorruptError";
  }
}
/** pdf.js itself could not start (its worker failed to load). Not the file's fault. */
export class PdfEngineError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PdfEngineError";
  }
}
export type PdfOpenError = PdfPasswordError | PdfEngineError | PdfCorruptError;

const ENGINE_FAILURE = /Setting up fake worker failed|dynamically imported module|Importing a module script failed/i;

/** Map a raw pdf.js open failure onto the cases a UI tells apart. */
export function classifyPdfOpenError(err: unknown): PdfOpenError {
  if (err instanceof PdfPasswordError || err instanceof PdfEngineError || err instanceof PdfCorruptError) return err;
  const e = err as { name?: string; message?: string } | null;
  if (e?.name === "PasswordException") return new PdfPasswordError();
  const msg = e?.message || String(err);
  if (ENGINE_FAILURE.test(msg)) return new PdfEngineError(msg);
  return new PdfCorruptError(msg);
}

export type PdfSource = string | URL | ArrayBuffer | Uint8Array;

export interface OpenedPdf {
  promise: Promise<PDFDocumentProxy>;
  /** Abort the load, or free the document once loaded. */
  destroy(): void;
}

/** Open a PDF from a URL or bytes. The caller's buffer is copied, never detached. */
export function openPdf(src: PdfSource): OpenedPdf {
  let destroyed = false;
  let destroyTask: (() => void) | null = null;
  const promise = loadPdfJs().then(async (lib) => {
    if (destroyed) throw new PdfCorruptError("cancelled");
    const params =
      typeof src === "string" || src instanceof URL
        ? { url: String(src) }
        : { data: src instanceof Uint8Array ? src.slice() : new Uint8Array(src.slice(0)) };
    const task = lib.getDocument(params);
    destroyTask = () => void task.destroy();
    try {
      return await task.promise;
    } catch (err) {
      throw classifyPdfOpenError(err);
    }
  });
  return {
    promise,
    destroy: () => {
      destroyed = true;
      destroyTask?.();
    },
  };
}

/** One queue for the whole page: two rasters at a time across every viewer. */
export const renderQueue = new RenderQueue(2);

/** Raster a page at `scale` (device pixels per PDF point) into a fresh canvas, via the queue. */
export function renderPageCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  priority = 0,
): RenderJob<HTMLCanvasElement> {
  return renderQueue.enqueue(priority, async (ctx) => {
    const page = await doc.getPage(pageNumber);
    if (ctx.cancelled) throw new Error("cancelled");
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: capRasterScale(base, scale, MAX_CANVAS_PIXELS) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const task = page.render({ canvas, viewport });
    ctx.onCancel(() => task.cancel());
    await task.promise;
    return canvas;
  });
}

export interface SnapshotOptions {
  /** Margin around the marked area, in PDF points. Default 12. */
  margin?: number;
  /** Stroke the marked area in this colour; false for none. Default "#d92d20". */
  outline?: string | false;
  /** Image type; default "image/png". */
  type?: string;
}

/** The anchor fields a snapshot needs; @al/domain's CommentAnchor fits. */
export interface SnapshotAnchor extends NormRect {
  page: number;
}

/**
 * A PNG of an anchored area, cut from a render of its page at `scale` device
 * pixels per PDF point (2 = 144 dpi). Only the cropped region is rasterised.
 */
export async function renderRegionSnapshot(
  doc: PDFDocumentProxy,
  anchor: SnapshotAnchor,
  scale = 2,
  options: SnapshotOptions = {},
): Promise<Blob> {
  const { margin = 12, outline = "#d92d20", type = "image/png" } = options;
  const page = await doc.getPage(anchor.page);
  const base = page.getViewport({ scale: 1 });
  const s = capRasterScale(base, scale, MAX_CANVAS_PIXELS * 4);
  const full = page.getViewport({ scale: s });
  const crop = snapshotCropRect(anchor, full, margin * s);
  if (crop.width * crop.height > MAX_CANVAS_PIXELS) throw new RangeError("snapshot area too large");

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const viewport = page.getViewport({ scale: s, offsetX: -crop.left, offsetY: -crop.top });
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;

  if (outline) {
    const g = canvas.getContext("2d")!;
    const lw = Math.max(2, Math.round(s));
    g.strokeStyle = outline;
    g.lineWidth = lw;
    g.strokeRect(
      anchor.x * full.width - crop.left - lw / 2,
      anchor.y * full.height - crop.top - lw / 2,
      anchor.width * full.width + lw,
      anchor.height * full.height + lw,
    );
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("snapshot encoding failed"))), type),
  );
}
