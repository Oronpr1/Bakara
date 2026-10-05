import { STAGE_LABELS, STAGES } from "@al/domain";
import Link from "next/link";
import { Field, SelectField } from "@/components/Field";
import { btnLink, btnSecondary } from "@/components/ui";

/** A plain GET form, so filtered views can be bookmarked and shared. */
export function Filters({
  values,
  campuses,
  advisors,
}: {
  values: { stage?: string; advisor?: string; campus?: string; q?: string };
  campuses: string[];
  advisors: { value: string; label: string }[];
}) {
  return (
    <form role="search" aria-label="סינון דרישות" className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      <Field className="col-span-2 lg:col-span-1" label="חיפוש" name="q" type="search" defaultValue={values.q} placeholder="מסלול, מספר, פקולטה" />
      <SelectField
        label="שלב"
        name="stage"
        defaultValue={values.stage ?? ""}
        placeholder="כל השלבים"
        options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
      />
      <SelectField label="יועצת" name="advisor" defaultValue={values.advisor ?? ""} placeholder="כל היועצות" options={advisors} />
      <SelectField
        label="קמפוס"
        name="campus"
        defaultValue={values.campus ?? ""}
        placeholder="כל הקמפוסים"
        options={campuses.map((c) => ({ value: c, label: c }))}
      />
      <div className="flex items-center gap-4 lg:col-span-1">
        <button className={btnSecondary}>סנן</button>
        <Link href="?" className={btnLink}>
          נקה
        </Link>
      </div>
    </form>
  );
}
