import { useId } from "react";
import { label as labelClass } from "@/components/ui";

/** An on/off setting: a switch, its name, and one sentence saying what "on" does. */
export function Toggle({
  name,
  label,
  explain,
  defaultChecked,
}: {
  name: string;
  label: string;
  explain: React.ReactNode;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        name={name}
        value="on"
        defaultChecked={defaultChecked}
        aria-describedby={`${id}-explain`}
        className="peer relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors duration-150 before:absolute before:top-0.5 before:start-0.5 before:size-5 before:rounded-full before:bg-surface before:shadow-card before:transition-transform before:duration-150 checked:bg-accent checked:before:-translate-x-5"
      />
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5">
        <span className={labelClass}>{label}</span>
        <span id={`${id}-explain`} className="text-sm text-muted">
          {explain}
        </span>
      </label>
    </div>
  );
}

/** One of a few options, each with a sentence saying what it means (radio cards). */
export function RadioCards({
  name,
  legend,
  options,
  defaultValue,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; explain: React.ReactNode }[];
  defaultValue: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${labelClass} mb-2`}>{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface p-3 transition-colors duration-150 hover:border-accent/50 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/60"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === defaultValue}
              className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{o.label}</span>
              <span className="text-sm text-muted">{o.explain}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
