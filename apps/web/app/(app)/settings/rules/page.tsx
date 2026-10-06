import { Check, ChevronLeft, Info, Minus, SquareDashed } from "lucide-react";
import { notFound } from "next/navigation";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { RULE_GROUPS, RULE_ROLES, type RuleCell } from "@/lib/settings/rules-doc";
import { canOpenTab } from "@/lib/settings/tabs";
import { summary as summaryClass } from "@/components/ui";

export const metadata = { title: "כללים · הגדרות · מכתבי קבלה" };

const LEVEL = {
  yes: { icon: Check, text: "כן", cls: "text-good" },
  partial: { icon: SquareDashed, text: "בחלק מהמקרים", cls: "text-warn" },
  no: { icon: Minus, text: "לא", cls: "text-muted/60" },
} as const;

function Cell({ cell, compact = false }: { cell: RuleCell; compact?: boolean }) {
  const l = LEVEL[cell.level];
  // The note is what matters in a partial cell; a plain yes/no is the icon (and its words for screen readers).
  const visible = cell.note ?? (compact && cell.level === "yes" ? "כן" : null);
  return (
    <span className={`flex items-start gap-1.5 ${compact ? "" : "justify-center text-center"}`}>
      <l.icon aria-hidden className={`mt-0.5 size-4 ${l.cls}`} />
      {visible ? (
        <span className={`text-xs leading-snug ${compact ? "text-fg" : "text-muted"}`}>
          {cell.level === "partial" && <span className="sr-only">{l.text}: </span>}
          {visible}
        </span>
      ) : (
        <span className="sr-only">{l.text}</span>
      )}
    </span>
  );
}

export default async function RulesPage() {
  if (!canOpenTab(actorOf(await requireUser()), "rules")) notFound();
  const rows = RULE_GROUPS.flatMap((g) => g.rows);

  return (
    <section aria-labelledby="rules-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="rules-title" className="text-xl font-bold">
          כללים: מה כל תפקיד יכול לעשות
        </h2>
        <p className="text-sm text-muted">כך המערכת עובדת היום. אדם עם כמה תפקידים יכול לעשות את כל מה שכל אחד מהם מאפשר.</p>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-sm">
        <Info aria-hidden className="mt-0.5 size-4 text-accent" />
        <span>
          <b>קריאה בלבד בשלב הזה.</b> שינוי הכללים מהמסך יגיע בשלב נפרד. עד אז, שינוי בכלל נעשה על ידי צוות הפיתוח.
        </span>
      </p>

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-label="מקרא">
        {(["yes", "partial", "no"] as const).map((k) => {
          const l = LEVEL[k];
          return (
            <li key={k} className="inline-flex items-center gap-1.5">
              <l.icon aria-hidden className={`size-4 ${l.cls}`} />
              {k === "yes" ? "יכול" : k === "partial" ? "רק בחלק מהמקרים (ההסבר בתא)" : "לא יכול"}
            </li>
          );
        })}
      </ul>

      {/* Desktop and tablet: one table, actions down, roles across. */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card md:block">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">פעולות במערכת לפי תפקיד</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="sticky start-0 z-10 w-64 bg-surface-2 px-3 py-2.5 text-start font-semibold text-muted">
                פעולה
              </th>
              {RULE_ROLES.map((r) => (
                <th key={r.role} scope="col" className="px-2 py-2.5 text-center font-semibold">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          {RULE_GROUPS.map((g) => (
            <tbody key={g.title} className="border-t border-line">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={RULE_ROLES.length + 1}
                  className="bg-accent-soft/50 px-3 py-1.5 text-start text-xs font-bold tracking-wide text-accent"
                >
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <th scope="row" className="sticky start-0 z-10 bg-surface px-3 py-2.5 text-start font-semibold">
                    {r.label}
                    {r.hint && <span className="mt-0.5 block text-xs font-normal text-muted">{r.hint}</span>}
                  </th>
                  {RULE_ROLES.map(({ role }) => (
                    <td key={role} className="px-2 py-2.5">
                      <Cell cell={r.cells[role]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* Phone: one role at a time, only what it can do. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {RULE_ROLES.map(({ role, label }) => {
          const can = rows.filter((r) => r.cells[role].level !== "no");
          return (
            <li key={role}>
              <details className="group rounded-xl border border-line bg-surface shadow-card">
                <summary className={`${summaryClass} w-full justify-between px-4 py-3 text-fg`}>
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronLeft aria-hidden className="chev size-4 text-accent" />
                    {label}
                  </span>
                  <span className="text-sm font-normal text-muted">
                    <span className="tabular">{can.length}</span> פעולות
                  </span>
                </summary>
                <ul className="flex flex-col divide-y divide-line border-t border-line px-4">
                  {can.length === 0 ? (
                    <li className="py-3 text-sm text-muted">אין פעולות לתפקיד הזה.</li>
                  ) : (
                    can.map((r) => (
                      <li key={r.id} className="flex flex-col gap-1 py-2.5">
                        <span className="text-sm font-semibold">{r.label}</span>
                        <Cell cell={r.cells[role]} compact />
                      </li>
                    ))
                  )}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
