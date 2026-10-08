"use client";

import { Check, Copy, KeyRound, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/ActionForm";
import { Spinner } from "@/components/Spinner";
import { btnIcon, btnPrimary, btnSecondary } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { copyText, PasswordField } from "./PasswordField";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
interface Handoff {
  name: string;
  email: string;
  password: string;
}

/**
 * A form that sets a password (a new person, or a new password for someone). After it saves, it
 * shows the sign-in details once more, ready to copy and hand over: the password is not kept anywhere.
 */
export function CredentialsForm({
  action,
  children,
  submitLabel,
  submitAriaLabel,
  submitIcon,
  pendingLabel = "שומר…",
  passwordLabel,
  person,
  className = "flex flex-col gap-4",
  buttonClassName = btnPrimary,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  submitAriaLabel?: string;
  submitIcon?: React.ReactNode;
  pendingLabel?: string;
  passwordLabel: string;
  /** For an existing person; for a new one the name and email come from the form's fields. */
  person?: { name: string; email: string };
  className?: string;
  buttonClassName?: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  const [password, setPassword] = useState("");
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [copied, setCopied] = useState(false);
  const sent = useRef<Handoff | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state || !("ok" in state)) return;
    // Saved: keep what was sent for the hand-over card, and empty the form for the next one.
    setHandoff(sent.current);
    setCopied(false);
    setPassword("");
    form.current?.reset();
  }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    sent.current = {
      name: person?.name ?? String(data.get("name") ?? "").trim(),
      email: person?.email ?? String(data.get("email") ?? "").trim().toLowerCase(),
      password,
    };
    setHandoff(null);
    startTransition(() => dispatch(data));
  }

  const text = handoff
    ? `כניסה למערכת מכתבי הקבלה\nכתובת: ${typeof window === "undefined" ? "" : window.location.origin}\nמייל: ${handoff.email}\nסיסמה: ${handoff.password}`
    : "";

  return (
    <div className="flex flex-col gap-3">
      <form ref={form} onSubmit={onSubmit} className={className} aria-busy={pending}>
        {children}
        <PasswordField label={passwordLabel} value={password} onChange={setPassword} />
        <div className="flex flex-col items-start gap-2">
          <button className={buttonClassName} disabled={pending} aria-label={submitAriaLabel}>
            {pending ? <Spinner /> : submitIcon}
            {pending ? pendingLabel : submitLabel}
          </button>
          <FormMessage state={state} />
        </div>
      </form>

      {handoff && state && "ok" in state && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-good/40 bg-good-soft p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold text-good">
              <KeyRound aria-hidden className="size-4" />
              פרטי הכניסה של {handoff.name}
            </p>
            <button type="button" className={btnIcon} onClick={() => setHandoff(null)} aria-label="סגור את פרטי הכניסה">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted">מייל</dt>
            <dd>
              <bdi dir="ltr">{handoff.email}</bdi>
            </dd>
            <dt className="text-muted">סיסמה</dt>
            <dd>
              <bdi dir="ltr" className="font-mono">
                {handoff.password}
              </bdi>
            </dd>
          </dl>
          <p className="text-muted">הסיסמה לא נשמרת בשום מקום שאפשר לקרוא אותה. העתיקו ומסרו אותה עכשיו.</p>
          <div>
            <button type="button" className={btnSecondary} onClick={async () => setCopied(await copyText(text))}>
              {copied ? <Check aria-hidden className="size-4 text-good" /> : <Copy aria-hidden className="size-4" />}
              {copied ? "הועתק" : "העתק את פרטי הכניסה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
