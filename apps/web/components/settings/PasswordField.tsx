"use client";

import { Check, Copy, Eye, EyeOff, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { btnSecondary, hint as hintClass, input, label as labelClass } from "@/components/ui";

// No look-alike characters (0/O, 1/l/I), so a password read over the phone is typed right.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

function pick(set: string, n: number) {
  const out: string[] = [];
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out.push(set[b % set.length]!);
  return out.join("");
}

/** A strong password that is still easy to read out: three groups of four, e.g. "Kx7m-Pq4r-Tz9w". */
export function strongPassword() {
  const group = () => pick(UPPER, 1) + pick(LOWER, 2) + pick(DIGITS, 1);
  return `${group()}-${group()}-${group()}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A password box with "create a strong password" and "copy", for the person who hands it over. */
export function PasswordField({
  label,
  name = "password",
  hint,
  value,
  onChange,
}: {
  label: string;
  name?: string;
  hint?: string;
  /** Controlled, so the form around it can show the password again after saving. */
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const [shown, setShown] = useState(true);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <input
            id={id}
            name={name}
            type={shown ? "text" : "password"}
            required
            minLength={10}
            maxLength={200}
            dir="ltr"
            autoComplete="new-password"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setCopied(false);
            }}
            aria-describedby={`${id}-hint`}
            className={`${input} pe-11 font-mono tracking-wide`}
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="absolute end-1 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-accent-soft hover:text-fg"
            aria-label={shown ? "הסתר סיסמה" : "הצג סיסמה"}
          >
            {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => {
            onChange(strongPassword());
            setShown(true);
            setCopied(false);
          }}
        >
          <Sparkles aria-hidden className="size-4" />
          צור סיסמה חזקה
        </button>
        <button
          type="button"
          className={btnSecondary}
          disabled={!value}
          onClick={async () => setCopied(await copyText(value))}
          aria-live="polite"
        >
          {copied ? <Check aria-hidden className="size-4 text-good" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "הועתקה" : "העתק"}
        </button>
      </div>
      <p id={`${id}-hint`} className={hintClass}>
        {hint ?? "לפחות 10 תווים. את הסיסמה מוסרים לאדם בעצמכם (בטלפון או בהודעה)."}
      </p>
    </div>
  );
}
