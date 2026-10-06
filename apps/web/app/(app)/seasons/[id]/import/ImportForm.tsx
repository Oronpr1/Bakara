"use client";

import { CircleAlert, CircleCheck, FileSpreadsheet, ScanSearch, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Spinner } from "@/components/Spinner";
import { btnPrimary, btnSecondary, card, input } from "@/components/ui";
import { importTracksAction, type ImportState } from "./actions";

const STATUS_LABEL = { OK: "מוכן לייבוא", CREATED: "נוצר", EXISTS: "כבר קיים", ERROR: "לא ניתן לייבא" } as const;
const STATUS_STYLE = {
  OK: "text-accent",
  CREATED: "text-good",
  EXISTS: "text-muted",
  ERROR: "text-bad",
} as const;

export function ImportForm({ seasonId, seasonName }: { seasonId: string; seasonName: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importTracksAction, null);
  const report = state?.report;
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className={`${card} flex flex-col gap-4`} aria-busy={pending}>
        <input type="hidden" name="seasonId" value={seasonId} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">קובץ Excel (xlsx) או CSV</span>
          <input name="file" type="file" required accept=".xlsx,.csv,.txt" className={input} />
        </label>
        <p className="text-sm text-muted">
          עמודות בשורת הכותרת: שם מסלול, מספר מסלול, פקולטה, קמפוס, יועץ בקרה (שם או מייל). המסלולים ייווצרו בעונה {seasonName}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button name="intent" value="preview" className={btnSecondary} disabled={pending}>
            {pending ? <Spinner /> : <ScanSearch aria-hidden className="size-4" />}
            בדיקה מקדימה (לא משנה כלום)
          </button>
          <button name="intent" value="import" className={btnPrimary} disabled={pending}>
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
        <section aria-labelledby="import-result" className="flex flex-col gap-3">
          <h2 id="import-result" className="flex items-center gap-2 text-lg font-bold">
            <FileSpreadsheet aria-hidden className="size-5 text-accent" />
            {state?.mode === "import" ? "תוצאת הייבוא" : "בדיקה מקדימה"}
          </h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {state?.mode === "import" ? (
              <span className="inline-flex items-center gap-1 font-semibold text-good">
                <CircleCheck aria-hidden className="size-4" />
                {report.counts.created} נוצרו
              </span>
            ) : (
              <span className="font-semibold text-accent">{report.counts.ok} מוכנים לייבוא</span>
            )}
            <span className="text-muted">{report.counts.exists} כבר קיימים</span>
            <span className={report.counts.error ? "font-semibold text-bad" : "text-muted"}>{report.counts.error} בעיות</span>
          </p>
          {report.unitsWithoutManager.length > 0 && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-sm">
              חסר מנהל רישום ל: {report.unitsWithoutManager.map((u) => `${u.faculty} (${u.campus})`).join(", ")}.{" "}
              <Link href="/admin/units" className="font-semibold text-accent underline">
                להגדרה
              </Link>{" "}
              ואז לייבא שוב. מה שכבר נוצר לא יוכפל.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-surface-2 text-start text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">שורה</th>
                  <th className="px-3 py-2 text-start font-semibold">מסלול</th>
                  <th className="px-3 py-2 text-start font-semibold">מספר</th>
                  <th className="px-3 py-2 text-start font-semibold">פקולטה · קמפוס</th>
                  <th className="px-3 py-2 text-start font-semibold">יועצת</th>
                  <th className="px-3 py-2 text-start font-semibold">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="tabular px-3 py-2">{r.line}</td>
                    <td className="px-3 py-2">{r.trackName}</td>
                    <td className="tabular px-3 py-2">{r.trackNumber}</td>
                    <td className="px-3 py-2">
                      {r.faculty} · {r.campus}
                    </td>
                    <td className="px-3 py-2">{r.advisorName ?? r.advisor}</td>
                    <td className={`px-3 py-2 ${STATUS_STYLE[r.status]}`}>
                      <span className="font-semibold">{STATUS_LABEL[r.status]}</span>
                      {r.problem && <span className="block text-xs">{r.problem}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
