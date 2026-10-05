"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const input =
  "w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-muted focus:border-accent";
const primary =
  "w-full rounded-md bg-accent px-4 py-2.5 font-semibold text-accent-fg disabled:opacity-60";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: "email" });

  if (state.step === "email") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="request" />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">מייל</span>
          <input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            className={input}
            placeholder="name@college.ac.il"
          />
        </label>
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        <button className={primary} disabled={pending}>
          {pending ? "שולח…" : "שלחו לי קוד כניסה"}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="email" value={state.email} />
      <p className="text-sm text-muted">
        אם הכתובת <bdi dir="ltr" className="font-semibold text-fg">{state.email}</bdi> רשומה במערכת, נשלח אליה קוד בן 6
        ספרות.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">קוד כניסה</span>
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
          className={`${input} text-center text-2xl tracking-[0.5em] tabular`}
        />
      </label>
      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <button className={primary} disabled={pending}>
        {pending ? "בודק…" : "כניסה"}
      </button>
      <button
        name="intent"
        value="request"
        formNoValidate
        className="text-sm text-accent underline-offset-4 hover:underline"
        disabled={pending}
      >
        שלחו קוד חדש
      </button>
    </form>
  );
}
