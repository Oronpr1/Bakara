"use client";

import { BellRing, CircleAlert, CircleCheck } from "lucide-react";
import { useActionState } from "react";
import { Spinner } from "@/components/Spinner";
import type { ActionResult } from "@/lib/action-result";
import { remindPersonAction } from "@/lib/home/actions";

const btn =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold text-fg transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9";

/** "תזכיר" next to a person: one reminder per letter they hold. Shows what was sent instead of the button. */
export function RemindButton({ userId, seasonId, name, count }: { userId: string; seasonId: string; name: string; count: number }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(remindPersonAction, null);
  if (state && "ok" in state)
    return (
      <p role="status" className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-sm font-semibold text-good">
        <CircleCheck aria-hidden className="size-4" />
        {state.message}
      </p>
    );
  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <button className={btn} disabled={pending} aria-label={`תזכיר ל${name} על ${count === 1 ? "מכתב אחד" : `${count} מכתבים`}`}>
        {pending ? <Spinner /> : <BellRing aria-hidden className="size-4" />}
        תזכיר
      </button>
      {state && "error" in state && (
        <p role="alert" className="flex items-center gap-1 text-sm text-bad">
          <CircleAlert aria-hidden className="size-4" />
          {state.error}
        </p>
      )}
    </form>
  );
}
