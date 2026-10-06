"use client";

import { CircleCheck, RefreshCcw } from "lucide-react";
import { useActionState } from "react";
import { FormMessage } from "@/components/ActionForm";
import { Spinner } from "@/components/Spinner";
import { btnPrimary } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { requestNewLinkAction } from "./actions";

/** One button: ask for a fresh personal link. After it is sent, a calm confirmation replaces it. */
export function RequestLink({ token }: { token: string }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(requestNewLinkAction, null);
  if (state && "ok" in state)
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-good-soft px-3 py-2.5 text-start text-sm font-semibold text-good">
        <CircleCheck aria-hidden className="mt-0.5 size-4" />
        {state.message}
      </p>
    );
  return (
    <form action={dispatch} className="flex w-full flex-col items-center gap-2">
      <input type="hidden" name="t" value={token} />
      <button className={`${btnPrimary} w-full`} disabled={pending}>
        {pending ? <Spinner /> : <RefreshCcw aria-hidden className="size-4" />}
        {pending ? "שולח…" : "בקש קישור חדש"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
