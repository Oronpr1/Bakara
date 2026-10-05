import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { PdfReviewViewer, configurePdfWorker, type DrawResult, type ReviewComment } from "../src";
import "../src/styles.css";
import "./demo.css";

configurePdfWorker(workerUrl);

interface DemoComment extends ReviewComment {
  snapshotUrl?: string;
}

const INITIAL: DemoComment[] = [
  { id: "c1", page: 1, x: 0.3, y: 0.21, width: 0.6, height: 0.04, status: "OPEN", label: "1" },
  { id: "c2", page: 1, x: 0.45, y: 0.47, width: 0.45, height: 0.035, status: "RESOLVED_FIXED", label: "2" },
  { id: "c3", page: 2, x: 0.25, y: 0.12, width: 0.65, height: 0.08, status: "NEEDS_CLARIFICATION", label: "3" },
];

declare global {
  interface Window {
    __drawResults: Array<{ anchor: DrawResult["anchor"]; snapshotSize: number; snapshotType: string }>;
  }
}
window.__drawResults = [];

function App() {
  const [comments, setComments] = useState<DemoComment[]>(INITIAL);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(true);
  const [drawMode, setDrawMode] = useState(false);

  const onDrawComplete = ({ anchor, snapshot }: DrawResult) => {
    window.__drawResults.push({ anchor, snapshotSize: snapshot.size, snapshotType: snapshot.type });
    const id = `n${Date.now()}`;
    setComments((cs) => [
      ...cs,
      { id, ...anchor, status: "OPEN", label: String(cs.length + 1), snapshotUrl: URL.createObjectURL(snapshot) },
    ]);
    setSelected(id);
  };

  return (
    <div className="demo">
      <main className="demo-viewer">
        <PdfReviewViewer
          src="/sample.pdf"
          versionNumber={1}
          comments={comments}
          selectedCommentId={selected}
          onSelectComment={setSelected}
          resolvedComments={showResolved ? "faint" : "hidden"}
          canDraw
          drawMode={drawMode}
          onDrawModeChange={setDrawMode}
          onDrawComplete={onDrawComplete}
        />
      </main>
      <aside className="demo-side">
        <h1>הערות</h1>
        <label>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> הצג
          הערות שטופלו
        </label>
        <ol>
          {comments.map((c) => (
            <li key={c.id}>
              <button type="button" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
                הערה {c.label} · עמוד {c.page} · {c.status}
              </button>
              {c.snapshotUrl && <img src={c.snapshotUrl} alt={`תמונת האזור של הערה ${c.label}`} />}
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
