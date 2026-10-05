# @al/pdf-review

React 19 viewer for reviewing an immutable PDF version: continuous vertical
scroll, lazy rendering of the pages near the view, zoom (buttons, fit-width,
pinch, ctrl/⌘+wheel), comment boxes, and drawing a new marked area with mouse,
touch or pen. Hebrew UI, RTL chrome. No Next.js dependency.

Anchors are `{ versionNumber, page, x, y, width, height }`: `page` is 1-based,
the rest are 0..1 of the page **as displayed** (its `/Rotate` applied), origin at
the top-left — the same shape as `CommentAnchor` in `@al/domain`.

## Use

```tsx
"use client";
import { PdfReviewViewer, configurePdfWorker } from "@al/pdf-review";
import "@al/pdf-review/styles.css";

configurePdfWorker("/pdf.worker.min.mjs");

<div style={{ height: "80vh" }}>
  <PdfReviewViewer
    src={`/api/letters/${id}/versions/${v}/pdf`}   // URL, ArrayBuffer or Uint8Array
    versionNumber={v}
    comments={comments}                          // { id, page, x, y, width, height, status, label? }[]
    selectedCommentId={selectedId}
    onSelectComment={setSelectedId}              // the viewer scrolls the selection into view
    resolvedComments="faint"                     // or "hidden"
    canDraw={mayComment}
    onDrawComplete={({ anchor, snapshot }) => openNewCommentForm(anchor, snapshot)}
  />
</div>
```

The viewer fills its parent's height. Other props: `isResolved(status)` (default:
status starts with `RESOLVED`), `commentAriaLabel(comment)`, controlled
`drawMode` / `onDrawModeChange`, `snapshotScale`, `onLoad`, `onError`,
`onPageChange`, `className`, `style`.

Draw mode is toggled from the toolbar ("סימון אזור"). While it is on, a drag on a
page draws a rectangle (8 CSS px minimum, clamped to the page); Escape cancels a
drag in progress, or leaves draw mode. `snapshot` is a PNG of the area plus a
12pt margin with the area outlined, rendered at 2× device scale (max 4×).

### Helpers

- `renderRegionSnapshot(doc, anchor, scale = 2, { margin, outline, type })` — the
  same snapshot, from any `PDFDocumentProxy` (e.g. one opened with `openPdf(src)`).
- Geometry: `rectFromDrag`, `clampRectToPage`, `dragToPageRect`, `meetsMinSize`,
  `pixelRectToNorm`, `normToPixelRect`, `snapshotCropRect`.
- `classifyPdfOpenError` and the `PdfPasswordError` / `PdfCorruptError` /
  `PdfEngineError` classes the viewer reports through `onError`.

## pdf.js worker (Next.js)

pdf.js (`pdfjs-dist` 6, legacy build for wider browser support) is loaded lazily
on the client, so the package is safe to import from a client component that is
server-rendered. Its worker file must be served by the host and must be the
**exact** pdf.js version this package uses, so copy it from here:

```jsonc
// apps/web/package.json
"scripts": {
  "predev": "al-pdf-review-copy-worker public",
  "prebuild": "al-pdf-review-copy-worker public"
}
```

then call `configurePdfWorker("/pdf.worker.min.mjs")` once on the client before the
first viewer mounts (module scope of the client component is fine). Add
`public/pdf.worker.min.mjs` to `.gitignore`. `configurePdfWorker` also accepts a
`URL` or a ready module `Worker` (it is then used as pdf.js's `workerPort`).

Next.js must transpile the package (it ships TypeScript source):
`transpilePackages: ["@al/pdf-review"]` in `next.config`.

Theming: every colour is a CSS variable on `.alpr-root` (`--alpr-open`,
`--alpr-selected`, `--alpr-bg`, …; see `src/styles.css`). The theme follows
`prefers-color-scheme`; `data-theme="dark"` on `.alpr-root` or an ancestor forces
dark and `data-theme="light"` on `.alpr-root` forces light.

## Develop

```sh
pnpm --filter @al/pdf-review test        # unit tests (geometry, drag, zoom math, render queue)
pnpm --filter @al/pdf-review typecheck
pnpm --filter @al/pdf-review demo        # Vite demo on http://localhost:5178
pnpm --filter @al/pdf-review smoke       # headless Chromium: draw (mouse + touch), Escape, zoom, select
pnpm --filter @al/pdf-review demo:sample # regenerate demo/public/sample.pdf (needs a Hebrew TTF)
```

`smoke` needs a Playwright Chromium matching `playwright-core` 1.56
(`PLAYWRIGHT_BROWSERS_PATH`).

The drag primitive, zoom math and pinch/wheel hook, render queue and error
classification are adapted from the pdf-guard project by the same author.
