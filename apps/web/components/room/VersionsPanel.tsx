"use client";

import { Eye, FileDown, FileText, FileUp, History, Puzzle, TriangleAlert, Upload } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef } from "react";
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

/** The versions: view one, download Word/PDF, upload a new one; last year's letter as a starting point. */
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
      {room.starter && (room.can.uploadVersion || room.phase === "DRAFT") && (
        <section className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-soft/40 p-3" aria-labelledby="starter-h">
          <h3 id="starter-h" className="flex items-center gap-1.5 font-bold">
            <History aria-hidden className="size-4 text-accent" />
            המכתב של השנה שעברה כנקודת פתיחה
          </h3>
          <p className="text-sm text-muted">
            {room.starter.seasonName} · גרסה {room.starter.number}. מורידים, עורכים ב-Word, ומעלים כגרסה חדשה כאן.
          </p>
          <a href={`/api/versions/${room.starter.versionId}/docx`} className={`${btnQuiet} self-start border-accent/40 text-accent hover:border-accent hover:text-accent`}>
            <FileDown aria-hidden className="size-4" />
            הורד את קובץ ה-Word של השנה שעברה
          </a>
        </section>
      )}

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
                    <a href={`/api/versions/${v.id}/docx`} className={`${btnQuiet} hover:border-line-strong hover:text-fg`}>
                      <FileDown aria-hidden className="size-4" />
                      Word
                    </a>
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
  useEffect(() => {
    if (state && "ok" in state) {
      ref.current?.reset();
      toast(state.message ?? "הגרסה הועלתה");
    }
  }, [state]);
  return (
    <form
      ref={ref}
      action={dispatch}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => dispatch(form));
      }}
      className={`${card} flex flex-col gap-3`}
      aria-labelledby="upload-h"
      aria-busy={pending}
    >
      <input type="hidden" name="letterId" value={letterId} />
      <h3 id="upload-h" className="flex items-center gap-1.5 font-bold">
        <FileUp aria-hidden className="size-4 text-accent" />
        העלאת גרסה {next}
      </h3>
      <p className={hint}>מעלים את קובץ ה-Word ואת ה-PDF שיוצא ממנו (ב-Word: קובץ ← שמירה בשם ← PDF). ה-PDF משמש לבדיקה, וה-Word נשמר כמו שהוא.</p>
      <label className="flex flex-col gap-1.5">
        <span className={label}>קובץ Word (DOCX)</span>
        <input type="file" name="docx" required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className={`${input} py-2 text-sm`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label}>קובץ PDF</span>
        <input type="file" name="pdf" required accept=".pdf,application/pdf" className={`${input} py-2 text-sm`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label}>מה השתנה? (לא חובה)</span>
        <textarea name="note" rows={2} maxLength={2000} className={input} placeholder="למשל: תוקנו הימים ושכר הלימוד" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>
          {pending ? <Spinner /> : <Upload aria-hidden className="size-4" />}
          {pending ? "מעלה…" : "העלה גרסה"}
        </button>
        <FormMessage state={state && "error" in state ? state : null} />
      </div>
    </form>
  );
}
