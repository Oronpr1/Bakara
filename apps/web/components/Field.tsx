import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { hint as hintClass, input, label as labelClass } from "./ui";

/** A labelled text-like input. */
export function Field({
  label,
  hint,
  icon: Icon,
  className = "",
  ...props
}: { label: string; hint?: string; icon?: LucideIcon } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {Icon ? (
        <div className="relative">
          <Icon aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`${input} ps-9`} {...props} />
        </div>
      ) : (
        <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={input} {...props} />
      )}
      {hint && (
        <p id={`${id}-hint`} className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  options,
  placeholder,
  className = "",
  ...props
}: {
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} className={input} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextAreaField({
  label,
  className = "",
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea id={id} rows={2} className={input} {...props} />
    </div>
  );
}

/** A group of checkboxes, for choosing several people or roles. */
export function CheckboxGroup({
  legend,
  name,
  options,
  defaultChecked = [],
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  defaultChecked?: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={`${labelClass} mb-1.5`}>{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => (
          <label key={o.value} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultChecked.includes(o.value)}
              className="size-4 accent-[var(--accent)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
