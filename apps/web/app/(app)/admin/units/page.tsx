import { canGlobal } from "@al/domain";
import { Building2, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { SelectField } from "@/components/Field";
import { EmptyState } from "@/components/EmptyState";
import { btnSecondary, card } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { listUsers, usersWithRole } from "@/lib/letters/queries";
import { listUnits } from "@/lib/units/service";
import { setUnitManagerAction } from "./actions";

export const metadata = { title: "קמפוסים ופקולטות · מכתבי קבלה" };

export default async function UnitsPage() {
  const user = await requireUser();
  if (!canGlobal(actorOf(user), "MANAGE_UNITS")) notFound();
  const [units, people] = await Promise.all([listUnits(), listUsers()]);
  const managers = usersWithRole(people, "REGISTRATION_MANAGER").map((p) => ({ value: p.id, label: p.name }));
  const campuses = [...new Set(units.map((u) => u.campus))];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">קמפוסים ופקולטות</h1>
        <p className="text-sm text-muted">
          כל קמפוס ופקולטה הם סביבת עבודה נפרדת. מנהל הרישום מוגדר כאן פעם אחת, והוא מנהל הרישום של כל המסלולים שלה, בכל
          העונות. קמפוס ופקולטה חדשים מופיעים כאן אחרי ייבוא מסלולים או יצירת מכתב.
        </p>
      </div>

      {units.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="עוד אין קמפוסים ופקולטות"
        >
          הם ייווצרו אוטומטית כשתייבאו מסלולים או תיצרו דרישת מכתב ראשונה.
        </EmptyState>
      ) : (
        campuses.map((campus) => (
          <section key={campus} aria-labelledby={`c-${campus}`} className="flex flex-col gap-3">
            <h2 id={`c-${campus}`} className="flex items-center gap-2 text-lg font-bold">
              <Building2 aria-hidden className="size-5 text-accent" />
              {campus}
            </h2>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              {units
                .filter((u) => u.campus === campus)
                .map((u) => (
                  <li key={u.id} className={`${card} flex flex-col gap-3 rounded-none border-0 shadow-none sm:flex-row sm:items-end sm:justify-between`}>
                    <div className="flex flex-col">
                      <span className="font-semibold">{u.faculty}</span>
                      <span className="text-sm text-muted">
                        {u.letterCount} דרישות מכתב · {u.registrationManagerName ? `מנהל רישום: ${u.registrationManagerName}` : "לא הוגדר מנהל רישום"}
                      </span>
                    </div>
                    <ActionForm
                      action={setUnitManagerAction}
                      submitLabel="שמור"
                      submitIcon={<Save aria-hidden className="size-4" />}
                      submitAriaLabel={`שמור מנהל רישום ל${u.faculty} ב${u.campus}`}
                      buttonClassName={btnSecondary}
                      className="flex flex-col gap-2 sm:flex-row sm:items-end"
                    >
                      <input type="hidden" name="unitId" value={u.id} />
                      <SelectField
                        label="מנהל רישום"
                        name="userId"
                        defaultValue={u.registrationManagerId ?? ""}
                        placeholder="בחרו מנהל רישום"
                        options={managers}
                      />
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
