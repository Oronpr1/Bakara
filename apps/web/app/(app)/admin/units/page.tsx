import { canGlobal } from "@al/domain";
import { Building2, GraduationCap, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState } from "@/components/EmptyState";
import { SelectField } from "@/components/Field";
import { btnSecondary, card } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { listUsers, usersWithRole } from "@/lib/letters/queries";
import { listCampuses } from "@/lib/units/service";
import { setCampusDefaultsAction, setUnitDefaultsAction } from "./actions";

export const metadata = { title: "קמפוסים ופקולטות · מכתבי קבלה" };

export default async function UnitsPage() {
  const user = await requireUser();
  if (!canGlobal(actorOf(user), "MANAGE_UNITS")) notFound();
  const [campuses, people] = await Promise.all([listCampuses(), listUsers()]);
  const managers = usersWithRole(people, "REGISTRATION_MANAGER").map((p) => ({ value: p.id, label: p.name }));
  const advisors = usersWithRole(people, "CONTROL_ADVISOR").map((p) => ({ value: p.id, label: p.name }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">קמפוסים ופקולטות</h1>
        <p className="text-sm text-muted">
          מנהל רישום ויועצת בקרה מוגדרים פעם אחת. אם מגדירים אותם על <b>קמפוס</b>, הם חלים על כל הפקולטות בו (כך מנהל
          קמפוס קטן מנהל את כולן). אם מגדירים על <b>פקולטה</b>, זה גובר על הקמפוס. השינוי חל על כל המסלולים, בכל העונות.
          קמפוסים ופקולטות חדשים מופיעים כאן אחרי ייבוא מסלולים.
        </p>
      </div>

      {campuses.length === 0 ? (
        <EmptyState icon={Building2} title="עוד אין קמפוסים ופקולטות">
          הם ייווצרו אוטומטית כשתייבאו מסלולים או תיצרו דרישת מכתב ראשונה.
        </EmptyState>
      ) : (
        campuses.map((c) => (
          <section key={c.id} aria-labelledby={`c-${c.id}`} className="flex flex-col gap-3">
            <div className={`${card} flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between`}>
              <h2 id={`c-${c.id}`} className="flex items-center gap-2 text-lg font-bold">
                <Building2 aria-hidden className="size-5 text-accent" />
                {c.name}
                <span className="text-sm font-normal text-muted">· {c.units.length} פקולטות</span>
              </h2>
              <ActionForm
                action={setCampusDefaultsAction}
                submitLabel="שמור לקמפוס"
                submitIcon={<Save aria-hidden className="size-4" />}
                submitAriaLabel={`שמור ברירות מחדל לקמפוס ${c.name}`}
                buttonClassName={btnSecondary}
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <input type="hidden" name="campusId" value={c.id} />
                <SelectField label="מנהל רישום לכל הקמפוס" name="registrationManagerId" defaultValue={c.registrationManagerId ?? ""} placeholder="לא הוגדר" options={managers} />
                <SelectField label="יועצת בקרה לכל הקמפוס" name="advisorId" defaultValue={c.advisorId ?? ""} placeholder="לא הוגדרה" options={advisors} />
              </ActionForm>
            </div>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              {c.units.map((u) => (
                <li key={u.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 font-semibold">
                      <GraduationCap aria-hidden className="size-4 text-muted" />
                      {u.faculty}
                    </span>
                    <span className="text-sm text-muted">
                      {u.letterCount} דרישות מכתב · בפועל: מנהל רישום {u.effectiveManagerId ? nameOf.get(u.effectiveManagerId) : "לא הוגדר"} · יועצת{" "}
                      {u.effectiveAdvisorId ? nameOf.get(u.effectiveAdvisorId) : "לא הוגדרה"}
                    </span>
                  </div>
                  <ActionForm
                    action={setUnitDefaultsAction}
                    submitLabel="שמור"
                    submitIcon={<Save aria-hidden className="size-4" />}
                    submitAriaLabel={`שמור הגדרות ל${u.faculty} ב${c.name}`}
                    buttonClassName={btnSecondary}
                    className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="unitId" value={u.id} />
                    <SelectField label="מנהל רישום (גובר על הקמפוס)" name="registrationManagerId" defaultValue={u.registrationManagerId ?? ""} placeholder="כמו הקמפוס" options={managers} />
                    <SelectField label="יועצת בקרה (גוברת על הקמפוס)" name="advisorId" defaultValue={u.advisorId ?? ""} placeholder="כמו הקמפוס" options={advisors} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
