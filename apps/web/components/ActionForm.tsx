"use client";

import { useActionState, useEffect, useRef, startTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { btnPrimary } from "./ui";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * A form bound to a server action through useActionState. Keeps what the user typed when
 * the action fails, clears it on success, and shows the result next to the button.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "שומר…",
  buttonClassName = btnPrimary,
  className = "flex flex-col gap-3",
  confirm,
  inline = false,
  submitAriaLabel,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  /** Fuller name for screen readers when the visible label is short (e.g. names the person). */
  submitAriaLabel?: string;
  pendingLabel?: string;
  buttonClassName?: string;
  className?: string;
  /** Asks before submitting, for actions that are hard to undo. */
  confirm?: string;
  /** Button and message on one line, for single-button forms. */
  inline?: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state) ref.current?.reset();
  }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(form));
  }

  return (
    <form ref={ref} action={dispatch} onSubmit={onSubmit} className={className}>
      {children}
      <div className={inline ? "flex flex-wrap items-center gap-3" : "flex flex-col items-start gap-2"}>
        <button className={buttonClassName} disabled={pending} aria-label={submitAriaLabel}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function FormMessage({ state }: { state: ActionResult }) {
  if (!state) return null;
  if ("error" in state)
    return (
      <p className="text-sm text-bad" role="alert">
        {state.error}
      </p>
    );
  return state.message ? (
    <p className="text-sm text-good" role="status">
      {state.message}
    </p>
  ) : null;
}
