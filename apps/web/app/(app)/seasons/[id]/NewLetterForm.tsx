import { FilePlus2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Field, SelectField } from "@/components/Field";
import type { UserOption } from "@/lib/letters/queries";
import { createLetterAction } from "../actions";

const opts = (people: UserOption[]) => people.map((p) => ({ value: p.id, label: p.name }));

export function NewLetterForm({
  seasonId,
  campuses,
  faculties,
  defaultAdvisorId,
  advisors,
}: {
  seasonId: string;
  campuses: string[];
  faculties: string[];
  defaultAdvisorId?: string;
  advisors: UserOption[];
}) {
  return (
    <ActionForm
      action={createLetterAction}
      submitLabel="צור דרישת מכתב"
      submitIcon={<FilePlus2 aria-hidden className="size-4" />}
      pendingLabel="יוצר…"
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">המסלול</legend>
        <Field label="קמפוס" name="campus" required maxLength={200} list="campus-options" />
        <Field label="פקולטה" name="faculty" required maxLength={200} list="faculty-options" />
        <Field label="שם המסלול" name="trackName" required maxLength={200} />
        <Field label="מספר מסלול" name="trackNumber" required maxLength={200} />
        <Field label="תאריך יעד" name="dueDate" type="date" hint="לא חובה" />
      </fieldset>
      <datalist id="campus-options">
        {campuses.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="faculty-options">
        {faculties.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <fieldset className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">אחראים ומאשרים</legend>
        <SelectField
          label="יועצת בקרה"
          name="advisorId"
          required
          defaultValue={defaultAdvisorId ?? ""}
          placeholder="בחרו יועצת"
          options={opts(advisors)}
        />
      </fieldset>
      <p className="text-sm text-muted">
        מנהל הרישום נקבע לפי הקמפוס והפקולטה, והסמנכ"ל קבוע. הגורם האקדמי נבחר בהמשך, אחרי סבב הרישום.
      </p>
    </ActionForm>
  );
}
