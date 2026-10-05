import { CalendarX2, ChevronLeft, FileSearch, MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { StagePill, Tag } from "@/components/Pills";
import { formatDate } from "@/lib/format";
import type { LetterListItem } from "@/lib/letters/queries";

/** An empty cell that still says something to screen readers. */
function Nothing({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

function Due({ item }: { item: LetterListItem }) {
  if (!item.row.dueDate) return <Nothing label="ללא תאריך יעד" />;
  return item.overdue ? (
    <Tag tone="bad" icon={CalendarX2}>
      באיחור · <span className="tabular">{formatDate(item.row.dueDate)}</span>
    </Tag>
  ) : (
    <span className="tabular">{formatDate(item.row.dueDate)}</span>
  );
}

function Comments({ n }: { n: number }) {
  return n > 0 ? (
    <Tag tone="warn" icon={MessageSquare}>
      <span className="tabular">{n}</span>
    </Tag>
  ) : (
    <Nothing label="אין" />
  );
}

const waiting = (item: LetterListItem) => (item.waitingOn === "—" ? null : item.waitingOn);
/** The track name is the row's link; this stretches its hit area over the whole row or card. */
const stretched = "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";
const focusRing = "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-accent";

/** Table on wide screens, stacked cards on phones. Each row opens the letter. */
export function LetterTable({ items }: { items: LetterListItem[] }) {
  if (items.length === 0)
    return (
      <EmptyState icon={FileSearch} title="אין דרישות להצגה">
        נסו לשנות את הסינון או לנקות אותו.
      </EmptyState>
    );
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-xs text-muted">
            <tr>
              {["מסלול", "קמפוס · פקולטה", "יועצת", "שלב", "גרסה", "הערות פתוחות", "תאריך יעד", "ממתין ל"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.row.id}
                className={`relative border-t border-line transition-colors duration-150 first:border-t-0 hover:bg-accent-soft/50 ${focusRing} has-[a:focus-visible]:-outline-offset-2`}
              >
                <td className="px-3 py-3">
                  <Link href={`/letters/${item.row.id}`} className={`font-semibold text-accent ${stretched}`}>
                    {item.row.trackName}
                  </Link>
                  <span className="tabular block text-xs text-muted">מס' {item.row.trackNumber}</span>
                </td>
                <td className="px-3 py-3">
                  {item.row.campus}
                  <span className="block text-xs text-muted">{item.row.faculty}</span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{item.advisorName}</td>
                <td className="px-3 py-3">
                  <StagePill stage={item.row.stage} />
                </td>
                <td className="tabular px-3 py-3 text-muted">
                  {item.row.latestVersion ? `v${item.row.latestVersion}` : <Nothing label="אין גרסה" />}
                </td>
                <td className="px-3 py-3">
                  <Comments n={item.openComments} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Due item={item} />
                </td>
                <td className="px-3 py-3">{waiting(item) ?? <Nothing label="אף אחד" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 lg:hidden">
        {items.map((item) => (
          <li
            key={item.row.id}
            className={`relative flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-line-strong ${focusRing} has-[a:focus-visible]:outline-offset-2`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <Link href={`/letters/${item.row.id}`} className={`font-semibold text-accent ${stretched}`}>
                  {item.row.trackName}
                </Link>
                <span className="text-sm text-muted">
                  <span className="tabular">{item.row.trackNumber}</span> · {item.row.campus} · {item.row.faculty}
                </span>
              </span>
              <ChevronLeft aria-hidden className="mt-0.5 size-5 text-muted" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StagePill stage={item.row.stage} />
              {item.row.latestVersion ? <Tag>v{item.row.latestVersion}</Tag> : null}
              {item.openComments > 0 && (
                <Tag tone="warn" icon={MessageSquare}>
                  <span className="tabular">{item.openComments}</span> הערות
                </Tag>
              )}
              {item.row.dueDate &&
                (item.overdue ? (
                  <Due item={item} />
                ) : (
                  <span className="text-muted">
                    יעד <span className="tabular">{formatDate(item.row.dueDate)}</span>
                  </span>
                ))}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>יועצת: {item.advisorName}</span>
              {waiting(item) && (
                <span className="inline-flex items-center gap-1">
                  <UserRound aria-hidden className="size-3.5" />
                  ממתין ל{waiting(item)}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
