import { canGlobal, STAGE_LABELS, STAGES, type Stage } from "@al/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { card } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { canSeeAllLetters, getSeason, listSeasonLetters, listUsers, usersWithRole } from "@/lib/letters/queries";
import { ReminderForm } from "../ReminderForm";
import { Filters } from "./Filters";
import { LetterTable } from "./LetterTable";
import { NewLetterForm } from "./NewLetterForm";

const filterSchema = z.object({
  stage: z.enum(STAGES).optional().catch(undefined),
  advisor: z.uuid().optional().catch(undefined),
  campus: z.string().optional().catch(undefined),
  q: z.string().trim().optional().catch(undefined),
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
      (!q || [row.trackName, row.trackNumber, row.faculty, row.campus].some((s) => s.toLowerCase().includes(q))),
  );

  const campuses = [...new Set(letters.map((l) => l.row.campus))].sort((a, b) => a.localeCompare(b, "he"));
  const faculties = [...new Set(letters.map((l) => l.row.faculty))].sort((a, b) => a.localeCompare(b, "he"));
  const advisors = [...new Map(letters.map((l) => [l.row.advisorId, l.advisorName])).entries()].map(([value, label]) => ({
    value,
    label,
  }));
  const counts = Object.fromEntries(STAGES.map((s) => [s, letters.filter((l) => l.row.stage === s).length])) as Record<
    Stage,
    number
  >;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">
            <Link href="/seasons" className="hover:underline">
              עונות רישום
            </Link>{" "}
            /
          </p>
          <h1 className="text-2xl font-bold">{season.name}</h1>
          <p className="text-sm text-muted">
            {canSeeAllLetters(actor) ? "כל דרישות המכתב בעונה" : "דרישות המכתב שלך בעונה"} ·{" "}
            {STAGES.filter((s) => counts[s] > 0)
              .map((s) => `${STAGE_LABELS[s]}: ${counts[s]}`)
              .join(" · ") || "אין עדיין דרישות"}
          </p>
        </div>
        {canGlobal(actor, "SET_REMINDER_INTERVAL") && (
          <ReminderForm seasonId={season.id} days={season.reminderIntervalDays} />
        )}
      </div>

      {canGlobal(actor, "CREATE_LETTER_REQUEST") && (
        <details className={card}>
          <summary className="cursor-pointer font-semibold text-accent">דרישת מכתב חדשה</summary>
          <div className="mt-4">
            <NewLetterForm
              seasonId={season.id}
              campuses={campuses}
              faculties={faculties}
              defaultAdvisorId={user.roles.includes("CONTROL_ADVISOR") ? user.id : undefined}
              advisors={usersWithRole(people, "CONTROL_ADVISOR")}
              registrationManagers={usersWithRole(people, "REGISTRATION_MANAGER")}
              vps={usersWithRole(people, "VP_REGISTRATION")}
              academics={usersWithRole(people, "ACADEMIC_APPROVER")}
            />
          </div>
        </details>
      )}

      <Filters values={filters} campuses={campuses} advisors={advisors} />

      <p className="text-sm text-muted" role="status">
        מוצגות {shown.length} מתוך {letters.length} דרישות
      </p>
      <LetterTable items={shown} />
    </div>
  );
}
