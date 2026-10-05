import { Archive, CalendarRange, CalendarX2, ChevronLeft, CircleCheckBig, FilePen, type LucideIcon, MessageSquareWarning, ScanSearch, ShieldCheck, Stamp } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { StagePill, Tag } from "@/components/Pills";
import { sectionTitle } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { canSeeAllLetters, listSeasons, QUEUE_REASON_LABELS, type QueueReason, workQueue } from "@/lib/letters/queries";

export const metadata = { title: "העבודה שלי · מכתבי קבלה" };

const REASON_ICONS: Record<QueueReason, LucideIcon> = {
  APPROVE: Stamp,
  INITIAL_REVIEW: ScanSearch,
  FINAL_REVIEW: ShieldCheck,
  DRAFT: FilePen,
  OPEN_COMMENTS: MessageSquareWarning,
};

export default async function HomePage() {
  const user = await requireUser();
  const seeAll = canSeeAllLetters(actorOf(user));
  const [groups, seasons] = await Promise.all([workQueue(actorOf(user)), listSeasons()]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">שלום {user.name}</h1>
        <p className="text-muted">
          {total === 0 ? "אין כרגע מכתבים שממתינים לך." : total === 1 ? "מכתב אחד ממתין לך." : `${total} מכתבים ממתינים לך.`}
        </p>
      </section>

      {total === 0 && (
        <EmptyState
          icon={CircleCheckBig}
          tone="good"
          title="הכול מטופל"
        >
          כשמכתב יחכה לך (לבדיקה, לאישור או לטיפול בהערות) הוא יופיע כאן, ותקבלו גם מייל.
        </EmptyState>
      )}

      {groups.map(({ season, items }) => (
        <section key={season.id} aria-labelledby={`q-${season.id}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id={`q-${season.id}`} className={sectionTitle}>
              {season.name} <span className="tabular text-base font-normal text-muted">· {items.length}</span>
            </h2>
            <Link href={`/seasons/${season.id}`} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent hover:underline">
              לכל המכתבים בעונה
              <ChevronLeft aria-hidden className="size-4" />
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {items.map(({ row, reason, overdue, openComments }) => {
              const Icon = REASON_ICONS[reason];
              return (
                <li key={row.id}>
                  <Link
                    href={`/letters/${row.id}`}
                    className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-accent/60 hover:bg-surface-2 sm:items-center"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-bold text-fg">{QUEUE_REASON_LABELS[reason]}</span>
                        <span className="text-sm">
                          <span className="font-semibold">{row.trackName}</span>{" "}
                          <span className="tabular text-muted">({row.trackNumber})</span>
                          <span className="text-muted">
                            {" "}
                            · {row.campus} · {row.faculty}
                          </span>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StagePill stage={row.stage} />
                        {openComments > 0 && (
                          <Tag tone="warn" icon={MessageSquareWarning}>
                            <span className="tabular">{openComments}</span> הערות פתוחות
                          </Tag>
                        )}
                        {row.dueDate &&
                          (overdue ? (
                            <Tag tone="bad" icon={CalendarX2}>
                              באיחור · <span className="tabular">{formatDate(row.dueDate)}</span>
                            </Tag>
                          ) : (
                            <Tag>
                              יעד <span className="tabular">{formatDate(row.dueDate)}</span>
                            </Tag>
                          ))}
                      </span>
                    </span>
                    <ChevronLeft aria-hidden className="mt-2.5 size-5 text-muted transition-transform duration-150 group-hover:-translate-x-0.5 sm:mt-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-labelledby="seasons-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="seasons-h" className={sectionTitle}>
            עונות רישום
          </h2>
          <Link href="/seasons" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent hover:underline">
            ניהול עונות
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        </div>
        {seasons.length === 0 ? (
          <EmptyState icon={CalendarRange} title="עדיין לא נפתחו עונות" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seasons.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/seasons/${s.id}`}
                  className="group flex h-full items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-accent/60 hover:bg-surface-2"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted ring-1 ring-line ring-inset group-hover:text-accent">
                    {s.status === "ARCHIVED" ? <Archive aria-hidden className="size-5" /> : <CalendarRange aria-hidden className="size-5" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-sm text-muted">
                      {seeAll ? (
                        <>
                          <span className="tabular">{s.letterCount}</span> דרישות מכתב
                        </>
                      ) : (
                        "פתיחת העונה"
                      )}
                      {s.status === "ARCHIVED" ? " · בארכיון" : ""}
                    </span>
                  </span>
                  <ChevronLeft aria-hidden className="size-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
