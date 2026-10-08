"use client";

import { Check, Eye, FileDown, FileText, FileUp, Puzzle, TriangleAlert, Upload } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/ActionForm";
import { Spinner } from "@/components/Spinner";
import { btnPrimary, btnQuiet, card, hint, input, label } from "@/components/ui";
import { uploadVersionAction } from "@/app/(app)/letters/[id]/actions";
import type { ActionResult } from "@/lib/action-result";
import { formatDateTime } from "@/lib/format";
import { relativeDay, shortName, type RoomProps } from "@/lib/room/view";
import { toast } from "./Toast";

const SOURCE: Record<string, string> = { UPLOAD: "הועלתה ידנית", ADDIN: "מתוסף Word", GRAPH: "מ-SharePoint" };
/** Below this share of matching text, the PDF may not come from the same Word file. */
const MATCH_WARN = 85;

/** The versions: view one, download Word/PDF, upload a new one. */
export function VersionsPanel({
  room,
  viewing,
  onView,
  wordSlot,
}: {
  room: RoomProps;
  viewing: number;
  onView: (n: number) => void;
  /** "ערוך ב-Word" (only with Microsoft 365), rendered on the server. */
  wordSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {wordSlot}

      {room.can.uploadVersion && <UploadForm letterId={room.id} next={room.latestVersion + 1} />}

      <section className="flex flex-col gap-2" aria-labelledby="versions-h">
        <h3 id="versions-h" className="text-sm font-bold text-muted">
          {room.versions.length ? `גרסאות (${room.versions.length})` : "גרסאות"}
        </h3>
        {room.versions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-surface-2 p-3 text-sm text-muted">עוד לא הועלתה גרסה.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {room.versions.map((v, i) => {
              const lowMatch = v.textMatch !== null && v.textMatch < MATCH_WARN;
              return (
                <li key={v.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${v.number === viewing ? "border-accent" : "border-line"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      גרסה {v.number}
                      {i === 0 && <span className="ms-2 text-xs font-semibold text-muted">(אחרונה)</span>}
                      {v.number === viewing && <span className="ms-2 text-xs font-semibold text-accent">מוצגת עכשיו</span>}
                    </p>
                    <span className="text-xs text-muted" title={formatDateTime(new Date(v.createdAt))}>
                      {shortName(v.createdByName)} · {relativeDay(v.createdAt)}
                    </span>
                  </div>
                  {v.note && <p className="whitespace-pre-wrap text-sm">&quot;{v.note}&quot;</p>}
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    <span>{v.pageCount === 1 ? "עמוד אחד" : `${v.pageCount} עמודים`}</span>
                    <span className="inline-flex items-center gap-1">
                      {v.pdfSource === "ADDIN" && <Puzzle aria-hidden className="size-3.5" />}
                      {SOURCE[v.pdfSource] ?? v.pdfSource}
                    </span>
                    {v.textMatch !== null && !lowMatch && <span>הטקסט תואם ל-Word ({v.textMatch}%)</span>}
                  </p>
                  {lowMatch && (
                    <p className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-sm text-warn">
                      <TriangleAlert aria-hidden className="mt-0.5 size-4" />
                      הטקסט ב-PDF תואם ל-Word רק ב-{v.textMatch}%. ייתכן שה-PDF לא יוצא מאותו קובץ Word. כדאי לבדוק לפני שמאשרים.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {v.number !== viewing && (
                      <button type="button" className={`${btnQuiet} hover:border-line-strong hover:text-fg`} onClick={() => onView(v.number)}>
                        <Eye aria-hidden className="size-4" />
                        הצג
                      </button>
                    )}
                    {v.hasDocx && (
                      <a href={`/api/versions/${v.id}/docx`} className={`${btnQuiet} hover:border-line-strong hover:text-fg`}>
                        <FileDown aria-hidden className="size-4" />
                        Word
                      </a>
                    )}
                    <a href={`/api/versions/${v.id}/pdf`} target="_blank" rel="noopener" className={`${btnQuiet} hover:border-line-strong hover:text-fg`}>
                      <FileText aria-hidden className="size-4" />
                      PDF
                      <span className="sr-only">(נפתח בלשונית חדשה)</span>
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function UploadForm({ letterId, next }: { letterId: string; next: number }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(uploadVersionAction, null);
  const ref = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<{ docx?: File; pdf?: File }>({});
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (state && "ok" in state) {
      ref.current?.reset();
      setFiles({});
      toast(state.message ?? "הגרסה הועלתה");
    }
  }, [state]);

  /** Takes whatever was chosen or dropped: the Word file and the PDF are told apart by their names. */
  function take(list: FileList | File[] | null) {
    if (!list) return;
    const next = { ...files };
    const skipped: string[] = [];
    for (const f of Array.from(list)) {
      const n = f.name.toLowerCase();
      if (n.endsWith(".docx")) next.docx = f;
      else if (n.endsWith(".pdf")) next.pdf = f;
      else skipped.push(f.name);
    }
    setFiles(next);
    setProblem(skipped.length ? `אפשר להעלות רק PDF (ובנוסף Word). לא נקלט: ${skipped.join(", ")}` : null);
  }

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        if (!files.pdf) {
          setProblem(files.docx ? "חסר קובץ ה-PDF. ב-Word: קובץ ← שמירה בשם ← PDF." : "בחרו את קובץ ה-PDF של המכתב.");
          return;
        }
        setProblem(null);
        const form = new FormData(e.currentTarget);
        form.set("letterId", letterId);
        if (files.docx) form.set("docx", files.docx);
        form.set("pdf", files.pdf);
        startTransition(() => dispatch(form));
      }}
      className={`${card} flex flex-col gap-3`}
      aria-labelledby="upload-h"
      aria-busy={pending}
    >
      <h3 id="upload-h" className="flex items-center gap-1.5 font-bold">
        <FileUp aria-hidden className="size-4 text-accent" />
        העלאת גרסה {next}
      </h3>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-accent ${
          over ? "border-accent bg-accent-soft/60" : files.pdf ? "border-good/60 bg-good-soft/40" : "border-line-strong bg-surface hover:border-accent hover:bg-accent-soft/40"
        }`}
      >
        <Upload aria-hidden className="size-6 text-accent" />
        <span className="font-semibold">גוררים לכאן את ה-PDF של המכתב, או לוחצים לבחירה</span>
        <span className={hint}>זה הקובץ שהמבקרים יסמנו עליו. אפשר לצרף גם את קובץ ה-Word (לא חובה).</span>
        <input type="file" multiple accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => take(e.currentTarget.files)} />
      </label>
      <ul className="flex flex-col gap-1.5 text-sm">
        <PickedFile title="PDF" file={files.pdf} tone="text-bad" />
        <PickedFile title="Word (לא חובה)" file={files.docx} tone="text-accent" empty="לא צורף" />
      </ul>
      <p className={hint}>אחרי כל תיקון ב-Word: קובץ ← שמירה בשם ← PDF, ומעלים כאן.</p>
      <label className="flex flex-col gap-1.5">
        <span className={label}>מה השתנה? (לא חובה)</span>
        <textarea name="note" rows={2} maxLength={2000} className={input} placeholder="למשל: תוקנו הימים ושכר הלימוד" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>
          {pending ? <Spinner /> : <Upload aria-hidden className="size-4" />}
          {pending ? "מעלה…" : "העלה גרסה"}
        </button>
        {problem ? (
          <p role="alert" className="text-sm font-semibold text-bad">
            {problem}
          </p>
        ) : (
          <FormMessage state={state && "error" in state ? state : null} />
        )}
      </div>
    </form>
  );
}

function PickedFile({ title, file, tone, empty = "עוד לא נבחר" }: { title: string; file?: File; tone: string; empty?: string }) {
  return (
    <li className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${file ? "border-good/50 bg-good-soft/30" : "border-line text-muted"}`}>
      {file ? <Check aria-hidden className="size-4 text-good" /> : <FileText aria-hidden className={`size-4 ${tone}`} />}
      <span className="font-semibold">{title}</span>
      <span className="min-w-0 flex-1 truncate" dir="auto">
        {file ? file.name : empty}
      </span>
    </li>
  );
}
