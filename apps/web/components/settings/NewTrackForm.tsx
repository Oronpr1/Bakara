import { FilePlus2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Field, SelectField } from "@/components/Field";
import type { ActionResult } from "@/lib/action-result";
import type { PersonRef } from "@/lib/settings/queries";

/** "דרישת מכתב" for one track: name, code, campus and faculty (suggested from the ones that exist), and who is assigned. */
export function NewTrackForm({
  action,
  seasonId,
  campuses,
  faculties,
  advisors,
  managers,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  seasonId: string;
  campuses: string[];
  faculties: string[];
  advisors: PersonRef[];
  managers: PersonRef[];
}) {
  return (
    <ActionForm
      action={action}
      submitLabel="הוסף מסלול"
      submitIcon={<FilePlus2 aria-hidden className="size-4" />}
      pendingLabel="מוסיף…"
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם המסלול" name="trackName" required maxLength={200} autoComplete="off" placeholder="MBA בוקר - ק' 1" />
        <Field
          label="קוד מסלול"
          name="trackNumber"
          required
          inputMode="numeric"
          pattern="\d{4,12}"
          title="ספרות בלבד, לפחות 4"
          dir="ltr"
          autoComplete="off"
          placeholder="227114002"
        />
        <Field label="קמפוס" name="campus" required maxLength={200} list="settings-campus-options" autoComplete="off" hint="אפשר לבחור מהרשימה או לכתוב חדש" />
        <Field label="פקולטה" name="faculty" required maxLength={200} list="settings-faculty-options" autoComplete="off" hint="אפשר לבחור מהרשימה או לכתוב חדשה" />
        <SelectField
          label="יועצת בקרה"
          name="advisorId"
          placeholder="אשבץ אחר כך"
          options={advisors.map((a) => ({ value: a.id, label: a.name }))}
        />
        <SelectField
          label="מנהל רישום"
          name="registrationManagerId"
          placeholder="אשבץ אחר כך"
          options={managers.map((m) => ({ value: m.id, label: m.name }))}
        />
        <Field label="תאריך יעד למסלול" name="dueDate" type="date" hint="לא חובה. בלי תאריך: תאריך היעד של העונה." />
      </div>
      <datalist id="settings-campus-options">
        {campuses.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="settings-faculty-options">
        {faculties.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <p className="text-sm text-muted">
        אפשר לשבץ עכשיו או אחר כך בטבלה למטה, ושם גם להוסיף עוד אנשים. המסלול לא יישלח לבדיקה לפני שיש בו יועצת ומנהל רישום.
      </p>
    </ActionForm>
  );
}
