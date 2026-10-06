# @al/pdf-review

React 19 workspace for reviewing an immutable PDF version (an acceptance letter,
usually two pages): continuous vertical scroll with lazy rendering, a bottom zoom
bar, and simple marks a reviewer puts on the page — a **note** (a numbered
sticker with text), an **X**, a **line** — in a chosen colour, plus editing of
the reviewer's own **draft** marks. Mouse, touch and pen; Hebrew UI, RTL chrome;
no Next.js dependency.

Coordinates are fractions of the page **as displayed** (its `/Rotate` applied),
origin at the top-left. An anchor is `{ versionNumber, page, x, y, width, height }`
(`page` 1-based) — the same shape as `CommentAnchor` in `@al/domain`. A line's
ends are `{ x, y }` points in the same units (the shape the comments service
stores).

## Use

```tsx
"use client";
import { PdfReviewViewer, configurePdfWorker } from "@al/pdf-review";
import "@al/pdf-review/styles.css";

configurePdfWorker("/pdf.worker.min.mjs");

<div style={{ height: "80vh" }}>
  <PdfReviewViewer
    src={`/api/versions/${id}/pdf`}          // URL, ArrayBuffer or Uint8Array
    versionNumber={v}
    comments={marks}                         // ReviewComment[] (below)
    selectedCommentId={selectedId}
    onSelectComment={setSelectedId}          // the viewer scrolls the selection into view
    onClearSelection={() => setSelectedId(null)}
    canDraw={mayComment}
    onCreate={(m) => saveNewMark(m)}         // { anchor, kind, color, points?, snapshot }
    onUpdateDraft={(id, patch) => updateDraft(id, patch)}
    onDelete={(id) => deleteDraft(id)}
  />
</div>
```

The viewer fills its parent's height.

### Props

| prop | type | |
|---|---|---|
| `src` | `string \| URL \| ArrayBuffer \| Uint8Array` | the PDF |
| `versionNumber` | `number` | written into every anchor |
| `comments` | `readonly ReviewComment[]` | the marks to draw |
| `selectedCommentId` | `string \| null` | the selected mark: highlighted, scrolled into view; its preview opens when it has text |
| `onSelectComment` | `(id: string) => void` | a mark was clicked / tapped |
| `onClearSelection` | `() => void` | a click on an empty part of a page (select tool), or Escape |
| `resolvedComments` | `"faint" \| "hidden"` | default `"faint"`; a selected one is always shown |
| `isResolved` | `(status: string) => boolean` | default: status starts with `RESOLVED` |
| `commentAriaLabel` | `(c: ReviewComment) => string` | default `"פתק 3 · טיוטה"` / `"סימון X 2 · נסגרה"`; an area box: `"הערה <label>"` |
| `canDraw` | `boolean` | show the marking tools |
| `tool` / `onToolChange` | `"select" \| "NOTE" \| "X" \| "LINE"` | controlled tool (optional; the viewer owns it otherwise) |
| `drawMode` / `onDrawModeChange` | `boolean` | older switch, still honoured: true = a marking tool is active (the last one used, a note at first) |
| `color` / `onColorChange` | `string` (`#rrggbb`) | controlled colour of the next mark (optional; red at first) |
| `onCreate` | `(r: CreateResult) => void` | a new mark was placed |
| `onDrawComplete` | `(r: DrawResult) => void` | older name: called with the same object, **only when `onCreate` is absent** |
| `onUpdateDraft` | `(id: string, patch: DraftPatch) => void` | a draft mark was moved, resized, re-coloured or had a line end moved. Without it drafts are read-only |
| `onDelete` | `(id: string) => void` | delete a draft mark (Delete / Backspace, or the toolbar's trash button). Without it there is no delete |
| `tapArea` | `{ width, height } \| false` | area a tap marks with the note or X tool, fractions of the page; default `{ width: 0.28, height: 0.045 }`; `false`: drag only |
| `snapshotScale` | `number` | device px per PDF point for snapshots; default 2 × devicePixelRatio, at most 4 |
| `onLoad` / `onError` / `onPageChange` | | as before |
| `className` / `style` | | on the root |

### Types

```ts
type MarkKind = "NOTE" | "X" | "LINE";
type ViewerTool = "select" | MarkKind;
interface MarkPoint { x: number; y: number }            // 0..1 of the displayed page

interface ReviewComment {                                // x, y, width, height: 0..1
  id: string; page: number; x: number; y: number; width: number; height: number;
  status: string;
  label?: string;          // the comment's text: shown in the mark's preview card
                           // (a comment without `kind` shows it on its box, e.g. "3")
  kind?: MarkKind | null;  // none: an outlined area box (the original style)
  color?: string | null;   // "#rrggbb"; null/absent: red
  points?: readonly MarkPoint[] | null;   // a line's two ends
  number?: string | number;               // the number on the mark; default: position in `comments` + 1
  draft?: boolean;         // not published: dashed; editable when onUpdateDraft / onDelete are given
}

interface ReviewAnchor { versionNumber: number; page: number; x: number; y: number; width: number; height: number }
interface DrawResult { anchor: ReviewAnchor; snapshot: Blob }               // PNG of the area, the mark drawn on it
interface CreateResult extends DrawResult {
  kind: MarkKind;
  color: string;           // "#rrggbb"
  points?: MarkPoint[];    // LINE only: [start, end]; its anchor is the box around them
}
interface DraftPatch { anchor?: ReviewAnchor; color?: string; points?: MarkPoint[] }  // only what changed
```

`DraftPatch` carries no snapshot (the comments service's patch schema is strict);
a host that wants a fresh picture after a move can cut one with
`renderRegionSnapshot(doc, patch.anchor, 2, { outline: color, mark: { kind, points } })`
(`doc` from `onLoad`).

### What the user does

- **Tools** (top bar, when `canDraw`): בחירה (select/edit) · פתק · X · קו, a
  colour palette (red, orange, green, blue, black; behind one button on a
  phone) and, while a draft of mine is selected, a delete button.
- **Note / X**: a tap places the default area around the point; a drag draws a
  rectangle; a long thin stroke along a line of text keeps its length and gets a
  line's height. **Line**: a drag from point to point (nearly level / plumb
  lines are straightened; a tap draws nothing). After one mark the tool returns
  to select, and the host usually selects the new draft, ready to adjust.
- **Select**: a click opens / closes a mark's preview card and selects it;
  hovering previews it. A **draft** that is selected shows handles: drag its
  body to move it, a corner to resize it, a line's ends to move them; a palette
  colour re-colours it; Delete removes it. On a touch screen the first tap
  selects and the next drag moves (so a swipe that starts on a mark still
  scrolls). Published marks are never edited.
- **Zoom bar** (bottom): page `▲ ▼ 1 / 2`, then `− [119%] +` (each press to
  the next 5%; type a number and press Enter), **התאם לרוחב** (default) and
  **התאם לעמוד**. Ctrl/⌘ + wheel and pinch zoom around the pointer; the point
  under it stays put.
- Escape: cancels a drag, else leaves a tool, else closes a preview, else clears
  the selection.

State is never colour alone: a closed mark is faded and carries a check, a draft
is dashed, the selected mark has a ring and handles.

### Helpers

- `renderRegionSnapshot(doc, anchor, scale = 2, { margin, outline, type, mark })`.
- Geometry (pure, tested): `tapRectAt`, `resolveMarkGesture`, `lineFromDrag`,
  `moveRect`, `resizeRect`, `movePoints`, `moveEndpoint`, `rectFromDrag`,
  `clampRectToPage`, `dragToPageRect`, `pixelRectToNorm`, `normToPixelRect`,
  `snapshotCropRect`; colours `MARK_COLORS`, `DEFAULT_MARK_COLOR`, `COLOR_NAMES`.
- `classifyPdfOpenError` and `PdfPasswordError` / `PdfCorruptError` /
  `PdfEngineError`, reported through `onError`.

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

Theming: every colour of the chrome is a CSS variable on `.alpr-root`
(`--alpr-accent`, `--alpr-bg`, …; see `src/styles.css`); a mark's own colour
arrives as `--mark`. The theme follows `prefers-color-scheme`; `data-theme="dark"`
on `.alpr-root` or an ancestor forces dark and `data-theme="light"` on `.alpr-root`
forces light.

## Performance

Pages near the view are rendered through one shared queue (two at a time,
visible pages first); pages far away give their bitmap back. A zoom stretches
the old bitmap at once and re-renders once the zoom has been still for 140 ms.
Cancelled renders, released pages, unmounted pages and encoded snapshots free
their canvas at once (iOS Safari caps the total).

## Develop

```sh
pnpm --filter @al/pdf-review test        # unit tests (geometry, marks, layout/zoom, drag, render queue)
pnpm --filter @al/pdf-review typecheck
pnpm --filter @al/pdf-review demo        # Vite demo on http://localhost:5178 (?legacy=1: area boxes)
pnpm --filter @al/pdf-review smoke       # headless Chromium, desktop 1280 + touch phone 390 [screenshot-dir]
pnpm --filter @al/pdf-review demo:sample # regenerate demo/public/sample.pdf (needs a Hebrew TTF)
```

`smoke` uses the repository root's Playwright (`@playwright/test` 1.63) and its
Chromium, launched without a profile and with `--use-mock-keychain`.

The drag primitive, zoom math and pinch/wheel hook, render queue and error
classification are adapted from the pdf-guard project by the same author; the
zoom bar follows its status bar.
