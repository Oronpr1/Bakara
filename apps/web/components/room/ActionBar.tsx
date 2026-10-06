"use client";

// The one prominent action of the room, for whoever is looking. Which buttons exist comes only from
// `room.can`; this component chooses the words and which allowed action to put forward.
import { BLOCKER_LABELS } from "@al/domain";
import { BadgeCheck, CircleCheck, CircleAlert, FileDown, FileText, Info, MessageSquare, Send, SendHorizontal, SkipForward, Undo2, Upload, Bell } from "lucide-react";
import { useState } from "react";
import { btnGood, btnPrimary, btnSecondary } from "@/components/ui";
import {
  markInGilboaAction,
  remindAction,
  resubmitAction,
  skipAcademicAction,
  submitAction,
} from "@/app/(app)/letters/[id]/actions";
import { TextAreaField } from "@/components/Field";
import type { AcademicChoice } from "@/lib/room/queries";
import { BLOCKER_HELP, approveLabel, joinNames, myDrafts, plural, returnLabel, shortName, type RoomProps } from "@/lib/room/view";
import { DecideDialog, type DecideTarget } from "./DecideDialog";
import { Dialog, DialogForm, QuickAction } from "./Dialog";
import { SendToAcademicDialog } from "./SendToAcademic";

export function ActionBar({
  room,
  choices,
  onShowComments,
  onShowVersions,
}: {
  room: RoomProps;
  choices: { suggested: AcademicChoice[]; others: AcademicChoice[] };
  onShowComments: () => void;
  onShowVersions: () => void;
}) {
  const { can, state } = room;
  const [decide, setDecide] = useState<DecideTarget | null>(null);
  const [sending, setSending] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const advisor = shortName(room.advisorName);
  const drafts = myDrafts(room.comments, room.me.id).length;
  const hidden = { letterId: room.id };
  const latest = room.versions[0];
  const forAdvisor = can.actsForOthers ? `פעולה במקום ${advisor}` : null;
  const nameOf = (id: string | null) => (id ? shortName(room.names[id]) : null);

  let title: string;
  let sub: React.ReactNode = null;
  let tone: "accent" | "good" | "warn" | "muted" = "muted";
  let buttons: React.ReactNode = null;
  let note: string | null = null;

  if (can.decide.length > 0) {
    // A reviewer, the signer or an academic approver whose turn it is.
    const first = can.decide[0]!;
    const final = first.seat === "FINAL";
    const academic = first.seat.startsWith("ACADEMIC:");
    // The control manager standing in for someone: say whose turn it really is.
    const standIn = can.decide.every((d) => d.onBehalfOf) ? joinNames(can.decide.map((d) => nameOf(d.onBehalfOf) ?? "")) : null;
    tone = "accent";
    title = standIn
      ? final
        ? `ממתין לאישור הסופי של ${standIn}`
        : `ממתין לבדיקה של ${standIn}`
      : final
        ? "ממתין לאישור הסופי שלך"
        : academic
          ? "המכתב ממתין להחלטה שלך"
          : "המכתב ממתין לבדיקה שלך";
    sub =
      drafts > 0
        ? `כתבת ${plural(drafts, "הערה אחת", "הערות")}. ${drafts === 1 ? "היא תישלח" : "הן יישלחו"} ל${advisor} יחד עם ההחלטה.`
        : standIn
          ? `אפשר להחליט במקומו. זה יירשם "במקום ${standIn}", והוא יקבל הודעה.`
          : "אפשר לסמן אזורים במכתב ולהעיר לפני ההחלטה.";
    buttons = can.decide.map((d) => {
      const behalf = nameOf(d.onBehalfOf);
      const seatName = room.seats.find((s) => s.key === d.seat)?.label;
      return (
        <div key={d.seat} className="flex flex-col gap-1">
          {can.decide.length > 1 && <span className="text-xs font-semibold text-muted">{seatName}</span>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGood} onClick={() => setDecide({ seat: d.seat, kind: "APPROVED", onBehalfOf: behalf })}>
              <CircleCheck aria-hidden className="size-4" />
              {approveLabel(d.seat)}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setDecide({ seat: d.seat, kind: "CHANGES", onBehalfOf: behalf })}>
              <Undo2 aria-hidden className="size-4" />
              {returnLabel(d.seat)}
            </button>
          </div>
          {behalf && <span className="text-xs font-semibold text-final">פעולה במקום {behalf}</span>}
        </div>
      );
    });
  } else if (state === "FIXING") {
    if (can.handleComments) {
      const open = room.openComments;
      tone = open > 0 ? "warn" : "accent";
      title = open > 0 ? `${plural(open, "הערה אחת ממתינה", "הערות ממתינות")} ${can.actsForOthers ? `ל${advisor}` : "לך"}` : "כל ההערות טופלו";
      sub =
        open > 0 ? (
          <>
            לכל הערה מסמנים &quot;תוקן&quot; או &quot;לא מקובל&quot; עם הסבר. אחר כך לוחצים &quot;שלחתי תיקונים&quot;.{" "}
            <button type="button" className="font-semibold text-accent underline-offset-4 hover:underline" onClick={onShowComments}>
              להערות
            </button>
          </>
        ) : room.noNewVersionSinceReturn ? (
          <span className="text-warn">
            לא הועלתה גרסה חדשה מאז שהמכתב הוחזר. אם תיקנת ב-Word, כדאי להעלות קודם את הגרסה המתוקנת.{" "}
            <button type="button" className="font-semibold text-accent underline-offset-4 hover:underline" onClick={onShowVersions}>
              להעלאת גרסה
            </button>
          </span>
        ) : (
          "אפשר לשלוח. מי שהחזיר לתיקון יקבל את המכתב שוב, ומי שאישר נשאר מאושר."
        );
      buttons = <ResubmitButton room={room} disabled={!can.resubmit} />;
      note = forAdvisor;
    } else {
      title = `אצל ${advisor} לתיקונים`;
      sub = can.comment ? "המכתב יחזור לבדיקה אחרי התיקונים. בינתיים אפשר להוסיף הערות." : "המכתב יחזור לבדיקה אחרי התיקונים.";
    }
  } else if ((state === "PREPARING" || state === "BLOCKED") && can.uploadVersion) {
    tone = room.blockers.length ? "warn" : "accent";
    title = room.blockers.length ? "עוד לא אפשר לשלוח לבדיקה" : "המכתב מוכן לשליחה לבדיקה";
    sub = room.blockers.length ? (
      <ul className="flex flex-col gap-1">
        {room.blockers.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <CircleAlert aria-hidden className="mt-0.5 size-4 text-warn" />
            <span>
              <b>{BLOCKER_HELP[b]?.title ?? BLOCKER_LABELS[b]}.</b> {BLOCKER_HELP[b]?.todo}
              {b === "NO_VERSION" && (
                <>
                  {" "}
                  <button type="button" className="font-semibold text-accent underline-offset-4 hover:underline" onClick={onShowVersions}>
                    לגרסאות
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      room.managerNames.includes(room.advisorName)
        ? 'אחרי השליחה המכתב עובר לבדיקה של הסמנכ"ל. שלב מנהל הרישום מאושר בהגשה, כי היועצת היא גם מנהלת הרישום.'
        : room.managerNames.length
          ? `אחרי השליחה המכתב עובר לבדיקה: ${joinNames(room.managerNames.map(shortName))}, ואחר כך הסמנכ"ל.`
          : 'אחרי השליחה המכתב עובר לבדיקה של הסמנכ"ל.'
    );
    buttons = (
      <QuickAction
        action={submitAction}
        hidden={hidden}
        label="שלח לבדיקה"
        icon={<Send aria-hidden className="size-4" />}
        className={btnPrimary}
        pendingLabel="שולח…"
        disabled={!can.submit}
      />
    );
    note = forAdvisor;
  } else if (state === "READY_FOR_ACADEMIC" && can.sendToAcademic) {
    tone = "accent";
    title = "כל המבקרים אישרו";
    sub = "הצעד הבא: שולחים את המכתב לגורם אקדמי בקישור אישי.";
    buttons = (
      <>
        <button type="button" className={btnPrimary} onClick={() => setSending(true)}>
          <SendHorizontal aria-hidden className="size-4" />
          שלח לגורם אקדמי
        </button>
        {can.skipAcademic && (
          <button type="button" className={btnSecondary} onClick={() => setSkipping(true)}>
            <SkipForward aria-hidden className="size-4 rtl:-scale-x-100" />
            דלג על הגורם האקדמי
          </button>
        )}
      </>
    );
    note = forAdvisor;
  } else if (state === "LOADING" || state === "APPROVED") {
    tone = "good";
    title = state === "LOADING" ? "מאושר להפצה" : "הסתיים: המכתב הועלה לגלבוע";
    sub =
      state === "LOADING"
        ? can.markInGilboa
          ? "מורידים את קובץ ה-Word, בונים את המכתב בגלבוע, ומסמנים כאן כשהוא עלה."
          : `ממתין להעלאה לגלבוע אצל ${advisor}.`
        : null;
    buttons = (
      <>
        {latest && (
          <>
            <a href={`/api/versions/${latest.id}/docx`} className={btnSecondary}>
              <FileDown aria-hidden className="size-4" />
              הורד Word
            </a>
            <a href={`/api/versions/${latest.id}/pdf`} className={btnSecondary} target="_blank" rel="noopener">
              <FileText aria-hidden className="size-4" />
              הורד PDF
            </a>
          </>
        )}
        {can.markInGilboa && <GilboaButton room={room} />}
      </>
    );
    note = can.markInGilboa ? forAdvisor : null;
  } else {
    // Nothing for this person to do now: say who holds the letter, offer a reminder to those who may.
    const holders = joinNames(room.holderNames.map(shortName));
    title =
      state === "IN_REVIEW"
        ? `בבדיקה אצל ${holders}`
        : state === "WITH_ACADEMIC"
          ? `אצל הגורם האקדמי: ${holders}`
          : state === "AWAITING_FINAL"
            ? `ממתין לאישור הסופי של ${holders}`
            : state === "READY_FOR_ACADEMIC"
              ? `ממתין לשליחה לגורם אקדמי (${advisor})`
              : state === "BLOCKED"
                ? "המכתב תקוע: חסר בעל תפקיד"
                : `בהכנה אצל ${advisor}`;
    sub = can.comment ? "אין לך פעולה כרגע. אפשר להעיר על המכתב." : "אין לך פעולה כרגע.";
    buttons = (
      <>
        {state === "WITH_ACADEMIC" && can.sendToAcademic && (
          <button type="button" className={btnSecondary} onClick={() => setSending(true)}>
            <SendHorizontal aria-hidden className="size-4" />
            הוסף גורם אקדמי
          </button>
        )}
        {state === "WITH_ACADEMIC" && can.skipAcademic && (
          <button type="button" className={btnSecondary} onClick={() => setSkipping(true)}>
            <SkipForward aria-hidden className="size-4 rtl:-scale-x-100" />
            דלג על הגורם האקדמי
          </button>
        )}
        {can.remind && room.holderNames.length > 0 && (
          <QuickAction action={remindAction} hidden={hidden} label="תזכיר" icon={<Bell aria-hidden className="size-4" />} pendingLabel="שולח…" />
        )}
      </>
    );
  }

  const toneClass = {
    accent: "border-accent/50",
    good: "border-good/50",
    warn: "border-warn/50",
    muted: "border-line-strong",
  }[tone];
  const Icon = tone === "good" ? BadgeCheck : tone === "warn" ? CircleAlert : tone === "accent" ? Info : Info;
  const iconTone = { accent: "text-accent", good: "text-good", warn: "text-warn", muted: "text-muted" }[tone];

  return (
    <>
      <section
        aria-label="הפעולה הבאה"
        className={`fixed inset-x-0 bottom-0 z-30 border-t-2 bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-pop backdrop-blur lg:sticky lg:top-2 lg:bottom-auto lg:z-20 lg:rounded-xl lg:border-2 lg:bg-surface lg:px-4 lg:py-3 lg:shadow-card ${toneClass}`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-60 items-start gap-2">
            <Icon aria-hidden className={`mt-0.5 hidden size-5 sm:block ${iconTone}`} />
            <div className="min-w-0">
              <p className="font-bold leading-snug">{title}</p>
              {sub && <div className="line-clamp-3 text-xs text-muted sm:line-clamp-none sm:text-sm">{sub}</div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {buttons}
            <button
              type="button"
              onClick={onShowComments}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-accent lg:hidden"
            >
              <MessageSquare aria-hidden className="size-4" />
              הערות ({room.comments.length})
            </button>
          </div>
          {note && <p className="basis-full text-xs font-semibold text-final lg:basis-auto">{note}</p>}
        </div>
      </section>

      <DecideDialog target={decide} onClose={() => setDecide(null)} letterId={room.id} drafts={drafts} advisor={advisor} />
      <SendToAcademicDialog open={sending} onClose={() => setSending(false)} letterId={room.id} trackName={room.trackName} choices={choices} />
      <Dialog open={skipping} onClose={() => setSkipping(false)} title="דילוג על הגורם האקדמי">
        <DialogForm
          action={skipAcademicAction}
          onDone={() => setSkipping(false)}
          hidden={hidden}
          submitLabel="דלג ועבור לאישור סופי"
          submitIcon={<SkipForward aria-hidden className="size-4 rtl:-scale-x-100" />}
        >
          <p className="text-sm text-muted">המכתב יעבור ישר לאישור הסופי, בלי גורם אקדמי. זה בסמכותך, וזה יירשם בציר הזמן.</p>
          <TextAreaField label="סיבה (לא חובה)" name="note" rows={2} maxLength={2000} />
        </DialogForm>
      </Dialog>
    </>
  );
}

/** "שלחתי תיקונים". At the academic step: a choice to send it to the academic approver again. */
function ResubmitButton({ room, disabled }: { room: RoomProps; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const academic = room.phase === "ACADEMIC";
  return (
    <>
      <button type="button" className={btnPrimary} disabled={disabled} onClick={() => setOpen(true)} title={disabled ? "קודם מטפלים בכל ההערות" : undefined}>
        <Send aria-hidden className="size-4" />
        שלחתי תיקונים
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="שלחתי תיקונים">
        <DialogForm
          action={resubmitAction}
          onDone={() => setOpen(false)}
          hidden={{ letterId: room.id }}
          submitLabel="שלח"
          submitIcon={<Send aria-hidden className="size-4" />}
          pendingLabel="שולח…"
        >
          {room.noNewVersionSinceReturn && (
            <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              <CircleAlert aria-hidden className="mt-0.5 size-4" />
              לא הועלתה גרסה חדשה מאז שהמכתב הוחזר. אם התיקונים נעשו ב-Word, כדאי לסגור את החלון ולהעלות קודם את הגרסה המתוקנת.
            </p>
          )}
          <p className="text-sm text-muted">
            {academic
              ? "התיקונים של הגורם האקדמי טופלו. ברירת המחדל: המכתב עובר לאישור הסופי."
              : "מי שהחזיר לתיקון יקבל את המכתב שוב לבדיקה. מי שאישר נשאר מאושר."}
          </p>
          {academic && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="resendToAcademic" className="size-4 accent-[var(--accent)]" />
              לשלוח שוב לגורם האקדמי לפני האישור הסופי
            </label>
          )}
        </DialogForm>
      </Dialog>
    </>
  );
}

function GilboaButton({ room }: { room: RoomProps }) {
  return (
    <QuickAction
      action={markInGilboaAction}
      hidden={{ letterId: room.id }}
      label='סמן "הועלה לגלבוע"'
      icon={<Upload aria-hidden className="size-4" />}
      className={btnGood}
      pendingLabel="שומר…"
      confirm={{ message: "לסמן שהמכתב הועלה לגלבוע? ורוניקה תראה שהוא הסתיים.", label: "כן, הועלה" }}
    />
  );
}
