"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { btnPrimary, btnSecondary } from "./ui";

/**
 * An in-page "are you sure?" for actions that are hard to undo. A native modal <dialog>:
 * focus moves into it, Escape cancels, and focus returns to the button that opened it.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
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
      aria-labelledby={`${id}-msg`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-fg shadow-pop"
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
            <TriangleAlert aria-hidden className="size-5" />
          </span>
          <p id={`${id}-msg`} className="pt-2 font-semibold">
            {message}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel} autoFocus>
            ביטול
          </button>
          <button type="button" className={btnPrimary} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
