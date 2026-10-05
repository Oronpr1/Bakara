import { STAGE_LABELS, STAGES, type Stage } from "@al/domain";
import Link from "next/link";
import { CalendarCheck2, CalendarX2, Check, Hourglass, MessageSquare } from "lucide-react";
import { STAGE_ICONS, STAGE_MARKS, STAGE_STYLES } from "@/components/Pills";
import { card, sectionTitle } from "@/components/ui";
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

  const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset";
  const quietChip = `${chip} bg-surface-2 text-muted ring-line`;

  return (
    <section aria-labelledby="dash-h" className={`${card} flex flex-col gap-5`}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="dash-h" className={sectionTitle}>
            תמונת מצב
          </h2>
          <p className="text-sm text-muted">
            <span className="tabular font-bold text-fg">{approved}</span> מתוך <span className="tabular">{total}</span>{" "}
            מאושרים להפצה · <span className="tabular font-semibold text-fg">{pct}%</span>
          </p>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="מאושרים להפצה"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${approved} מתוך ${total} (${pct}%)`}
        >
          <div className="h-full rounded-full bg-good transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="דרישות לפי שלב">
        {STAGES.map((s) => {
          const n = count(s);
          const active = selectedStage === s;
          const Icon = STAGE_ICONS[s];
          return (
            <li key={s}>
              <Link
                href={active ? "?" : `?stage=${s}`}
                aria-current={active ? "true" : undefined}
                aria-label={`${STAGE_LABELS[s]}: ${n}${active ? " (מסונן, לחצו לביטול)" : ""}`}
                className={`relative flex h-full flex-col gap-2 overflow-hidden rounded-lg border p-3 transition-colors duration-150 ${
                  active
                    ? "border-accent bg-accent-soft ring-1 ring-accent"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
                }`}
              >
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${STAGE_MARKS[s]} ${n === 0 && !active ? "opacity-40" : ""}`} />
                <span className="flex items-center justify-between gap-2">
                  <span className={`grid size-8 place-items-center rounded-md ring-1 ring-inset ${STAGE_STYLES[s]}`}>
                    <Icon aria-hidden className="size-4" />
                  </span>
                  {active && <Check aria-hidden className="size-4 text-accent" />}
                </span>
                <span className={`tabular text-2xl leading-none font-bold ${n === 0 ? "text-muted" : ""}`}>{n}</span>
                <span className={`text-sm leading-tight ${n === 0 ? "text-muted" : "font-semibold"}`}>{STAGE_LABELS[s]}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="flex flex-wrap gap-2" aria-label="מה דורש תשומת לב">
        <li>
          {overdue ? (
            <Link href="?overdue=1" className={`${chip} bg-bad-soft font-semibold text-bad ring-bad/30 hover:ring-bad/60`}>
              <CalendarX2 aria-hidden className="size-4" />
              <span className="tabular">{overdue}</span> באיחור מול תאריך היעד
            </Link>
          ) : (
            <span className={quietChip}>
              <CalendarCheck2 aria-hidden className="size-4" />
              אין דרישות באיחור
            </span>
          )}
        </li>
        <li>
          <span className={stuck ? `${chip} bg-warn-soft font-semibold text-warn ring-warn/30` : quietChip}>
            <Hourglass aria-hidden className="size-4" />
            <span className="tabular">{stuck}</span> באותו שלב יותר מ-{reminderIntervalDays} ימים
          </span>
        </li>
        <li>
          <span className={quietChip}>
            <MessageSquare aria-hidden className="size-4" />
            <span className="tabular">{openComments}</span> הערות פתוחות בעונה
          </span>
        </li>
      </ul>

      {byAdvisor.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="pb-2 text-start font-bold">התקדמות לפי יועצת</caption>
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 text-start font-semibold">יועצת</th>
                <th scope="col" className="py-2 text-start font-semibold">דרישות</th>
                <th scope="col" className="py-2 text-start font-semibold">מאושרים</th>
                <th scope="col" className="hidden py-2 text-start font-semibold sm:table-cell">בהכנה</th>
                <th scope="col" className="py-2 text-start font-semibold">באיחור</th>
                <th scope="col" className="hidden py-2 text-start font-semibold sm:table-cell">הערות פתוחות</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {byAdvisor.map((a) => (
                <tr key={a.id} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                  <th scope="row" className="py-2 text-start font-semibold">
                    <Link href={`?advisor=${a.id}`} className="text-accent hover:underline">
                      {a.name}
                    </Link>
                  </th>
                  <td className="py-2">{a.total}</td>
                  <td className="py-2">{a.approved}</td>
                  <td className="hidden py-2 sm:table-cell">{a.draft}</td>
                  <td className={`py-2 ${a.overdue ? "font-semibold text-bad" : "text-muted"}`}>{a.overdue}</td>
                  <td className={`hidden py-2 sm:table-cell ${a.openComments ? "" : "text-muted"}`}>{a.openComments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
