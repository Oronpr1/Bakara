"use client";

import { ArrowLeft, CircleAlert, KeyRound, RotateCw } from "lucide-react";
import { useActionState } from "react";
import { Spinner } from "@/components/Spinner";
import { btnPrimary, input } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const primary = `${btnPrimary} w-full`;
const secondaryLink =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-accent transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60";

function ErrorLine({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
      <CircleAlert aria-hidden className="mt-0.5 size-4" />
      {children}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: "email" });

  if (state.step === "email") {
    return (
      <form action={action} className="flex flex-col gap-4" aria-busy={pending}>
        <input type="hidden" name="intent" value="request" />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">מייל המכללה</span>
          <input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "email-error" : undefined}
            className={`${input} text-start`}
            placeholder="name@college.ac.il"
          />
        </label>
        {state.error && <ErrorLine id="email-error">{state.error}</ErrorLine>}
        <button className={primary} disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? "שולח…" : "שלחו לי קוד כניסה"}
          {!pending && <ArrowLeft aria-hidden className="size-4" />}
        </button>
        <p className="text-center text-xs text-muted">נשלח אליכם קוד חד-פעמי במייל. אין צורך בסיסמה.</p>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="email" value={state.email} />
      <p className="text-sm text-muted">
        אם הכתובת <bdi dir="ltr" className="font-semibold text-fg">{state.email}</bdi> רשומה במערכת, נשלח אליה קוד בן 6
        ספרות.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound aria-hidden className="size-4 text-muted" />
          קוד כניסה
        </span>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          dir="ltr"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "code-error" : undefined}
          className={`${input} text-center text-2xl tracking-[0.5em] tabular`}
        />
      </label>
      {state.error && <ErrorLine id="code-error">{state.error}</ErrorLine>}
      <button className={primary} disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "בודק…" : "כניסה"}
      </button>
      <button name="intent" value="request" formNoValidate className={secondaryLink} disabled={pending}>
        <RotateCw aria-hidden className="size-4" />
        שלחו קוד חדש
      </button>
    </form>
  );
}
