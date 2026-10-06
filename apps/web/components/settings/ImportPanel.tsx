"use client";

import { CircleAlert, CircleCheck, FileSpreadsheet, ScanSearch, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { Tag } from "@/components/Pills";
import { Spinner } from "@/components/Spinner";
import { btnPrimary, btnSecondary, input } from "@/components/ui";
import type { ImportState } from "@/app/(app)/settings/tracks/actions";

type Status = "OK" | "CREATED" | "EXISTS" | "ERROR" | "SKIPPED";
const LABEL: Record<Status, string> = { OK: "מוכן לייבוא", CREATED: "נוסף", EXISTS: "כבר קיים", ERROR: "לא ניתן לייבא", SKIPPED: "דולג" };
const TONE: Record<Status, "accent" | "good" | "muted" | "bad"> = { OK: "accent", CREATED: "good", EXISTS: "muted", SKIPPED: "muted", ERROR: "bad" };
const ORDER: Record<Status, number> = { ERROR: 0, OK: 1, CREATED: 1, EXISTS: 2, SKIPPED: 3 };

/**
 * Tracks from a spreadsheet into the season: a preview that changes nothing, then the import.
 * The chosen file stays chosen between the two (the form is not reset), so it is one click more.
 */
export function ImportPanel({
  action,
  seasonId,
  seasonName,
}: {
  action: (prev: ImportState, form: FormData) => Promise<ImportState>;
  seasonId: string;
  seasonName: string;
}) {
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(action, null);
  const [fileName, setFileName] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  // A report of another file than the one chosen now is not shown.
  const report = state?.report && state.fileName === fileName ? state.report : null;

  const rows = useMemo(() => {
    if (!report) return [];
    const sorted = [...report.rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.line - b.line);
    return onlyProblems ? sorted.filter((r) => r.status === "ERROR") : sorted;
  }, [report, onlyProblems]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  }

  const imported = state?.mode === "import" && report;
  const ready = report && state?.mode === "preview" ? report.counts.ok : 0;

  return (
    <div className="flex flex-col gap-4">
      <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3" aria-busy={pending}>
        <input type="hidden" name="seasonId" value={seasonId} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">קובץ Excel (xlsx) או CSV</span>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,.txt"
            className={`${input} file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:font-semibold file:text-accent`}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
        </label>
        <p className="text-sm text-muted">
          בשורה הראשונה: <b>קמפוס</b>, <b>פקולטה</b>, <b>מסלול</b> (שם) ו<b>קוד מסלול</b>. עמודת &quot;יועצת בקרה&quot; (שם או מייל) לא חובה: בלעדיה כל מסלול
          מקבל את היועצת של הקמפוס או הפקולטה שלו. עמודות אחרות לא משנות. המסלולים ייכנסו לעונה <b>{seasonName}</b>. מסלול שכבר קיים לא יוכפל.
        </p>
        <div className="flex flex-wrap gap-2">
          <button name="intent" value="preview" className={btnSecondary} disabled={pending}>
            {pending ? <Spinner /> : <ScanSearch aria-hidden className="size-4" />}
            בדיקה מקדימה (לא משנה כלום)
          </button>
          <button ref={importButton} name="intent" value="import" className={btnPrimary} disabled={pending}>
            <Upload aria-hidden className="size-4" />
            ייבוא
          </button>
        </div>
        {state?.error && (
          <p role="alert" className="flex items-start gap-1.5 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
            <CircleAlert aria-hidden className="mt-0.5 size-4" />
            {state.error}
          </p>
        )}
      </form>

      {report && (
        <section aria-labelledby="import-result" className="flex flex-col gap-3" aria-live="polite">
          <h4 id="import-result" className="flex items-center gap-2 font-bold">
            <FileSpreadsheet aria-hidden className="size-5 text-accent" />
            {imported ? "הייבוא הסתיים" : "בדיקה מקדימה: מה יקרה"}
            <span className="text-sm font-normal text-muted">({state?.fileName})</span>
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {imported ? (
              <Tag tone="good" icon={CircleCheck}>
                {report.counts.created} נוספו
              </Tag>
            ) : (
              <Tag tone="accent">{report.counts.ok} מוכנים לייבוא</Tag>
            )}
            <Tag>{report.counts.exists} כבר קיימים</Tag>
            {report.counts.skipped > 0 && <Tag>{report.counts.skipped} דולגו (שורות שאינן מסלול)</Tag>}
            <Tag tone={report.counts.error ? "bad" : "muted"} icon={report.counts.error ? CircleAlert : undefined}>
              {report.counts.error} בעיות
            </Tag>
          </div>

          {report.unitsWithoutManager.length > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 text-warn" />
              <span>
                חסר מנהל רישום או יועצת ל: {report.unitsWithoutManager.map((u) => `${u.faculty} (${u.campus})`).join(", ")}. אפשר להגדיר אותם ב
                <Link href="/settings/units" className="font-semibold text-accent underline">
                  קמפוסים ופקולטות
                </Link>{" "}
                ולייבא שוב: מה שכבר נוסף לא יוכפל.
              </span>
            </p>
          )}

          {!imported && ready > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft/60 p-3">
              <span className="text-sm font-semibold">הכול נראה בסדר? אותו קובץ, בלחיצה אחת:</span>
              <button
                type="button"
                className={btnPrimary}
                disabled={pending}
                onClick={() => form.current?.requestSubmit(importButton.current)}
              >
                {pending ? <Spinner /> : <Upload aria-hidden className="size-4" />}
                ייבוא {ready} מסלולים
              </button>
            </div>
          )}

          {report.counts.error > 0 && (
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              להציג רק שורות עם בעיה
            </label>
          )}

          <ul className="flex max-h-[32rem] flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface shadow-card">
            {rows.map((r) => (
              <li key={r.line} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:gap-3">
                <span className="tabular w-14 shrink-0 text-xs text-muted">שורה {r.line}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">
                    {r.trackName || "—"} <bdi className="tabular font-normal text-muted">{r.trackNumber}</bdi>
                  </span>
                  <span className="text-muted">
                    {r.faculty || "—"} · {r.campus || "—"}
                    {(r.advisorName ?? r.advisor) && <> · יועצת: {r.advisorName ?? r.advisor}</>}
                  </span>
                  {r.problem && <span className="text-bad">{r.problem}</span>}
                </span>
                <span className="shrink-0">
                  <Tag tone={TONE[r.status]} icon={r.status === "ERROR" ? CircleAlert : r.status === "CREATED" ? CircleCheck : undefined}>
                    {LABEL[r.status]}
                  </Tag>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
