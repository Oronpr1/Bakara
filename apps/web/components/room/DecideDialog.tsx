"use client";

import type { SeatKey } from "@al/domain";
import { CircleCheck, MessageSquareText, Undo2 } from "lucide-react";
import { TextAreaField } from "@/components/Field";
import { btnGood, btnPrimary } from "@/components/ui";
import { decideAction } from "@/app/(app)/letters/[id]/actions";
import { approveLabel, plural, returnLabel } from "@/lib/room/view";
import { Dialog, DialogForm } from "./Dialog";

export interface DecideTarget {
  seat: SeatKey;
  kind: "APPROVED" | "CHANGES";
  /** "יוסי" when the control manager acts in his place. */
  onBehalfOf: string | null;
}

/**
 * Approve or return, with what it means said plainly. "Approve with comments" is spelled out:
 * the comments go to the advisor, she fixes them, and the letter goes on without coming back.
 */
export function DecideDialog({
  target,
  onClose,
  letterId,
  drafts,
  advisor,
}: {
  target: DecideTarget | null;
  onClose: () => void;
  letterId: string;
  /** How many draft comments the person wrote (published with the decision). */
  drafts: number;
  /** The advisor's short name ("שקד"). */
  advisor: string;
}) {
  const approve = target?.kind === "APPROVED";
  const academic = target?.seat.startsWith("ACADEMIC:") ?? false;
  const final = target?.seat === "FINAL";
  const title = !target ? "" : approve ? (final ? "אישור סופי" : "אישור המכתב") : academic ? "בקשת תיקון" : "החזרה לתיקון";
  const yourComments = drafts > 0 ? plural(drafts, "ההערה שכתבת", "ההערות שכתבת") : null;

  return (
    <Dialog open={target !== null} onClose={onClose} title={title}>
      {target && (
        <DialogForm
          key={`${target.seat}-${target.kind}`}
          action={decideAction}
          onDone={onClose}
          hidden={{ letterId, seat: target.seat, kind: target.kind }}
          submitLabel={approve ? approveLabel(target.seat) : returnLabel(target.seat)}
          submitIcon={approve ? <CircleCheck aria-hidden className="size-4" /> : <Undo2 aria-hidden className="size-4" />}
          submitClassName={approve ? btnGood : btnPrimary}
          pendingLabel="שולח…"
          successMessage={approve ? (final ? "המכתב אושר סופית" : "אישרת את המכתב") : `המכתב הוחזר ל${advisor} לתיקון`}
        >
          {target.onBehalfOf && (
            <p className="rounded-md bg-final-soft px-3 py-2 text-sm font-semibold text-final">פעולה במקום {target.onBehalfOf}. זה יירשם, והוא יקבל הודעה.</p>
          )}
          {approve ? (
            yourComments ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-good/40 bg-good-soft/60 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-bold text-good">
                  <MessageSquareText aria-hidden className="size-4" />
                  אישור עם הערות
                </p>
                <p>
                  {yourComments} ({drafts}) {drafts === 1 ? "תפורסם ותגיע" : "יפורסמו ויגיעו"} ל{advisor}. היא תתקן, והמכתב ימשיך הלאה{" "}
                  <b>בלי לחזור אליך</b>. אם חשוב לך לראות את התיקון לפני שהמכתב ממשיך, בחרו &quot;החזר לתיקון&quot; במקום.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {final
                  ? `אחרי האישור הסופי המכתב מאושר להפצה, ו${advisor} תקבל הודעה.`
                  : academic
                    ? "תודה. אחרי האישור המכתב ממשיך לאישור הסופי."
                    : "המכתב ממשיך לשלב הבא. אם יעלו גרסה חדשה, תראה את זה כאן ותוכל לבטל את האישור שלך."}
              </p>
            )
          ) : (
            <p className="text-sm text-muted">
              {yourComments ? `${yourComments} (${drafts}) ו` : ""}ההסבר שלך יגיעו ל{advisor}. אחרי שתתקן ותלחץ &quot;שלחתי תיקונים&quot;, המכתב יחזור
              {academic ? " להמשך הטיפול" : " אליך"}.
            </p>
          )}
          <TextAreaField
            label={approve ? "הערה כללית (לא חובה)" : drafts > 0 && !academic ? "מה עוד צריך לתקן? (לא חובה, כבר סימנת הערות)" : "מה צריך לתקן?"}
            name="note"
            rows={3}
            maxLength={2000}
            required={!approve && (academic || drafts === 0)}
          />
        </DialogForm>
      )}
    </Dialog>
  );
}
