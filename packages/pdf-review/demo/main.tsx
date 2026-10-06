import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  PdfReviewViewer,
  configurePdfWorker,
  type CreateResult,
  type DraftPatch,
  type ReviewComment,
} from "../src";
import "../src/styles.css";
import "./demo.css";

configurePdfWorker(workerUrl);

interface DemoComment extends ReviewComment {
  snapshotUrl?: string;
}

const params = new URLSearchParams(location.search);

// A two-page acceptance letter (demo/public/sample.pdf) with a reviewer's marks on it:
// published notes, an X and a line, one closed, and one draft of mine.
const MARKS: DemoComment[] = [
  { id: "c1", page: 1, kind: "NOTE", color: "#d92d20", x: 0.36, y: 0.255, width: 0.53, height: 0.035, status: "OPEN",
    label: "שם החוג צריך להיות כמו בידיעון: \"מדעי המחשב\" ולא \"החוג למדעי המחשב\"." },
  { id: "c2", page: 1, kind: "X", color: "#2563eb", x: 0.69, y: 0.457, width: 0.21, height: 0.032, status: "RESOLVED_FIXED",
    label: "תוקן: \"היקף\" במקום \"משך\"." },
  { id: "c3", page: 2, kind: "LINE", color: "#16a34a", x: 0.25, y: 0.205, width: 0.64, height: 0, status: "OPEN",
    points: [{ x: 0.89, y: 0.205 }, { x: 0.25, y: 0.205 }], label: "להוסיף את המועד האחרון להשלמת המכינה." },
  { id: "c4", page: 1, kind: "NOTE", color: "#f59e0b", x: 0.08, y: 0.865, width: 0.84, height: 0.035, status: "OPEN",
    label: "האותיות הקטנות לא קריאות בהדפסה. להגדיל לפחות לגודל 9.", draft: true },
];
// The original contract: area boxes with a number on them (?legacy=1).
const LEGACY: DemoComment[] = [
  { id: "c1", page: 1, x: 0.3, y: 0.21, width: 0.6, height: 0.04, status: "OPEN", label: "1" },
  { id: "c2", page: 1, x: 0.45, y: 0.47, width: 0.45, height: 0.035, status: "RESOLVED_FIXED", label: "2" },
  { id: "c3", page: 2, x: 0.25, y: 0.12, width: 0.65, height: 0.08, status: "NEEDS_CLARIFICATION", label: "3" },
  { id: "c4", page: 1, x: 0.08, y: 0.865, width: 0.84, height: 0.035, status: "OPEN", label: "4", draft: true },
];

type DemoEvent =
  | { type: "create"; kind: string; color: string; anchor: CreateResult["anchor"]; points?: CreateResult["points"]; snapshotSize: number; snapshotType: string }
  | { type: "update"; id: string; patch: DraftPatch }
  | { type: "delete"; id: string }
  | { type: "clear" };

declare global {
  interface Window {
    __drawResults: Array<{ anchor: CreateResult["anchor"]; snapshotSize: number; snapshotType: string }>;
    __events: DemoEvent[];
  }
}
window.__drawResults = [];
window.__events = [];

const KIND = { NOTE: "פתק", X: "X", LINE: "קו" } as const;

function App() {
  const legacy = params.get("legacy") === "1";
  const [comments, setComments] = useState<DemoComment[]>(legacy ? LEGACY : MARKS);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(true);

  const onCreate = (r: CreateResult) => {
    window.__drawResults.push({ anchor: r.anchor, snapshotSize: r.snapshot.size, snapshotType: r.snapshot.type });
    window.__events.push({ type: "create", kind: r.kind, color: r.color, anchor: r.anchor, points: r.points, snapshotSize: r.snapshot.size, snapshotType: r.snapshot.type });
    const id = `n${Date.now()}`;
    const { versionNumber: _v, page, ...rect } = r.anchor;
    setComments((cs) => [
      ...cs,
      {
        id,
        page,
        ...rect,
        kind: legacy ? undefined : r.kind,
        color: r.color,
        points: r.points,
        status: "OPEN",
        label: legacy ? String(cs.length + 1) : r.kind === "NOTE" ? "פתק חדש" : "",
        draft: true,
        snapshotUrl: URL.createObjectURL(r.snapshot),
      },
    ]);
    setSelected(id);
  };
  const onUpdateDraft = (id: string, patch: DraftPatch) => {
    window.__events.push({ type: "update", id, patch });
    setComments((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c };
        if (patch.anchor) {
          const { versionNumber: _v, page, ...rect } = patch.anchor;
          Object.assign(next, { page, ...rect });
        }
        if (patch.color) next.color = patch.color;
        if (patch.points) next.points = patch.points;
        return next;
      }),
    );
  };
  const onDelete = (id: string) => {
    window.__events.push({ type: "delete", id });
    setComments((cs) => cs.filter((c) => c.id !== id));
    setSelected((s) => (s === id ? null : s));
  };
  const setText = (id: string, label: string) => setComments((cs) => cs.map((c) => (c.id === id ? { ...c, label } : c)));

  return (
    <div className="demo">
      <main className="demo-viewer">
        <PdfReviewViewer
          src="/sample.pdf"
          versionNumber={1}
          comments={comments}
          selectedCommentId={selected}
          onSelectComment={setSelected}
          onClearSelection={() => {
            window.__events.push({ type: "clear" });
            setSelected(null);
          }}
          resolvedComments={showResolved ? "faint" : "hidden"}
          canDraw
          onCreate={onCreate}
          onUpdateDraft={onUpdateDraft}
          onDelete={onDelete}
        />
      </main>
      <aside className="demo-side">
        <h1>הערות</h1>
        <label>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> הצג
          הערות שנסגרו
        </label>
        <ol>
          {comments.map((c, i) => (
            <li key={c.id}>
              <button type="button" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
                <span className="demo-dot" style={{ background: c.color ?? "#d92d20" }} aria-hidden="true" />
                {c.kind ? KIND[c.kind] : "אזור"} {i + 1} · עמוד {c.page} · {c.draft ? "טיוטה" : c.status}
                {c.label && !c.draft && <span className="demo-text">{c.label}</span>}
              </button>
              {c.draft && c.kind && (
                <textarea
                  aria-label={`טקסט ההערה ${i + 1}`}
                  value={c.label ?? ""}
                  onChange={(e) => setText(c.id, e.target.value)}
                />
              )}
              {c.snapshotUrl && <img src={c.snapshotUrl} alt={`תמונת האזור של הערה ${i + 1}`} />}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
