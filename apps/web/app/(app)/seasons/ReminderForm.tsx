import { BellRing } from "lucide-react";
import { setReminderDaysAction } from "@/app/(app)/settings/seasons/actions";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary, input } from "@/components/ui";

/**
 * How many days without a response before a reminder goes out. The season settings now live in
 * /settings/seasons; this small form stays only while seasons/[id]/page.tsx still shows it.
 */
export function ReminderForm({ seasonId, days }: { seasonId: string; days: number }) {
  return (
    <ActionForm
      action={setReminderDaysAction}
      submitLabel="שמור"
      submitAriaLabel="שמור מרווח תזכורת"
      submitIcon={<BellRing aria-hidden className="size-4" />}
      buttonClassName={btnSecondary}
      inline
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">תזכורת אחרי (ימים)</span>
        <input
          name="days"
          type="number"
          min={1}
          max={60}
          required
          defaultValue={days}
          inputMode="numeric"
          className={`${input} w-28 tabular`}
        />
      </label>
    </ActionForm>
  );
}
