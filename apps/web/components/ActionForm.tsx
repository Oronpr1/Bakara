"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { ConfirmDialog } from "./ConfirmDialog";
import { Spinner } from "./Spinner";
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
  submitIcon,
  pendingLabel = "שומר…",
  buttonClassName = btnPrimary,
  className = "flex flex-col gap-3",
  confirm,
  confirmLabel,
  inline = false,
  submitAriaLabel,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  /** An icon shown before the label (hidden from screen readers). */
  submitIcon?: React.ReactNode;
  /** Fuller name for screen readers when the visible label is short (e.g. names the person). */
  submitAriaLabel?: string;
  pendingLabel?: string;
  buttonClassName?: string;
  className?: string;
  /** Asks in a dialog before submitting, for actions that are hard to undo. */
  confirm?: string;
  /** The confirm button's label in that dialog (defaults to the submit label). */
  confirmLabel?: string;
  /** Button and message on one line, for single-button forms. */
  inline?: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [asking, setAsking] = useState<FormData | null>(null);

  useEffect(() => {
    if (state && "ok" in state) ref.current?.reset();
  }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    if (confirm) setAsking(form);
    else startTransition(() => dispatch(form));
  }

  return (
    <form ref={ref} action={dispatch} onSubmit={onSubmit} className={className} aria-busy={pending}>
      {children}
      <div className={inline ? "flex flex-wrap items-center gap-3" : "flex flex-col items-start gap-2"}>
        <button className={buttonClassName} disabled={pending} aria-label={submitAriaLabel}>
          {pending ? <Spinner /> : submitIcon}
          {pending ? pendingLabel : submitLabel}
        </button>
        <FormMessage state={state} />
      </div>
      {confirm && (
        <ConfirmDialog
          open={asking !== null}
          message={confirm}
          confirmLabel={confirmLabel ?? submitLabel}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const form = asking;
            setAsking(null);
            if (form) startTransition(() => dispatch(form));
          }}
        />
      )}
    </form>
  );
}

export function FormMessage({ state }: { state: ActionResult }) {
  if (!state) return null;
  if ("error" in state)
    return (
      <p className="flex items-start gap-1.5 text-sm text-bad" role="alert">
        <CircleAlert aria-hidden className="mt-0.5 size-4" />
        {state.error}
      </p>
    );
  return state.message ? (
    <p className="flex items-start gap-1.5 text-sm text-good" role="status">
      <CircleCheck aria-hidden className="mt-0.5 size-4" />
      {state.message}
    </p>
  ) : null;
}
