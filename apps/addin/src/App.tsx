import { useCallback, useEffect, useRef, useState } from "react";
import { classifyDocumentUrl, fileNameOf } from "./docUrl";
import { PHASE_LABELS, saveVersion, WrongDocumentError, type Phase, type WordDocument } from "./flow";
import type { AddinComment, Api, LetterLookup, Stage, UploadResult } from "./types";

export interface Host {
  word: WordDocument;
  api: Api;
  /** Opened inside Word at all (false: a plain browser tab). */
  inWord: boolean;
  wordOnWeb: boolean;
  nestedAuth: boolean;
}

type View =
  | { kind: "loading" }
  | { kind: "outside-word" }
  | { kind: "word-web" }
  | { kind: "no-naa" }
  | { kind: "not-letter"; reason: "unsaved" | "local" | "unknown"; location: string }
  | { kind: "error"; message: string }
  | { kind: "letter"; lookup: LetterLookup; documentUrl: string };

type Op =
  | { kind: "idle" }
  | { kind: "working"; submit: boolean; phase: Phase; fraction: number }
  | { kind: "done"; result: UploadResult }
  | { kind: "failed"; message: string };

/** Share of the progress bar each phase takes; the PDF and the upload are the slow parts. */
const PHASE_SPAN: Record<Phase, [number, number]> = {
  save: [0, 0.1],
  docx: [0.1, 0.25],
  pdf: [0.25, 0.5],
  upload: [0.5, 1],
};

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "משהו השתבש. נסו שוב.";
}

export function App({ host }: { host: Host }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [op, setOp] = useState<Op>({ kind: "idle" });
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!host.inWord) return setView({ kind: "outside-word" });
    if (host.wordOnWeb) return setView({ kind: "word-web" });
    if (!host.nestedAuth) return setView({ kind: "no-naa" });
    const location = classifyDocumentUrl(host.word.documentUrl());
    if (location.kind === "unsaved") return setView({ kind: "not-letter", reason: "unsaved", location: "" });
    if (location.kind === "local") return setView({ kind: "not-letter", reason: "local", location: location.path });
    setView((v) => (v.kind === "letter" ? v : { kind: "loading" }));
    try {
      const lookup = await host.api.findLetter(location.url);
      if (!lookup) return setView({ kind: "not-letter", reason: "unknown", location: location.url });
      setView({ kind: "letter", lookup, documentUrl: location.url });
    } catch (err) {
      setView({ kind: "error", message: messageOf(err) });
    }
  }, [host]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (submit: boolean) => {
    if (view.kind !== "letter") return;
    setOp({ kind: "working", submit, phase: "save", fraction: 0 });
    try {
      const result = await saveVersion(
        host.word,
        host.api,
        { letterId: view.lookup.letter.id, documentUrl: view.documentUrl, note, submit },
        (phase, fraction) => setOp({ kind: "working", submit, phase, fraction }),
      );
      setOp({ kind: "done", result });
      setNote("");
      void load(); // new version number, stage and permissions
    } catch (err) {
      if (err instanceof WrongDocumentError) {
        setOp({ kind: "idle" });
        setView({ kind: "not-letter", reason: "unknown", location: host.word.documentUrl() });
        return;
      }
      setOp({ kind: "failed", message: messageOf(err) });
    }
  };

  return (
    <main className="pane" aria-busy={view.kind === "loading" || op.kind === "working"}>
      {view.kind === "loading" && <Loading />}
      {view.kind === "outside-word" && (
        <Notice tone="info" title="החלונית פועלת בתוך Word">
          פתחו את מכתב הקבלה ב-Word ולחצו על "מכתבי קבלה" בכרטיסייה "בית".
        </Notice>
      )}
      {view.kind === "word-web" && (
        <Notice tone="warn" title="צריך את Word במחשב">
          שמירת גרסה רשמית אפשרית רק באפליקציית Word במחשב, כי רק היא מפיקה את ה-PDF כמו "שמירה כ-PDF".
          <br />
          בסרגל העליון בחרו <b>עריכה ← פתיחה באפליקציית שולחן העבודה</b>.
        </Notice>
      )}
      {view.kind === "no-naa" && (
        <Notice tone="warn" title="הגרסה של Word לא תומכת בכניסה המאובטחת">
          כדי להשתמש בחלונית צריך גרסה עדכנית של Microsoft 365. עדכנו את Office (קובץ ← חשבון ← אפשרויות עדכון), או פנו
          לצוות ה-IT.
        </Notice>
      )}
      {view.kind === "not-letter" && <NotALetter reason={view.reason} location={view.location} onRetry={load} />}
      {view.kind === "error" && (
        <Notice tone="error" title="לא הצלחנו לטעון את המכתב">
          {view.message}
          <div className="actions">
            <button className="btn secondary" onClick={() => void load()}>
              לנסות שוב
            </button>
          </div>
        </Notice>
      )}
      {view.kind === "letter" && (
        <LetterView
          lookup={view.lookup}
          api={host.api}
          op={op}
          note={note}
          onNote={setNote}
          onSave={run}
          onDismiss={() => setOp({ kind: "idle" })}
          onRefresh={load}
        />
      )}
    </main>
  );
}

function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden />
      טוען…
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "info" | "warn" | "error" | "success"; title: string; children?: React.ReactNode }) {
  return (
    <section className={`notice ${tone}`} role={tone === "error" || tone === "warn" ? "alert" : "status"}>
      <h2>{title}</h2>
      {children && <div className="notice-body">{children}</div>}
    </section>
  );
}

function NotALetter({ reason, location, onRetry }: { reason: "unsaved" | "local" | "unknown"; location: string; onRetry: () => void }) {
  const text = {
    unsaved: "המסמך עדיין לא נשמר, ולכן הוא לא קובץ של מכתב במערכת.",
    local: "המסמך שמור במחשב ולא בספריית המכתבים ב-SharePoint. כנראה נשמר בשם אחר (\"שמירה בשם\").",
    unknown: "המסמך הפתוח לא מזוהה כקובץ של מכתב שיש לך גישה אליו.",
  }[reason];
  return (
    <Notice tone="warn" title="זה לא קובץ של מכתב קבלה">
      <p>{text}</p>
      {location && (
        <p className="file" title={location}>
          <FileName name={fileNameOf(location)} />
        </p>
      )}
      <p>
        <b>לא תישמר גרסה מהמסמך הזה.</b> פתחו את המכתב מתוך מערכת מכתבי הקבלה (כפתור "פתיחה ב-Word"), ואז פתחו שוב את
        החלונית.
      </p>
      <div className="actions">
        <button className="btn secondary" onClick={onRetry}>
          בדיקה מחדש
        </button>
      </div>
    </Notice>
  );
}

/** A Hebrew file name with its Latin extension kept at the end, as Windows shows it. */
function FileName({ name }: { name: string }) {
  const m = /^(.*?)(\.[A-Za-z0-9]{1,6})$/.exec(name);
  if (!m) return <bdi>{name}</bdi>;
  return (
    <>
      <bdi>{m[1]}</bdi>
      <bdi dir="ltr">{m[2]}</bdi>
    </>
  );
}

const STAGE_TONE: Record<Stage, string> = {
  DRAFT: "draft",
  INITIAL_REVIEW: "review",
  REGISTRATION_ROUND: "review",
  ACADEMIC_ROUND: "review",
  FINAL_REVIEW: "review",
  APPROVED: "approved",
};

function LetterView(props: {
  lookup: LetterLookup;
  api: Api;
  op: Op;
  note: string;
  onNote: (s: string) => void;
  onSave: (submit: boolean) => void;
  onDismiss: () => void;
  onRefresh: () => void;
}) {
  const { letter, user } = props.lookup;
  const { op } = props;
  const busy = op.kind === "working";
  return (
    <>
      <header className="letter-head">
        <div className="eyebrow">
          <span>מכתב קבלה · {letter.seasonName}</span>
          <button className="icon-btn" onClick={props.onRefresh} disabled={busy} title="רענון" aria-label="רענון">
            ↻
          </button>
        </div>
        <h1>
          {letter.trackName} <span className="track-no">({letter.trackNumber})</span>
        </h1>
        <p className="meta">
          קמפוס {letter.campus} · {letter.faculty}
        </p>
        <div className="chips">
          <span className={`chip stage ${STAGE_TONE[letter.stage]}`}>{letter.stageLabel}</span>
          <span className="chip">{letter.latestVersion > 0 ? `גרסה ${letter.latestVersion}` : "אין עדיין גרסה"}</span>
        </div>
      </header>

      <section className="card save" aria-labelledby="save-title">
        <h2 id="save-title" className="visually-hidden">
          שמירת גרסה
        </h2>
        {op.kind === "working" && <Progress op={op} />}
        {op.kind === "done" && <Done result={op.result} onDismiss={props.onDismiss} />}
        {op.kind === "failed" && (
          <div className="inline-error" role="alert">
            <b>הגרסה לא נשמרה.</b> {op.message}
          </div>
        )}
        {(op.kind === "idle" || op.kind === "failed") &&
          (letter.canUpload ? (
            <>
              <label className="field">
                <span>הערה לגרסה (לא חובה)</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={props.note}
                  onChange={(e) => props.onNote(e.target.value)}
                  placeholder="למשל: תוקן תאריך תחילת הלימודים"
                />
              </label>
              <div className="buttons">
                <button className="btn primary" onClick={() => props.onSave(false)}>
                  שמור גרסה
                </button>
                {letter.canSubmit && (
                  <button className="btn secondary" onClick={() => props.onSave(true)}>
                    שמור והעבר לבדיקה
                  </button>
                )}
              </div>
              <p className="hint">Word ישמור את המסמך, יפיק ממנו PDF ושניהם יישמרו כגרסה {letter.latestVersion + 1}.</p>
            </>
          ) : (
            <p className="hint">
              {letter.stage === "APPROVED"
                ? "המכתב אושר להפצה ולא ניתן לשמור לו גרסאות חדשות."
                : "רק היועצת האחראית או מנהלת הבקרה שומרות גרסאות של המכתב הזה."}
            </p>
          ))}
      </section>

      <Comments comments={letter.openComments} api={props.api} />

      <footer className="foot">מחובר/ת בתור {user.name}</footer>
    </>
  );
}

function Progress({ op }: { op: Extract<Op, { kind: "working" }> }) {
  const [from, to] = PHASE_SPAN[op.phase];
  const pct = Math.round((from + (to - from) * Math.min(1, Math.max(0, op.fraction))) * 100);
  const phases = Object.keys(PHASE_LABELS) as Phase[];
  const current = phases.indexOf(op.phase);
  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress-title">{op.submit ? "שומרים ומעבירים לבדיקה…" : "שומרים גרסה…"}</div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="steps">
        {phases.map((p, i) => (
          <li key={p} className={i < current ? "is-done" : i === current ? "is-current" : ""}>
            <span className="dot" aria-hidden>
              {i < current ? "✓" : ""}
            </span>
            {PHASE_LABELS[p]}
            {i === current && p === "upload" ? ` · ${Math.round(op.fraction * 100)}%` : ""}
          </li>
        ))}
      </ol>
      <p className="hint">אל תסגרו את Word ואל תערכו את המסמך עד לסיום.</p>
    </div>
  );
}

function Done({ result, onDismiss }: { result: UploadResult; onDismiss: () => void }) {
  return (
    <div className="done" role="status">
      <div className="done-icon" aria-hidden>
        ✓
      </div>
      <div>
        <div className="done-title">נשמרה גרסה {result.versionNumber}</div>
        <div className="done-text">
          {result.submitted
            ? `המכתב הועבר ל${result.stageLabel}.`
            : `${result.pageCount} ${result.pageCount === 1 ? "עמוד" : "עמודים"} · Word ו-PDF נשמרו במערכת.`}
        </div>
        {result.submitError && (
          <div className="inline-error">
            <b>הגרסה נשמרה, אבל ההעברה לבדיקה לא בוצעה:</b> {result.submitError}
          </div>
        )}
      </div>
      <button className="icon-btn close" onClick={onDismiss} aria-label="סגירה">
        ×
      </button>
    </div>
  );
}

function Comments({ comments, api }: { comments: AddinComment[]; api: Api }) {
  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">
        הערות פתוחות <span className="count">{comments.length}</span>
      </h2>
      {comments.length === 0 ? (
        <p className="empty">אין הערות פתוחות על המכתב.</p>
      ) : (
        <ul>
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Thumbnail comment={c} api={api} />
              <div className="comment-body">
                <div className="comment-meta">
                  <b>{c.authorName}</b>
                  <span>
                    עמ' {c.page} · גרסה {c.versionNumber}
                  </span>
                </div>
                <p dir="auto">{c.body}</p>
                {c.status === "NEEDS_CLARIFICATION" && <span className="tag">ממתינה להבהרה</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Thumbnail({ comment, api }: { comment: AddinComment; api: Api }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!comment.hasSnapshot) return;
    let live = true;
    api.snapshot(comment.id).then(
      (url) => {
        if (!live) return URL.revokeObjectURL(url);
        urlRef.current = url;
        setSrc(url);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [api, comment.id, comment.hasSnapshot]);

  if (!comment.hasSnapshot || failed) return <div className="thumb empty-thumb">עמ' {comment.page}</div>;
  return src ? <img className="thumb" src={src} alt={`האזור המסומן בעמוד ${comment.page}`} /> : <div className="thumb loading-thumb" />;
}
