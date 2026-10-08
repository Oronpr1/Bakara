"use client";

import { X } from "lucide-react";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormMessage } from "@/components/ActionForm";
import { Spinner } from "@/components/Spinner";
import { btnIcon, btnPrimary, btnSecondary } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { toast } from "./Toast";

/**
 * A modal window: a native <dialog> (focus moves in, Escape closes, focus returns). On a phone it
 * sits at the bottom of the screen like a sheet, so the thumb reaches the buttons.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside its box) closes it.
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto max-h-[92dvh] ${wide ? "w-[min(36rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"} overflow-hidden rounded-xl border border-line bg-surface p-0 text-fg shadow-pop max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id={`${id}-title`} className="text-lg font-bold">
              {title}
            </h2>
            <button type="button" className={btnIcon} onClick={onClose} aria-label="סגירה">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      )}
    </dialog>
  );
}

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * A form inside a dialog, bound to a server action. Keeps what was typed when it fails; on success
 * it closes the dialog and shows the result for a moment at the bottom of the screen.
 */
export function DialogForm({
  action,
  onDone,
  children,
  submitLabel,
  submitIcon,
  submitClassName = btnPrimary,
  pendingLabel = "שומר…",
  hidden,
  successMessage,
}: {
  action: Action;
  onDone: () => void;
  children?: React.ReactNode;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  submitClassName?: string;
  pendingLabel?: string;
  /** Hidden fields (letterId, seat…). */
  hidden: Record<string, string>;
  /** Shown when the action itself returns no message. */
  successMessage?: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  useEffect(() => {
    if (state && "ok" in state) {
      const msg = state.message ?? successMessage;
      if (msg) toast(msg);
      onDone();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => dispatch(form));
      }}
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <FormMessage state={state} />
      <div className="flex flex-wrap-reverse justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onDone} disabled={pending}>
          ביטול
        </button>
        <button className={submitClassName} disabled={pending}>
          {pending ? <Spinner /> : submitIcon}
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * A one-button form bound to a server action, with the result as a toast or an inline error.
 * With `confirm`, asks "are you sure?" first.
 */
export function QuickAction({
  action,
  hidden,
  label,
  icon,
  className = btnSecondary,
  pendingLabel,
  successMessage,
  ariaLabel,
  disabled,
  confirm,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: string;
  icon?: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  successMessage?: string;
  ariaLabel?: string;
  disabled?: boolean;
  confirm?: { message: string; label: string };
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  const [asking, setAsking] = useState<FormData | null>(null);
  useEffect(() => {
    if (state && "ok" in state) {
      const msg = state.message ?? successMessage;
      if (msg) toast(msg);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (confirm) setAsking(form);
        else startTransition(() => dispatch(form));
      }}
      className="inline-flex flex-col gap-1"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button className={className} disabled={pending || disabled} aria-label={ariaLabel}>
        {pending ? <Spinner /> : icon}
        {pending ? (pendingLabel ?? label) : label}
      </button>
      {state && "error" in state && <FormMessage state={state} />}
      {confirm && (
        <ConfirmDialog
          open={asking !== null}
          message={confirm.message}
          confirmLabel={confirm.label}
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
