import { Field } from "@/components/Field";
import { RadioCards, Toggle } from "./Choice";

export interface SeasonSettingsValues {
  reminderIntervalDays: number;
  sequentialReview: boolean;
  controlReview: boolean;
  dueDate: string | null;
}

export const DEFAULT_SEASON_SETTINGS: SeasonSettingsValues = {
  reminderIntervalDays: 3,
  sequentialReview: true,
  controlReview: false,
  dueDate: null,
};

/** How a season works: the order of review, a check by the control manager first, reminders, a due date. */
export function SeasonSettingsFields({ values }: { values: SeasonSettingsValues }) {
  return (
    <div className="flex flex-col gap-4">
      <RadioCards
        name="order"
        legend="סדר הבדיקה"
        defaultValue={values.sequentialReview ? "sequential" : "parallel"}
        options={[
          {
            value: "sequential",
            label: 'מנהל רישום ואחריו סמנכ"ל (מומלץ)',
            explain: 'הסמנכ"ל מקבל את המכתב רק אחרי שמנהל הרישום אישר, כך שהוא לא קורא גרסה שעוד תתוקן.',
          },
          {
            value: "parallel",
            label: "במקביל",
            explain: 'מנהל הרישום והסמנכ"ל מקבלים את המכתב באותו זמן. מהיר יותר, אבל הסמנכ"ל עלול לקרוא גרסה שעוד תשתנה.',
          },
        ]}
      />
      <Toggle
        name="controlReview"
        label="מנהלת הבקרה בודקת לפני הסבב"
        defaultChecked={values.controlReview}
        explain='כשהמתג פועל, כל מכתב שנשלח לבדיקה מגיע קודם למנהלת הבקרה (ורוניקה), ורק אחרי שאישרה הוא עובר למנהל הרישום ולסמנכ"ל. בבדיקה "במקביל" כולם מקבלים אותו יחד.'
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="תזכורת אחרי (ימים)"
          name="reminderIntervalDays"
          type="number"
          min={1}
          max={60}
          required
          defaultValue={values.reminderIntervalDays}
          inputMode="numeric"
          hint="אחרי כמה ימים בלי תגובה נשלחת תזכורת למי שהמכתב אצלו."
        />
        <Field
          label="תאריך יעד לעונה"
          name="dueDate"
          type="date"
          defaultValue={values.dueDate ?? ""}
          hint="עד מתי כל המכתבים צריכים להיות מאושרים. מכתב שלא אושר עד אז מסומן באיחור. לא חובה."
        />
      </div>
    </div>
  );
}
