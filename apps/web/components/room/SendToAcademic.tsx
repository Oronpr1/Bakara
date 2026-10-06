"use client";

import { Check, CircleAlert, Copy, Link2, MailCheck, MessageCircle, Send } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { btnLink, btnPrimary, btnSecondary, hint, input, label } from "@/components/ui";
import { inviteAcademicAction, reissueLinkAction, type InviteResult } from "@/app/(app)/letters/[id]/actions";
import type { AcademicChoice } from "@/lib/room/queries";
import { shortName } from "@/lib/room/view";
import { Dialog } from "./Dialog";

type Issued = Extract<InviteResult, { ok: true }>;

/** The ready-made WhatsApp message: who, which track, the link, and that it needs no password. */
function whatsappText(r: Issued) {
  const who = shortName(r.userName);
  return `שלום ${who},\nמכתב הקבלה של ${r.trackName || "המסלול"} ממתין לבדיקתך.\nזה הקישור האישי שלך (בתוקף 14 יום, בלי סיסמה):\n${r.url}`;
}

/** A freshly made personal link: copy it or send it on WhatsApp; and whether it also went out by email. */
export function LinkResult({ result }: { result: Issued }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the field stays selectable as a fallback */
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-good/40 bg-good-soft/60 p-3" role="status">
      <p className="flex items-start gap-2 text-sm font-semibold">
        {result.emailed ? <MailCheck aria-hidden className="mt-0.5 size-4 text-good" /> : <Link2 aria-hidden className="mt-0.5 size-4 text-good" />}
        <span>
          {result.emailed
            ? `הקישור האישי של ${result.userName} נשלח במייל. אפשר גם להעתיק אותו או לשלוח בוואטסאפ.`
            : `הקישור האישי של ${result.userName} מוכן. המייל עוד לא מחובר במערכת, אז שולחים אותו בעצמכם: מעתיקים, או שולחים בוואטסאפ.`}
        </span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          dir="ltr"
          value={result.url}
          className={`${input} text-start text-xs`}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="הקישור האישי"
        />
        <button type="button" className={btnSecondary} onClick={copy}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "הועתק" : "העתקה"}
        </button>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(whatsappText(result))}`}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className={`${btnSecondary} self-start`}
      >
        <MessageCircle aria-hidden className="size-4" />
        שליחה בוואטסאפ
        <span className="sr-only">(נפתח בחלון חדש)</span>
      </a>
      <p className={hint}>הקישור אישי, בתוקף 14 יום, ופותח רק את המכתב הזה. קישור חדש מבטל את הקודם.</p>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
      <CircleAlert aria-hidden className="mt-0.5 size-4" />
      {message}
    </p>
  );
}

/** "שלח לגורם אקדמי": pick someone (last year's first) or write a new name and email; then the link. */
export function SendToAcademicDialog({
  open,
  onClose,
  letterId,
  trackName,
  choices,
  title = "שליחה לגורם אקדמי",
}: {
  open: boolean;
  onClose: () => void;
  letterId: string;
  trackName: string;
  choices: { suggested: AcademicChoice[]; others: AcademicChoice[] };
  title?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <InviteForm key={String(open)} letterId={letterId} trackName={trackName} choices={choices} onClose={onClose} />
    </Dialog>
  );
}

function InviteForm({
  letterId,
  trackName,
  choices,
  onClose,
}: {
  letterId: string;
  trackName: string;
  choices: { suggested: AcademicChoice[]; others: AcademicChoice[] };
  onClose: () => void;
}) {
  const [state, dispatch, pending] = useActionState<InviteResult, FormData>(inviteAcademicAction, null);
  const hasList = choices.suggested.length + choices.others.length > 0;
  const [mode, setMode] = useState<"list" | "new">(hasList ? "list" : "new");

  if (state && "ok" in state)
    return (
      <div className="flex flex-col gap-4">
        <LinkResult result={state} />
        <div className="flex justify-end">
          <button type="button" className={btnPrimary} onClick={onClose}>
            סיום
          </button>
        </div>
      </div>
    );

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
      <input type="hidden" name="letterId" value={letterId} />
      <input type="hidden" name="trackName" value={trackName} />
      <p className="text-sm text-muted">
        הגורם האקדמי מקבל קישור אישי למכתב הזה בלבד. הוא פותח אותו בלי סיסמה, רואה את המכתב, מעיר עליו, ולוחץ &quot;אשר&quot; או &quot;בקש תיקון&quot;.
      </p>
      {hasList && (
        <div role="radiogroup" aria-label="מי הגורם האקדמי" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 ring-1 ring-line">
          {(
            [
              ["list", "מהרשימה"],
              ["new", "גורם חדש"],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-md text-sm font-semibold transition-colors duration-150 ${mode === m ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      {mode === "list" && hasList ? (
        <label className="flex flex-col gap-1.5">
          <span className={label}>גורם אקדמי</span>
          <select name="userId" required defaultValue={choices.suggested[0]?.id ?? ""} className={input}>
            <option value="" disabled>
              בחרו
            </option>
            {choices.suggested.length > 0 && (
              <optgroup label="מהשנה שעברה, במסלול הזה">
                {choices.suggested.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.email}
                  </option>
                ))}
              </optgroup>
            )}
            {choices.others.length > 0 && (
              <optgroup label="כל הגורמים האקדמיים">
                {choices.others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.email}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      ) : (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">גורם אקדמי חדש</legend>
          <label className="flex flex-col gap-1.5">
            <span className={label}>שם מלא</span>
            <input name="name" required autoComplete="off" className={input} placeholder="למשל: פרופ׳ דנה לוי" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>מייל</span>
            <input name="email" required type="email" dir="ltr" autoComplete="off" className={`${input} text-start`} placeholder="name@ono.ac.il" />
          </label>
        </fieldset>
      )}
      {state && "error" in state && <ErrorLine message={state.error} />}
      <div className="flex flex-wrap-reverse justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose} disabled={pending}>
          ביטול
        </button>
        <button className={btnPrimary} disabled={pending}>
          {pending ? <Spinner /> : <Send aria-hidden className="size-4" />}
          {pending ? "יוצר קישור…" : "צור קישור אישי ושלח"}
        </button>
      </div>
    </form>
  );
}

/** For an academic approver already on the letter: a new personal link (the old one stops working). */
export function ReissueLink({ letterId, userId, name, trackName }: { letterId: string; userId: string; name: string; trackName: string }) {
  const [state, dispatch, pending] = useActionState<InviteResult, FormData>(reissueLinkAction, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={dispatch}>
        <input type="hidden" name="letterId" value={letterId} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="trackName" value={trackName} />
        <button className={`${btnLink} inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold`} disabled={pending} aria-label={`קישור חדש עבור ${name}`}>
          {pending ? <Spinner /> : <Link2 aria-hidden className="size-4" />}
          קישור חדש
        </button>
      </form>
      {state && "error" in state && <ErrorLine message={state.error} />}
      {state && "ok" in state && <LinkResult result={state} />}
    </div>
  );
}
