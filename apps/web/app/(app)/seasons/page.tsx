import { canGlobal } from "@al/domain";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Field, SelectField } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { Archive, BellRing, CalendarPlus, CalendarRange, ChevronLeft, FileText, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { card, summary as summaryClass } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { canSeeAllLetters, listSeasons } from "@/lib/letters/queries";
import { createSeasonAction } from "./actions";
import { ReminderForm } from "./ReminderForm";

export const metadata = { title: "הגדרות עונות · מכתבי קבלה" };

export default async function SeasonsPage() {
  const actor = actorOf(await requireUser());
  const seasons = await listSeasons();
  const canManage = canGlobal(actor, "MANAGE_SEASONS");
  const canRemind = canGlobal(actor, "SET_REMINDER_INTERVAL");
  const seeAll = canSeeAllLetters(actor);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">הגדרות עונות</h1>
        <p className="text-sm text-muted">פתיחת עונה (פעם אחת לכל מחזור) והגדרות של כל עונה. את העונה שעובדים עליה בוחרים בראש המסך.</p>
      </div>

      {seasons.length === 0 ? (
        <EmptyState icon={CalendarRange} title="עדיין לא נפתחו עונות">
          {canManage ? "פתחו עונה חדשה בטופס למטה." : "פתיחת עונות נעשית על ידי מנהלת הבקרה או סמנכ\"ל הרישום."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {seasons.map((s) => (
            <li key={s.id} className={`${card} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  {s.status === "ARCHIVED" ? <Archive aria-hidden className="size-5" /> : <CalendarRange aria-hidden className="size-5" />}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/seasons/${s.id}`} className="text-lg font-semibold text-accent hover:underline">
                      {s.name}
                    </Link>
                    {s.status === "ARCHIVED" && <Tag icon={Archive}>בארכיון</Tag>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    {seeAll && (
                      <span className="inline-flex items-center gap-1.5">
                        <FileText aria-hidden className="size-4" />
                        <span>
                          <span className="tabular">{s.letterCount}</span> דרישות מכתב
                        </span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarPlus aria-hidden className="size-4" />
                      <span>
                        נפתחה ב-<span className="tabular">{formatDate(s.createdAt)}</span>
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BellRing aria-hidden className="size-4" />
                      <span>
                        תזכורת אחרי <span className="tabular">{s.reminderIntervalDays}</span> ימים
                      </span>
                    </span>
                  </span>
                </div>
              </div>
              {canRemind && (
                <details className="group text-sm sm:max-w-xs">
                  <summary className={summaryClass}>
                    <ChevronLeft aria-hidden className="chev size-4" />
                    שינוי מרווח התזכורת
                  </summary>
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
          <div className="flex flex-col gap-0.5">
            <h2 id="new-season" className="flex items-center gap-2 text-lg font-bold">
              <CalendarPlus aria-hidden className="size-5 text-accent" />
              עונה חדשה
            </h2>
            <p className="text-sm text-muted">
              עונה על בסיס עונה קודמת מעתיקה את המסלולים (אפשר להחליף את תחילת הקוד, למשל 227 ל-228) ומשייכת את האחראים של היום: מנהל הרישום והיועצת של הקמפוס והפקולטה, והסמנכ"ל. בלי גרסאות, הערות ואישורים.
            </p>
          </div>
          <ActionForm
            action={createSeasonAction}
            submitLabel="צור עונה"
            submitIcon={<Plus aria-hidden className="size-4" />}
            pendingLabel="יוצר…"
            className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 sm:items-start"
          >
            <Field label="שם העונה" name="name" required maxLength={100} placeholder={`תשפ"ח א'`} />
            <SelectField
              label="צור על בסיס עונה"
              name="copyFromSeasonId"
              placeholder="עונה ריקה"
              options={seasons.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Field label="החלפת תחילת קוד מסלול: מ-" name="codeFrom" placeholder="227" inputMode="numeric" dir="ltr" hint="רק כשיוצרים על בסיס עונה" />
            <Field label="ל-" name="codeTo" placeholder="228" inputMode="numeric" dir="ltr" />
            <Field
              label="תזכורת אחרי (ימים)"
              name="reminderIntervalDays"
              type="number"
              min={1}
              max={60}
              defaultValue={3}
              inputMode="numeric"
            />
          </ActionForm>
        </section>
      )}
      {!canManage && seasons.length > 0 && (
        <p className="text-sm text-muted">פתיחת עונות נעשית על ידי מנהלת הבקרה או סמנכ&quot;ל הרישום.</p>
      )}
    </div>
  );
}
