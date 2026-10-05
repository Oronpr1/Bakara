import { canGlobal } from "@al/domain";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Field, SelectField } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { card } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { canSeeAllLetters, listSeasons } from "@/lib/letters/queries";
import { createSeasonAction } from "./actions";
import { ReminderForm } from "./ReminderForm";

export const metadata = { title: "עונות רישום · מכתבי קבלה" };

export default async function SeasonsPage() {
  const actor = actorOf(await requireUser());
  const seasons = await listSeasons();
  const canManage = canGlobal(actor, "MANAGE_SEASONS");
  const canRemind = canGlobal(actor, "SET_REMINDER_INTERVAL");
  const seeAll = canSeeAllLetters(actor);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">עונות רישום</h1>

      {seasons.length === 0 ? (
        <p className="text-muted">עדיין לא נפתחו עונות.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {seasons.map((s) => (
            <li key={s.id} className={`${card} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
              <div className="flex flex-col gap-1">
                <Link href={`/seasons/${s.id}`} className="text-lg font-semibold text-accent hover:underline">
                  {s.name}
                </Link>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {seeAll && <span>{s.letterCount} דרישות מכתב</span>}
                  <span>נפתחה ב-{formatDate(s.createdAt)}</span>
                  <span>תזכורת אחרי {s.reminderIntervalDays} ימים</span>
                  {s.status === "ARCHIVED" && <Tag>בארכיון</Tag>}
                </span>
              </div>
              {canRemind && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-accent">שינוי מרווח התזכורת</summary>
                  <div className="mt-2">
                    <ReminderForm seasonId={s.id} days={s.reminderIntervalDays} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <section aria-labelledby="new-season" className={`${card} flex flex-col gap-4`}>
          <h2 id="new-season" className="text-lg font-bold">
            עונה חדשה
          </h2>
          <ActionForm action={createSeasonAction} submitLabel="צור עונה" pendingLabel="יוצר…" className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <Field label="שם העונה" name="name" required maxLength={100} placeholder={`תשפ"ח א'`} />
            <SelectField
              label="צור על בסיס עונה"
              name="copyFromSeasonId"
              placeholder="עונה ריקה"
              options={seasons.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Field
              label="תזכורת אחרי (ימים)"
              name="reminderIntervalDays"
              type="number"
              min={1}
              max={60}
              defaultValue={3}
              inputMode="numeric"
            />
            <p className="text-sm text-muted sm:col-span-3">
              עונה על בסיס עונה קודמת מעתיקה את המסלולים והאחראים, בלי גרסאות, הערות ואישורים.
            </p>
          </ActionForm>
        </section>
      )}
      {!canManage && (
        <p className="text-sm text-muted">פתיחת עונות נעשית על ידי מנהלת הבקרה או סמנכ&quot;ל הרישום.</p>
      )}
    </div>
  );
}
