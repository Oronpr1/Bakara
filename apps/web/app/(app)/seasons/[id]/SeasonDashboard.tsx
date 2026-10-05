import { STAGE_LABELS, STAGES, type Stage } from "@al/domain";
import Link from "next/link";
import { card } from "@/components/ui";
import type { LetterListItem } from "@/lib/letters/queries";

const DAY = 24 * 60 * 60 * 1000;

/** Where the season stands: progress to "approved for distribution", stage counts, and who is behind. */
export function SeasonDashboard({
  letters,
  reminderIntervalDays,
  selectedStage,
  now = new Date(),
}: {
  letters: LetterListItem[];
  reminderIntervalDays: number;
  selectedStage?: Stage;
  now?: Date;
}) {
  if (letters.length === 0) return null;
  const total = letters.length;
  const count = (s: Stage) => letters.filter((l) => l.row.stage === s).length;
  const approved = count("APPROVED");
  const pct = Math.round((approved / total) * 100);
  const overdue = letters.filter((l) => l.overdue).length;
  const openComments = letters.reduce((n, l) => n + l.openComments, 0);
  const stuck = letters.filter(
    (l) => l.row.stage !== "APPROVED" && now.getTime() - l.row.stageChangedAt.getTime() > reminderIntervalDays * DAY,
  ).length;

  const groups = new Map<string, LetterListItem[]>();
  for (const l of letters) groups.set(l.row.advisorId, [...(groups.get(l.row.advisorId) ?? []), l]);
  const byAdvisor = [...groups.entries()]
    .map(([id, items]) => ({
      id,
      name: items[0]!.advisorName,
      total: items.length,
      approved: items.filter((l) => l.row.stage === "APPROVED").length,
      draft: items.filter((l) => l.row.stage === "DRAFT").length,
      overdue: items.filter((l) => l.overdue).length,
      openComments: items.reduce((n, l) => n + l.openComments, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  return (
    <section aria-labelledby="dash-h" className={`${card} flex flex-col gap-5`}>
      <div className="flex flex-col gap-2">
        <h2 id="dash-h" className="flex flex-wrap items-baseline justify-between gap-2 font-bold">
          תמונת מצב
          <span className="text-sm font-normal text-muted">
            <span className="tabular font-semibold text-fg">{approved}</span> מתוך{" "}
            <span className="tabular">{total}</span> מאושרים להפצה ({pct}%)
          </span>
        </h2>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-bg"
          role="progressbar"
          aria-label="התקדמות לאישור להפצה"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="דרישות לפי שלב">
        {STAGES.map((s) => {
          const n = count(s);
          const active = selectedStage === s;
          return (
            <li key={s}>
              <Link
                href={active ? "?" : `?stage=${s}`}
                aria-current={active ? "true" : undefined}
                className={`flex h-full flex-col gap-0.5 rounded-lg border px-3 py-2 hover:border-accent ${
                  active ? "border-accent bg-accent-soft" : "border-line"
                } ${n === 0 ? "text-muted" : ""}`}
              >
                <span className="tabular text-2xl font-bold">{n}</span>
                <span className="text-sm">{STAGE_LABELS[s]}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <li>
          <Link href="?overdue=1" className={overdue ? "font-semibold text-bad hover:underline" : "text-muted"}>
            {overdue} באיחור מול תאריך היעד
          </Link>
        </li>
        <li className={stuck ? "font-semibold text-warn" : "text-muted"}>
          {stuck} באותו שלב יותר מ-{reminderIntervalDays} ימים
        </li>
        <li className="text-muted">{openComments} הערות פתוחות בעונה</li>
      </ul>

      {byAdvisor.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">התקדמות לפי יועצת</caption>
            <thead className="text-muted">
              <tr className="border-b border-line text-start">
                <th scope="col" className="py-2 text-start font-semibold">יועצת</th>
                <th scope="col" className="py-2 text-start font-semibold">דרישות</th>
                <th scope="col" className="py-2 text-start font-semibold">מאושרים</th>
                <th scope="col" className="py-2 text-start font-semibold">בהכנה</th>
                <th scope="col" className="py-2 text-start font-semibold">באיחור</th>
                <th scope="col" className="py-2 text-start font-semibold">הערות פתוחות</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {byAdvisor.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 text-start font-semibold">
                    <Link href={`?advisor=${a.id}`} className="hover:underline">
                      {a.name}
                    </Link>
                  </th>
                  <td className="py-2">{a.total}</td>
                  <td className="py-2">{a.approved}</td>
                  <td className="py-2">{a.draft}</td>
                  <td className={`py-2 ${a.overdue ? "font-semibold text-bad" : ""}`}>{a.overdue}</td>
                  <td className="py-2">{a.openComments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
