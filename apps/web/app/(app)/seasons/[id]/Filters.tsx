import { STAGE_LABELS, STAGES } from "@al/domain";
import { ListFilter, Search, X } from "lucide-react";
import Link from "next/link";
import { Field, SelectField } from "@/components/Field";
import { btnSecondary } from "@/components/ui";

const clear =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-fg";

/** A plain GET form, so filtered views can be bookmarked and shared. */
export function Filters({
  values,
  campuses,
  advisors,
}: {
  values: { stage?: string; advisor?: string; campus?: string; q?: string; overdue?: string };
  campuses: string[];
  advisors: { value: string; label: string }[];
}) {
  const active = [values.q, values.stage, values.advisor, values.campus, values.overdue].filter(Boolean).length;
  return (
    <form
      role="search"
      aria-label="סינון דרישות"
      className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line bg-surface-2 p-3 sm:p-4 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
    >
      <Field
        className="col-span-2 lg:col-span-1"
        label="חיפוש"
        name="q"
        type="search"
        icon={Search}
        defaultValue={values.q}
        placeholder="מסלול, מספר, פקולטה"
      />
      <SelectField
        label="שלב"
        name="stage"
        defaultValue={values.stage ?? ""}
        placeholder="כל השלבים"
        options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
      />
      <SelectField label="יועצת" name="advisor" defaultValue={values.advisor ?? ""} placeholder="כל היועצות" options={advisors} />
      <SelectField
        className="col-span-2 sm:col-span-1"
        label="קמפוס"
        name="campus"
        defaultValue={values.campus ?? ""}
        placeholder="כל הקמפוסים"
        options={campuses.map((c) => ({ value: c, label: c }))}
      />
      {values.overdue && <input type="hidden" name="overdue" value={values.overdue} />}
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
        <button className={`${btnSecondary} flex-1 lg:flex-none`}>
          <ListFilter aria-hidden className="size-4" />
          סנן
        </button>
        {active > 0 && (
          <Link href="?" className={clear} aria-label={`נקה סינון (${active} פעילים)`}>
            <X aria-hidden className="size-4" />
            נקה
          </Link>
        )}
      </div>
    </form>
  );
}
