import { FilePlus2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { CheckboxGroup, Field, SelectField } from "@/components/Field";
import type { UserOption } from "@/lib/letters/queries";
import { createLetterAction } from "../actions";

const opts = (people: UserOption[]) => people.map((p) => ({ value: p.id, label: p.name }));

export function NewLetterForm({
  seasonId,
  campuses,
  faculties,
  defaultAdvisorId,
  advisors,
  registrationManagers,
  vps,
  academics,
}: {
  seasonId: string;
  campuses: string[];
  faculties: string[];
  defaultAdvisorId?: string;
  advisors: UserOption[];
  registrationManagers: UserOption[];
  vps: UserOption[];
  academics: UserOption[];
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
        <SelectField
          label="מנהל רישום"
          name="registrationManagerId"
          required
          defaultValue={registrationManagers.length === 1 ? registrationManagers[0]!.id : ""}
          placeholder="בחרו מנהל רישום"
          options={opts(registrationManagers)}
        />
        <SelectField
          label='סמנכ"ל רישום'
          name="vpId"
          required
          defaultValue={vps.length === 1 ? vps[0]!.id : ""}
          placeholder='בחרו סמנכ"ל'
          options={opts(vps)}
        />
      </fieldset>
      <CheckboxGroup legend="גורמים אקדמיים (אחד או יותר)" name="academicIds" options={opts(academics)} />
    </ActionForm>
  );
}
