import { canGlobal, STAGES } from "@al/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronLeft, FilePlus2, Plus, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Tag } from "@/components/Pills";
import { btnPrimary, card, sectionTitle } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { canSeeAllLetters, getSeason, isOverdue, listSeasonLetters, listUsers, usersWithRole } from "@/lib/letters/queries";
import { ReminderForm } from "../ReminderForm";
import { Filters } from "./Filters";
import { LetterTable } from "./LetterTable";
import { NewLetterForm } from "./NewLetterForm";
import { SeasonDashboard } from "./SeasonDashboard";

const filterSchema = z.object({
  stage: z.enum(STAGES).optional().catch(undefined),
  advisor: z.uuid().optional().catch(undefined),
  campus: z.string().optional().catch(undefined),
  q: z.string().trim().optional().catch(undefined),
  overdue: z.literal("1").optional().catch(undefined),
});

export default async function SeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const actor = actorOf(user);
  if (!z.uuid().safeParse(id).success) notFound();
  const season = await getSeason(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const [letters, people] = await Promise.all([listSeasonLetters(actor, id), listUsers()]);
  const filters = filterSchema.parse(await searchParams);

  const q = filters.q?.toLowerCase();
  const shown = letters.filter(
    ({ row }) =>
      (!filters.stage || row.stage === filters.stage) &&
      (!filters.advisor || row.advisorId === filters.advisor) &&
      (!filters.campus || row.campus === filters.campus) &&
      (!filters.overdue || isOverdue(row)) &&
      (!q || [row.trackName, row.trackNumber, row.faculty, row.campus].some((s) => s.toLowerCase().includes(q))),
  );

  const campuses = [...new Set(letters.map((l) => l.row.campus))].sort((a, b) => a.localeCompare(b, "he"));
  const faculties = [...new Set(letters.map((l) => l.row.faculty))].sort((a, b) => a.localeCompare(b, "he"));
  const advisors = [...new Map(letters.map((l) => [l.row.advisorId, l.advisorName])).entries()].map(([value, label]) => ({
    value,
    label,
  }));
  const canCreate = canGlobal(actor, "CREATE_LETTER_REQUEST");
  const canRemind = canGlobal(actor, "SET_REMINDER_INTERVAL");
  const filtered = Boolean(filters.stage || filters.advisor || filters.campus || filters.q || filters.overdue);
  return (
    <div className="flex flex-col gap-6">
      <header className="relative flex flex-col gap-1">
        <nav aria-label="מיקום">
          <ol className="flex items-center gap-1 text-sm text-muted">
            <li>
              <Link href="/seasons" className="rounded hover:text-fg hover:underline">
                עונות רישום
              </Link>
            </li>
            <li aria-hidden>
              <ChevronLeft className="size-3.5" />
            </li>
            <li aria-current="page" className="font-semibold text-fg">
              {season.name}
            </li>
          </ol>
        </nav>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {season.name}
          {season.status === "ARCHIVED" && <Tag>בארכיון</Tag>}
        </h1>
        <p className="text-sm text-muted">
          {canSeeAllLetters(actor) ? "כל דרישות המכתב בעונה" : "דרישות המכתב שלך בעונה"}
          {" · "}
          <span className="tabular">{letters.length}</span> דרישות
        </p>

        {canGlobal(actor, "MANAGE_UNITS") && (
          <Link href={`/seasons/${season.id}/import`} className="mt-2 text-sm font-semibold text-accent hover:underline">
            ייבוא מסלולים מקובץ
          </Link>
        )}
        {canCreate && (
          <details className="group mt-3 sm:mt-0">
            <summary
              className={`${btnPrimary} w-full sm:absolute sm:end-0 sm:top-5 sm:w-auto group-open:border group-open:border-line-strong group-open:bg-surface group-open:text-fg group-open:shadow-none group-open:hover:bg-accent-soft`}
            >
              <Plus aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-45" />
              <span className="group-open:hidden">דרישת מכתב חדשה</span>
              <span className="hidden group-open:inline">סגירת הטופס</span>
            </summary>
            <section aria-labelledby="new-letter-h" className={`${card} mt-4 flex flex-col gap-4 border-accent/40`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 id="new-letter-h" className={sectionTitle}>
                    דרישת מכתב חדשה
                  </h2>
                  <p className="text-sm text-muted">אחרי היצירה ייפתח דף המכתב, ושם מעלים את הגרסה הראשונה.</p>
                </div>
              </div>
              <NewLetterForm
                seasonId={season.id}
                campuses={campuses}
                faculties={faculties}
                defaultAdvisorId={user.roles.includes("CONTROL_ADVISOR") ? user.id : undefined}
                advisors={usersWithRole(people, "CONTROL_ADVISOR")}
              />
            </section>
          </details>
        )}
      </header>

      {letters.length === 0 ? (
        <EmptyState icon={FilePlus2} title="עדיין אין דרישות מכתב בעונה">
          {canCreate ? "פתחו דרישת מכתב חדשה כדי להתחיל." : "כשתשויך אליך דרישת מכתב, היא תופיע כאן."}
        </EmptyState>
      ) : (
        <>
          <SeasonDashboard letters={letters} reminderIntervalDays={season.reminderIntervalDays} selectedStage={filters.stage} />

          <section aria-labelledby="letters-h" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="letters-h" className={sectionTitle}>
                דרישות מכתב
              </h2>
              <p className="text-sm text-muted" role="status">
                {filtered ? (
                  <>
                    מוצגות <span className="tabular font-semibold text-fg">{shown.length}</span> מתוך{" "}
                    <span className="tabular">{letters.length}</span>
                    {filters.overdue ? " · רק באיחור" : ""}
                  </>
                ) : (
                  <>
                    <span className="tabular">{letters.length}</span> דרישות
                  </>
                )}
              </p>
            </div>
            <Filters values={filters} campuses={campuses} advisors={advisors} />
            <LetterTable items={shown} />
          </section>
        </>
      )}

      {canRemind && (
        <section aria-labelledby="settings-h" className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 id="settings-h" className="flex items-center gap-2 font-bold">
            <Settings2 aria-hidden className="size-4 text-muted" />
            הגדרות העונה
          </h2>
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-end sm:justify-between">
            <ReminderForm seasonId={season.id} days={season.reminderIntervalDays} />
            <p className="max-w-sm text-sm text-muted">
              מכתב שנשאר באותו שלב יותר ימים מזה שולח תזכורת למי שהוא ממתין לו, ומסומן בתמונת המצב.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
