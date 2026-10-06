"use client";

import { Check, CircleAlert, Copy, Link2, MailCheck, Send } from "lucide-react";
import { useActionState, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { btnSecondary, input } from "@/components/ui";
import { inviteAcademicAction, reissueLinkAction, type InviteResult } from "./actions";

/** Shows a freshly made personal link: copy it, and whether it also went out by email. */
function LinkResult({ result }: { result: Extract<InviteResult, { ok: true }> }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      /* the field is selectable as a fallback */
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-good/40 bg-good-soft/50 p-3" role="status">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        {result.emailed ? <MailCheck aria-hidden className="size-4 text-good" /> : <Link2 aria-hidden className="size-4 text-good" />}
        {result.emailed
          ? `הקישור האישי נשלח במייל ל${result.userName}`
          : `הקישור האישי של ${result.userName} מוכן. המייל עוד לא מחובר, אז שלחו אותו בעצמכם`}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly dir="ltr" value={result.url} className={`${input} text-start text-xs`} onFocus={(e) => e.currentTarget.select()} aria-label="הקישור האישי" />
        <button type="button" className={btnSecondary} onClick={copy}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "הועתק" : "העתקה"}
        </button>
      </div>
      <p className="text-xs text-muted">הקישור אישי, בתוקף 14 יום, ופותח רק את המכתב הזה. אין להעביר אותו הלאה.</p>
    </div>
  );
}

function Error({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
      <CircleAlert aria-hidden className="mt-0.5 size-4" />
      {message}
    </p>
  );
}

/** Add an academic approver: pick one that exists, or write a name and email for a new one. */
export function AcademicInvite({ letterId, people }: { letterId: string; people: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<InviteResult, FormData>(inviteAcademicAction, null);
  return (
    <form action={action} className="flex flex-col gap-3" aria-busy={pending}>
      <input type="hidden" name="letterId" value={letterId} />
      <p className="text-sm font-semibold">גורם אקדמי</p>
      {people.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">מי שכבר במערכת</span>
          <select name="userId" defaultValue="" className={input}>
            <option value="">בחרו</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-xs text-muted">או גורם חדש, לפי שם ומייל</legend>
        <input name="name" placeholder="שם מלא" autoComplete="off" className={input} aria-label="שם הגורם האקדמי" />
        <input name="email" type="email" dir="ltr" placeholder="name@ono.ac.il" autoComplete="off" className={`${input} text-start`} aria-label="מייל הגורם האקדמי" />
      </fieldset>
      <div>
        <button className={btnSecondary} disabled={pending}>
          {pending ? <Spinner /> : <Send aria-hidden className="size-4" />}
          הוסף ושלח קישור אישי
        </button>
      </div>
      {state && "error" in state && <Error message={state.error} />}
      {state && "ok" in state && <LinkResult result={state} />}
    </form>
  );
}

/** For an academic approver already on the letter: a new personal link (the old one stops working). */
export function ReissueLink({ letterId, userId, name }: { letterId: string; userId: string; name: string }) {
  const [state, action, pending] = useActionState<InviteResult, FormData>(reissueLinkAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 ps-12" aria-busy={pending}>
      <input type="hidden" name="letterId" value={letterId} />
      <input type="hidden" name="userId" value={userId} />
      <div>
        <button className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-accent hover:bg-accent-soft" disabled={pending} aria-label={`קישור אישי חדש עבור ${name}`}>
          {pending ? <Spinner /> : <Link2 aria-hidden className="size-4" />}
          קישור אישי חדש
        </button>
      </div>
      {state && "error" in state && <Error message={state.error} />}
      {state && "ok" in state && <LinkResult result={state} />}
    </form>
  );
}
