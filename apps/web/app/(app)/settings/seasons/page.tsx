import { Archive, ArrowLeftRight, CalendarPlus, CalendarRange, ChevronLeft, Copy, FileText, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { switchSeasonAction } from "@/app/(app)/actions";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { NewSeasonForm } from "@/components/settings/NewSeasonForm";
import { SeasonSettingsFields } from "@/components/settings/SeasonSettingsFields";
import { btnSecondary, card, summary as summaryClass } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { currentSeason } from "@/lib/season-context";
import { seasonFacts } from "@/lib/settings/queries";
import { canOpenTab } from "@/lib/settings/tabs";
import { createSeasonAction, updateSeasonAction } from "./actions";

export const metadata = { title: "עונות · הגדרות · מכתבי קבלה" };

export default async function SeasonsSettingsPage() {
  if (!canOpenTab(actorOf(await requireUser()), "seasons")) notFound();
  const [{ current, seasons }, facts] = await Promise.all([currentSeason(), seasonFacts()]);
  const settingsOf = (s: (typeof seasons)[number]) => ({
    reminderIntervalDays: s.reminderIntervalDays,
    sequentialReview: s.sequentialReview,
    controlReview: s.controlReview,
    dueDate: s.dueDate,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">עונות</h2>
        <p className="text-sm text-muted">
          כל עונת רישום היא סביבת עבודה נפרדת, עם המסלולים והמכתבים שלה. פותחים עונה פעם אחת לכל מחזור, בדרך כלל על בסיס העונה הקודמת.
        </p>
      </div>

      <details className={`${card} group flex flex-col`} open={seasons.length === 0}>
        <summary className={`${summaryClass} text-base`}>
          <ChevronLeft aria-hidden className="chev size-4" />
          <CalendarPlus aria-hidden className="size-5" />
          פתיחת עונה חדשה
        </summary>
        <div className="mt-4">
          <NewSeasonForm
            action={createSeasonAction}
            seasons={seasons.map((s) => ({
              id: s.id,
              name: s.name,
              letterCount: s.letterCount,
              sampleCode: facts.sampleCode.get(s.id) ?? null,
              settings: settingsOf(s),
            }))}
          />
        </div>
      </details>

      {seasons.length === 0 ? (
        <EmptyState icon={CalendarRange} title="עדיין לא נפתחו עונות">
          פותחים את העונה הראשונה בטופס למעלה, ואז מוסיפים לה מסלולים.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="העונות">
          {seasons.map((s) => {
            const isCurrent = s.id === current?.id;
            const from = s.sourceSeasonId ? facts.seasonName.get(s.sourceSeasonId) : null;
            return (
              <li key={s.id} className={`${card} flex flex-col gap-3 ${isCurrent ? "border-accent/50" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      {s.status === "ARCHIVED" ? <Archive aria-hidden className="size-5" /> : <CalendarRange aria-hidden className="size-5" />}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                        {s.name}
                        {isCurrent && <Tag tone="accent">העונה שעובדים עליה עכשיו</Tag>}
                        {s.status === "ARCHIVED" && <Tag icon={Archive}>בארכיון</Tag>}
                      </h3>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText aria-hidden className="size-4" />
                          <span>
                            <span className="tabular">{s.letterCount}</span> מסלולים
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarPlus aria-hidden className="size-4" />
                          <span>
                            נפתחה ב-<span className="tabular">{formatDate(s.createdAt)}</span>
                          </span>
                        </span>
                        {from && (
                          <span className="inline-flex items-center gap-1.5">
                            <Copy aria-hidden className="size-4" />
                            על בסיס {from}
                          </span>
                        )}
                      </p>
                      <p className="text-sm">
                        {s.sequentialReview ? 'מנהל רישום ואחריו סמנכ"ל' : 'מנהל רישום וסמנכ"ל במקביל'}
                        {" · "}
                        {s.controlReview ? "מנהלת הבקרה בודקת לפני הסבב" : "בלי בדיקה של מנהלת הבקרה לפני הסבב"}
                        {" · "}
                        תזכורת אחרי <span className="tabular">{s.reminderIntervalDays}</span> ימים
                        {" · "}
                        {s.dueDate ? (
                          <>
                            יעד: <span className="tabular">{formatDate(s.dueDate)}</span>
                          </>
                        ) : (
                          "בלי תאריך יעד"
                        )}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <form action={switchSeasonAction}>
                      <input type="hidden" name="seasonId" value={s.id} />
                      <input type="hidden" name="from" value="/settings/tracks" />
                      <button className={btnSecondary}>
                        <ArrowLeftRight aria-hidden className="size-4" />
                        לעבוד על העונה הזאת
                      </button>
                    </form>
                  )}
                </div>

                <details className="group flex flex-col" open={isCurrent && seasons.length === 1}>
                  <summary className={`${summaryClass} text-sm`}>
                    <ChevronLeft aria-hidden className="chev size-4" />
                    שינוי הגדרות העונה
                    <span className="sr-only"> {s.name}</span>
                  </summary>
                  <ActionForm
                    action={updateSeasonAction}
                    submitLabel="שמור הגדרות"
                    submitIcon={<Save aria-hidden className="size-4" />}
                    submitAriaLabel={`שמור את ההגדרות של ${s.name}`}
                    confirm={
                      s.letterCount > 0
                        ? "השינוי חל מיד, גם על מכתבים שכבר בבדיקה (למשל: מי מקבל אותם עכשיו). לשמור?"
                        : undefined
                    }
                    confirmLabel="שמור"
                    className="mt-3 flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-3 sm:p-4"
                  >
                    <input type="hidden" name="seasonId" value={s.id} />
                    <Field label="שם העונה" name="name" required maxLength={100} defaultValue={s.name} className="sm:max-w-sm" />
                    <SeasonSettingsFields values={settingsOf(s)} />
                  </ActionForm>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
