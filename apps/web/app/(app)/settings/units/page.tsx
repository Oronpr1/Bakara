import { PHASES } from "@al/domain";
import { Building2, ChevronLeft, CircleAlert, GraduationCap, Info, Save, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState } from "@/components/EmptyState";
import { SelectField } from "@/components/Field";
import { PHASE_LABELS, PHASE_TONES, Tag, TONE_MARKS } from "@/components/Pills";
import { Toggle } from "@/components/settings/Choice";
import { btnSecondary, card, summary as summaryClass } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { currentSeason } from "@/lib/season-context";
import { canOpenTab } from "@/lib/settings/tabs";
import { getUnitsBoard, type PhaseCounts } from "@/lib/settings/units";
import { setCampusDefaultsAction, setUnitDefaultsAction } from "./actions";

export const metadata = { title: "קמפוסים ופקולטות · הגדרות · מכתבי קבלה" };

const ONLY_VP_EXPLAIN =
  'מפעילים כשאין כאן מנהל רישום: המכתבים עוברים ישר לסמנכ"ל ולא נתקעים. כשהמתג פועל, גם מנהל רישום שהוגדר לפקולטה לא משתתף בבדיקה.';
const ONLY_VP_CAMPUS_EXPLAIN =
  'מפעילים כשאין בקמפוס מנהל רישום: המכתבים עוברים ישר לסמנכ"ל ולא נתקעים. פקולטה שיש לה מנהל רישום משלה ממשיכה כרגיל.';

function PhaseLine({ phases, total }: { phases: PhaseCounts; total: number }) {
  if (total === 0) return <span>אין מסלולים בעונה</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        <span className="tabular font-semibold text-fg">{total}</span> מסלולים:
      </span>
      {PHASES.filter((p) => phases[p] > 0).map((p) => (
        <span key={p} className="inline-flex items-center gap-1">
          <span aria-hidden className={`size-2 rounded-full ${TONE_MARKS[PHASE_TONES[p]]}`} />
          <span className="tabular">{phases[p]}</span> {PHASE_LABELS[p]}
        </span>
      ))}
    </span>
  );
}

export default async function UnitsSettingsPage() {
  const actor = actorOf(await requireUser());
  if (!canOpenTab(actor, "units")) notFound();
  const { current } = await currentSeason();
  const { campuses, managers, advisors, ref } = await getUnitsBoard(actor, current?.id ?? null);
  const managerOptions = managers.map((p) => ({ value: p.id, label: p.name }));
  const advisorOptions = advisors.map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">קמפוסים ופקולטות</h2>
        <p className="text-sm text-muted">
          מגדירים פעם אחת מי מנהל הרישום ומי היועצת של כל קמפוס או פקולטה. ההגדרה חלה על כל המסלולים שם, בכל העונות.
          {current && <> המספרים הם של העונה {current.name}.</>}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent-soft/50 p-3 text-sm sm:p-4">
        <p className="flex items-center gap-1.5 font-bold">
          <Info aria-hidden className="size-4 text-accent" />
          מה גובר על מה
        </p>
        <ol className="flex list-decimal flex-col gap-1 ps-5">
          <li>
            <b>מסלול:</b> מנהל רישום שנקבע למסלול עצמו (בלשונית &quot;מסלולים והקצאות&quot;) גובר על הכול.
          </li>
          <li>
            <b>פקולטה:</b> מה שמוגדר לפקולטה גובר על הקמפוס.
          </li>
          <li>
            <b>קמפוס:</b> חל על כל הפקולטות בו שאין להן הגדרה משלהן. כך קמפוס קטן (למשל חיפה) מגדיר מנהל רישום אחד לכולן.
          </li>
        </ol>
        <p className="text-muted">
          היועצת של הקמפוס או הפקולטה היא ברירת המחדל למסלולים חדשים (בהקמה ובייבוא). שינוי שלה לא מחליף יועצת במסלולים שכבר קיימים: את זה עושים בלשונית
          &quot;מסלולים והקצאות&quot;.
        </p>
      </div>

      {campuses.length === 0 ? (
        <EmptyState icon={Building2} title="עוד אין קמפוסים ופקולטות">
          הם נוספים לכאן מעצמם כשמקימים מסלול או מייבאים מסלולים מקובץ.
        </EmptyState>
      ) : (
        campuses.map((c) => (
          <section key={c.id} aria-labelledby={`c-${c.id}`} className="flex flex-col gap-3">
            <div className={`${card} flex flex-col gap-4`}>
              <div className="flex flex-col gap-0.5">
                <h3 id={`c-${c.id}`} className="flex flex-wrap items-center gap-2 text-lg font-bold">
                  <Building2 aria-hidden className="size-5 text-accent" />
                  {c.name}
                  {c.onlyVp && <Tag tone="accent" icon={ShieldCheck}>רק הסמנכ&quot;ל בודק</Tag>}
                </h3>
                <p className="text-sm text-muted">
                  {c.units.length === 1 ? "פקולטה אחת" : <><span className="tabular">{c.units.length}</span> פקולטות</>} ·{" "}
                  {c.tracks === 1 ? "מסלול אחד" : <><span className="tabular">{c.tracks}</span> מסלולים</>} בעונה
                </p>
              </div>
              <ActionForm
                action={setCampusDefaultsAction}
                submitLabel="שמור לקמפוס"
                submitIcon={<Save aria-hidden className="size-4" />}
                submitAriaLabel={`שמור הגדרות לקמפוס ${c.name}`}
                buttonClassName={btnSecondary}
                className="flex flex-col gap-3"
              >
                <input type="hidden" name="campusId" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="מנהל רישום לכל הקמפוס"
                    name="registrationManagerId"
                    defaultValue={c.registrationManagerId ?? ""}
                    placeholder="לא הוגדר"
                    options={managerOptions}
                  />
                  <SelectField label="יועצת בקרה לכל הקמפוס" name="advisorId" defaultValue={c.advisorId ?? ""} placeholder="לא הוגדרה" options={advisorOptions} />
                </div>
                <Toggle name="onlyVp" label='רק הסמנכ"ל בודק בקמפוס הזה' defaultChecked={c.onlyVp} explain={ONLY_VP_CAMPUS_EXPLAIN} />
              </ActionForm>
            </div>

            <ul className="flex flex-col gap-2 border-s-2 border-line ps-3 sm:ps-5" aria-label={`הפקולטות ב${c.name}`}>
              {c.units.map((u) => {
                const manager = ref(u.effectiveManagerId);
                const advisor = ref(u.effectiveAdvisorId);
                const noManager = !manager && !u.effectiveOnlyVp;
                return (
                  <li key={u.id} className={`${card} flex flex-col gap-3 ${noManager ? "border-bad/40" : ""}`}>
                    <div className="flex flex-col gap-1">
                      <h4 className="flex flex-wrap items-center gap-2 font-semibold">
                        <GraduationCap aria-hidden className="size-4 text-muted" />
                        {u.faculty}
                        {u.effectiveOnlyVp && <Tag tone="accent" icon={ShieldCheck}>רק הסמנכ&quot;ל בודק</Tag>}
                      </h4>
                      <p className="text-sm text-muted">
                        <PhaseLine phases={u.phases} total={u.tracks} />
                      </p>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span>
                          מנהל רישום בפועל:{" "}
                          {u.effectiveOnlyVp ? (
                            <span className="text-muted">לא משתתף</span>
                          ) : manager ? (
                            <>
                              <b>{manager.name}</b> <span className="text-muted">({u.managerFrom === "FACULTY" ? "מוגדר לפקולטה" : "מהקמפוס"})</span>
                            </>
                          ) : (
                            <Tag tone="bad" icon={CircleAlert}>
                              אין
                            </Tag>
                          )}
                        </span>
                        <span>
                          יועצת למסלולים חדשים:{" "}
                          {advisor ? (
                            <>
                              <b>{advisor.name}</b> <span className="text-muted">({u.advisorFrom === "FACULTY" ? "מוגדרת לפקולטה" : "מהקמפוס"})</span>
                            </>
                          ) : (
                            <Tag tone="warn" icon={CircleAlert}>
                              לא הוגדרה
                            </Tag>
                          )}
                        </span>
                      </p>
                      {noManager && (
                        <p className="flex items-start gap-1.5 text-sm text-bad">
                          <CircleAlert aria-hidden className="mt-0.5 size-4" />
                          {u.missingManager > 0
                            ? `${u.missingManager === 1 ? "מסלול אחד כאן לא יכול" : `${u.missingManager} מסלולים כאן לא יכולים`} להישלח לבדיקה עד שיוגדר מנהל רישום (או "רק הסמנכ"ל בודק").`
                            : 'מסלולים כאן לא יוכלו להישלח לבדיקה עד שיוגדר מנהל רישום (או "רק הסמנכ"ל בודק").'}
                        </p>
                      )}
                    </div>
                    <details className="group flex flex-col">
                      <summary className={`${summaryClass} text-sm`}>
                        <ChevronLeft aria-hidden className="chev size-4" />
                        שינוי ההגדרה לפקולטה
                        <span className="sr-only"> {u.faculty} ב{c.name}</span>
                      </summary>
                      <ActionForm
                        action={setUnitDefaultsAction}
                        submitLabel="שמור לפקולטה"
                        submitIcon={<Save aria-hidden className="size-4" />}
                        submitAriaLabel={`שמור הגדרות ל${u.faculty} ב${c.name}`}
                        buttonClassName={btnSecondary}
                        className="mt-2 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3"
                      >
                        <input type="hidden" name="unitId" value={u.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <SelectField
                            label="מנהל רישום (גובר על הקמפוס)"
                            name="registrationManagerId"
                            defaultValue={u.registrationManagerId ?? ""}
                            placeholder={`כמו הקמפוס${c.registrationManagerId ? ` (${ref(c.registrationManagerId)?.name})` : ""}`}
                            options={managerOptions}
                          />
                          <SelectField
                            label="יועצת בקרה (גוברת על הקמפוס)"
                            name="advisorId"
                            defaultValue={u.advisorId ?? ""}
                            placeholder={`כמו הקמפוס${c.advisorId ? ` (${ref(c.advisorId)?.name})` : ""}`}
                            options={advisorOptions}
                          />
                        </div>
                        <Toggle name="onlyVp" label='רק הסמנכ"ל בודק בפקולטה הזאת' defaultChecked={u.onlyVp} explain={ONLY_VP_EXPLAIN} />
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
