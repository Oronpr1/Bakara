"use client";

import { BookOpen, CircleAlert, CircleCheck, Download, FileSpreadsheet, ScanSearch, TriangleAlert, Upload } from "lucide-react";
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

/** How to prepare the file, with the example to start from. Same wording as the example's "הוראות" sheet. */
function ImportGuide() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-soft/50 p-3 text-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-bold">
          <BookOpen aria-hidden className="size-4 text-accent" />
          איך מכינים את הקובץ
        </p>
        <a href="/settings/tracks/sample.xlsx" download className={btnSecondary}>
          <Download aria-hidden className="size-4" />
          הורד קובץ לדוגמה
        </a>
      </div>
      <ol className="flex list-decimal flex-col gap-1.5 ps-5">
        <li>
          קובץ Excel (או CSV). בגיליון הראשון, השורה הראשונה היא כותרות, ומתחתיה מסלול בכל שורה. הכי פשוט: להוריד את הקובץ לדוגמה ולמלא אותו.
        </li>
        <li>
          עמודות חובה (בכל סדר): <b>קמפוס</b>, <b>פקולטה</b>, <b>מסלול</b> (שם המסלול), <b>קוד מסלול</b> (ספרות בלבד, למשל 228114002).
        </li>
        <li>
          עמודה לא חובה: <b>יועצת בקרה</b>, בשם או במייל כמו שהיא רשומה במערכת. בלעדיה, היועצת נלקחת מהקמפוס או מהפקולטה. מנהל הרישום תמיד נקבע לפי
          הקמפוס או הפקולטה (בלשונית{" "}
          <Link href="/settings/units" className="font-semibold text-accent underline">
            קמפוסים ופקולטות
          </Link>
          ).
        </li>
        <li>עמודות נוספות (יעד, הערות וכדומה) לא משנות ולא נקראות.</li>
      </ol>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">מה קורה לשורות שאינן תקינות</p>
        <ul className="flex list-disc flex-col gap-1 ps-5">
          <li>שורות מקום, כמו &quot;ללא ממ&quot;ה&quot; או קוד &quot;-&quot;, מדולגות.</li>
          <li>שורה בלי פקולטה, עם קוד לא תקין, או עם קוד שמופיע פעמיים באותו קמפוס, מסומנת כבעיה ולא נכנסת. שאר השורות נכנסות.</li>
          <li>מסלול בלי יועצת (לא בקובץ ולא בקמפוס או בפקולטה) לא נכנס. מסלול בלי מנהל רישום נכנס, ומסומן באדום עד שמגדירים לו.</li>
          <li>אפשר לייבא שוב את אותו קובץ אחרי שהשלמתם הגדרות: מסלול שכבר קיים לא יוכפל.</li>
        </ul>
      </div>
    </div>
  );
}

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
      <ImportGuide />
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
          המסלולים ייכנסו לעונה <b className="text-fg">{seasonName}</b>. קודם בודקים מה יקרה, ואז מייבאים.
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
