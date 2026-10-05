import Link from "next/link";
import { StagePill, Tag } from "@/components/Pills";
import { card } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { canSeeAllLetters, listSeasons, QUEUE_REASON_LABELS, workQueue } from "@/lib/letters/queries";

export const metadata = { title: "העבודה שלי · מכתבי קבלה" };

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
          {total === 0 ? "אין כרגע מכתבים שממתינים לך." : `${total} מכתבים ממתינים לך.`}
        </p>
      </section>

      {groups.map(({ season, items }) => (
        <section key={season.id} aria-labelledby={`q-${season.id}`} className="flex flex-col gap-3">
          <h2 id={`q-${season.id}`} className="flex items-baseline gap-3 text-lg font-bold">
            {season.name}
            <Link href={`/seasons/${season.id}`} className="text-sm font-normal text-accent hover:underline">
              לכל המכתבים בעונה
            </Link>
          </h2>
          <ul className="flex flex-col gap-2">
            {items.map(({ row, reason, overdue, openComments }) => (
              <li key={row.id}>
                <Link
                  href={`/letters/${row.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3 hover:border-accent sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {row.trackName} <span className="tabular font-normal text-muted">({row.trackNumber})</span>
                    </span>
                    <span className="text-sm text-muted">
                      {row.campus} · {row.faculty}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-accent">{QUEUE_REASON_LABELS[reason]}</span>
                    <StagePill stage={row.stage} />
                    {openComments > 0 && <Tag tone="warn">{openComments} הערות פתוחות</Tag>}
                    {row.dueDate && (
                      <Tag tone={overdue ? "bad" : "muted"}>
                        {overdue ? "באיחור · " : "יעד "}
                        {formatDate(row.dueDate)}
                      </Tag>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="seasons-h" className="flex flex-col gap-3">
        <h2 id="seasons-h" className="flex items-baseline gap-3 text-lg font-bold">
          עונות רישום
          <Link href="/seasons" className="text-sm font-normal text-accent hover:underline">
            ניהול עונות
          </Link>
        </h2>
        {seasons.length === 0 ? (
          <p className="text-muted">עדיין לא נפתחו עונות.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seasons.map((s) => (
              <li key={s.id}>
                <Link href={`/seasons/${s.id}`} className={`${card} flex flex-col gap-1 hover:border-accent`}>
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-muted">
                    {seeAll ? `${s.letterCount} דרישות מכתב` : "פתיחת העונה"}
                    {s.status === "ARCHIVED" ? " · בארכיון" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
