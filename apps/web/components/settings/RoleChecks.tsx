import { label as labelClass } from "@/components/ui";
import { roleOptions } from "@/lib/settings/roles";

/** Role checkboxes, each with one line saying what the role does. */
export function RoleChecks({ legend, defaultChecked = [] }: { legend: string; defaultChecked?: readonly string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${labelClass} mb-2`}>{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {roleOptions().map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface p-2.5 transition-colors duration-150 hover:border-accent/50 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/60"
          >
            <input
              type="checkbox"
              name="roles"
              value={o.value}
              defaultChecked={defaultChecked.includes(o.value)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{o.label}</span>
              <span className="text-xs text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
