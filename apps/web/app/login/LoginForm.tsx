"use client";

import { CircleAlert } from "lucide-react";
import { useActionState } from "react";
import { Spinner } from "@/components/Spinner";
import { btnPrimary, input } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const primary = `${btnPrimary} w-full`;

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">מייל המכללה</span>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          defaultValue={state.email}
          key={state.email}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={`${input} text-start`}
          placeholder="name@college.ac.il"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">סיסמה</span>
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          autoFocus={!!state.error}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={`${input} text-start`}
        />
      </label>
      {state.error && (
        <p id="login-error" className="flex items-start gap-1.5 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}
      <button className={primary} disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "בודק…" : "כניסה"}
      </button>
      <p className="text-center text-xs text-muted">שכחתם את הסיסמה? מנהלת הבקרה יכולה לקבוע סיסמה חדשה.</p>
    </form>
  );
}
