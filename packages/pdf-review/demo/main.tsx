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

// A two-page acceptance letter (demo/public/sample.pdf) with a reviewer's notes on it.
const INITIAL: DemoComment[] = [
  {
    id: "c1",
    page: 1,
    x: 0.3,
    y: 0.21,
    width: 0.6,
    height: 0.04,
    status: "OPEN",
    label: "1",
    text: "שם החוג צריך להיות כמו בידיעון: \"מדעי המחשב\" ולא \"החוג למדעי המחשב\".",
  },
  {
    id: "c2",
    page: 1,
    x: 0.45,
    y: 0.47,
    width: 0.45,
    height: 0.035,
    status: "RESOLVED_FIXED",
    label: "2",
    text: "תוקן: \"היקף\" במקום \"משך\".",
  },
  {
    id: "c3",
    page: 2,
    x: 0.25,
    y: 0.12,
    width: 0.65,
    height: 0.08,
    status: "OPEN",
    label: "3",
    text: "להוסיף את המועד האחרון להשלמת המכינה.",
  },
  {
    id: "c4",
    page: 1,
    x: 0.08,
    y: 0.865,
    width: 0.84,
    height: 0.035,
    status: "OPEN",
    label: "4",
    text: "האותיות הקטנות לא קריאות בהדפסה. להגדיל לפחות לגודל 9.",
    draft: true,
  },
];

const params = new URLSearchParams(location.search);

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
  const [style, setStyle] = useState<"box" | "sticker">(params.get("style") === "box" ? "box" : "sticker");

  const onDrawComplete = ({ anchor, snapshot }: DrawResult) => {
    window.__drawResults.push({ anchor, snapshotSize: snapshot.size, snapshotType: snapshot.type });
    const id = `n${Date.now()}`;
    setComments((cs) => [
      ...cs,
      {
        id,
        ...anchor,
        status: "OPEN",
        label: String(cs.length + 1),
        text: "הערה חדשה (טיוטה)",
        draft: true,
        snapshotUrl: URL.createObjectURL(snapshot),
      },
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
          commentStyle={style}
          canDraw
          drawMode={drawMode}
          onDrawModeChange={setDrawMode}
          onDrawComplete={onDrawComplete}
        />
      </main>
      <aside className="demo-side">
        <h1>הערות</h1>
        <fieldset className="demo-style">
          <legend>תצוגת הערות</legend>
          <label>
            <input type="radio" name="style" checked={style === "sticker"} onChange={() => setStyle("sticker")} /> מדבקות
          </label>
          <label>
            <input type="radio" name="style" checked={style === "box"} onChange={() => setStyle("box")} /> מסגרות
          </label>
        </fieldset>
        <label>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> הצג
          הערות שנסגרו
        </label>
        <ol>
          {comments.map((c) => (
            <li key={c.id}>
              <button type="button" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
                הערה {c.label} · עמוד {c.page} · {c.draft ? "טיוטה" : c.status}
                {c.text && <span className="demo-text">{c.text}</span>}
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
