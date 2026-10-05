import {
  openCommentCount,
  pendingApprovers,
  STAGE_LABELS,
  STAGES,
  stageIndex,
  type LetterAction,
  type TransitionAction,
} from "@al/domain";
import {
  BadgeCheck,
  Check,
  CircleCheck,
  FastForward,
  FileUp,
  Hourglass,
  MessageSquare,
  RotateCcw,
  Send,
  TriangleAlert,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { btnDanger, btnPrimary, btnSecondary, summary as summaryClass } from "@/components/ui";
import { waitingOn, type LetterDetail } from "@/lib/letters/queries";
import { approveAction, transitionAction } from "./actions";
import { IconTag, SummaryChevron } from "./bits";

function Hidden({ letterId, action }: { letterId: string; action?: TransitionAction }) {
  return (
    <>
      <input type="hidden" name="letterId" value={letterId} />
      {action && <input type="hidden" name="action" value={action} />}
    </>
  );
}

/** A transition that needs (or allows) a written reason, behind a disclosure. */
function WithReason({
  letterId,
  action,
  icon: Icon,
  summary,
  submitLabel,
  reasonLabel,
  required,
  danger,
  confirm,
}: {
  letterId: string;
  action: TransitionAction;
  icon: LucideIcon;
  summary: string;
  submitLabel: string;
  reasonLabel: string;
  required: boolean;
  danger?: boolean;
  confirm?: string;
}) {
  return (
    <details className="group rounded-lg open:basis-full open:border open:border-line open:bg-surface open:p-3">
      <summary className={`${summaryClass} px-2 text-sm`}>
        <Icon aria-hidden className="size-4" />
        {summary}
        <SummaryChevron />
      </summary>
      <ActionForm
        action={transitionAction}
        submitLabel={submitLabel}
        submitIcon={<Icon aria-hidden className="size-4" />}
        buttonClassName={danger ? btnDanger : btnSecondary}
        className="mt-2 flex max-w-xl flex-col gap-3"
        confirm={confirm}
      >
        <Hidden letterId={letterId} action={action} />
        <TextAreaField label={reasonLabel} name="reason" required={required} maxLength={2000} />
      </ActionForm>
    </details>
  );
}

/** What the stage is waiting for, in one short line. */
function nextStep(detail: LetterDetail, open: number): { title: string; icon: LucideIcon } {
  const { row, state } = detail;
  switch (row.stage) {
    case "DRAFT":
      return row.latestVersion > 0
        ? { title: `גרסה ${row.latestVersion} מוכנה לשליחה לבדיקה`, icon: Send }
        : { title: "צריך להעלות גרסה ראשונה (Word ו-PDF)", icon: FileUp };
    case "INITIAL_REVIEW":
      return { title: `בדיקה ראשונית של גרסה ${row.latestVersion}`, icon: Hourglass };
    case "FINAL_REVIEW":
      return { title: "אישור סופי להפצה", icon: BadgeCheck };
    case "APPROVED":
      return { title: "המכתב אושר להפצה", icon: CircleCheck };
    default:
      if (pendingApprovers(state).length) return { title: `אישור גרסה ${row.latestVersion} ב${STAGE_LABELS[row.stage]}`, icon: Hourglass };
      if (open) return { title: `טיפול ב-${open} הערות פתוחות`, icon: MessageSquare };
      return { title: "הסבב הושלם", icon: CircleCheck };
  }
}

/** The next-step bar: what the letter waits for and who, plus the actions this person may take now. */
export function WorkflowActions({
  detail,
  can,
}: {
  detail: LetterDetail;
  can: (a: LetterAction) => boolean;
}) {
  const { row, state, names } = detail;
  const id = row.id;
  const open = openCommentCount(state);
  const next = STAGES[stageIndex(row.stage) + 1];
  const step = nextStep(detail, open);
  const who = waitingOn(state, names);
  const approved = row.stage === "APPROVED";

  const primary: React.ReactNode[] = [];
  const notes: React.ReactNode[] = [];
  if (can("SUBMIT_FOR_REVIEW") && row.latestVersion > 0)
    primary.push(
      <ActionForm
        key="submit"
        action={transitionAction}
        submitLabel="שלח לבדיקה"
        submitIcon={<Send aria-hidden className="size-4" />}
        pendingLabel="שולח…"
        className="flex"
        inline
      >
        <Hidden letterId={id} action="SUBMIT_FOR_REVIEW" />
      </ActionForm>,
    );
  if (can("INITIAL_APPROVE"))
    primary.push(
      <ActionForm
        key="initial"
        action={transitionAction}
        submitLabel="אשר לסבב"
        submitIcon={<Check aria-hidden className="size-4" />}
        className="flex"
        inline
      >
        <Hidden letterId={id} action="INITIAL_APPROVE" />
      </ActionForm>,
    );
  if (can("APPROVE"))
    primary.push(
      <ActionForm
        key="approve"
        action={approveAction}
        submitLabel={`אשר את גרסה ${row.latestVersion}`}
        submitIcon={<Check aria-hidden className="size-4" />}
        className="flex"
        inline
      >
        <Hidden letterId={id} />
      </ActionForm>,
    );
  if (can("FINAL_APPROVE")) {
    if (open > 0)
      notes.push(
        <p key="final" className="flex items-start gap-1.5 text-sm text-warn">
          <TriangleAlert aria-hidden className="mt-0.5 size-4" />
          לפני אישור סופי צריך לסגור או לענות על {open} הערות פתוחות.
        </p>,
      );
    else
      primary.push(
        <ActionForm
          key="final"
          action={transitionAction}
          submitLabel="אישור סופי: מאושר להפצה"
          submitIcon={<BadgeCheck aria-hidden className="size-4" />}
          buttonClassName={btnPrimary}
          confirm="לאשר את המכתב להפצה?"
          className="flex"
          inline
        >
          <Hidden letterId={id} action="FINAL_APPROVE" />
        </ActionForm>,
      );
  }

  const secondary: React.ReactNode[] = [];
  if (can("RETURN_FOR_CHANGES"))
    secondary.push(
      <WithReason
        key="return"
        letterId={id}
        action="RETURN_FOR_CHANGES"
        icon={Undo2}
        summary="החזר לתיקון"
        submitLabel="החזר ליועצת לתיקון"
        reasonLabel="מה צריך לתקן (לא חובה)"
        required={false}
      />,
    );
  if (can("FORCE_ADVANCE") && next && next !== "APPROVED")
    secondary.push(
      <WithReason
        key="force"
        letterId={id}
        action="FORCE_ADVANCE"
        icon={FastForward}
        summary="העבר שלב"
        submitLabel={`העבר ל${STAGE_LABELS[next]}`}
        reasonLabel="סיבה (חובה, נשמרת בהיסטוריה)"
        required
        danger
        confirm={`להעביר את המכתב ל${STAGE_LABELS[next]} בלי לחכות לסיום השלב?`}
      />,
    );
  if (can("REOPEN"))
    secondary.push(
      <WithReason
        key="reopen"
        letterId={id}
        action="REOPEN"
        icon={RotateCcw}
        summary="פתח מחדש"
        submitLabel="פתח מחדש לאישור סופי"
        reasonLabel="סיבה (חובה, נשמרת בהיסטוריה)"
        required
        danger
        confirm="לפתוח מחדש מכתב שכבר אושר להפצה?"
      />,
    );

  const mine = primary.length > 0;
  const Icon = step.icon;
  return (
    <section
      aria-labelledby="next-h"
      className={`overflow-hidden rounded-xl border bg-surface shadow-card ${mine ? "border-accent/50" : "border-line"}`}
    >
      <div className={`flex flex-col gap-3 border-s-4 p-4 sm:flex-row sm:items-center sm:justify-between ${mine ? "border-s-accent" : approved ? "border-s-good" : "border-s-line-strong"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={`grid size-10 shrink-0 place-items-center rounded-full ${approved ? "bg-good-soft text-good" : "bg-accent-soft text-accent"}`}
          >
            <Icon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold text-muted">{mine ? "הצעד הבא שלך" : approved ? "סטטוס" : "השלב הבא"}</p>
            <h2 id="next-h" className="font-bold leading-snug">
              {step.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {!approved && who !== "—" && (
                <span className="flex items-center gap-1.5">
                  <UserRound aria-hidden className="size-4" />
                  ממתין ל: <span className="font-semibold text-fg">{who}</span>
                </span>
              )}
              {open > 0 && (
                <IconTag icon={MessageSquare} tone="warn">
                  {open} הערות פתוחות
                </IconTag>
              )}
            </div>
            {can("SUBMIT_FOR_REVIEW") && row.latestVersion === 0 && (
              <p className="text-sm text-muted">אחרי ההעלאה (בפאנל &quot;גרסאות&quot;) אפשר לשלוח לבדיקה.</p>
            )}
            {notes}
          </div>
        </div>
        {mine && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{primary}</div>}
      </div>
      {secondary.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-line bg-surface-2 px-3 py-1.5">
          <span className="flex min-h-9 items-center px-1 text-sm text-muted">פעולות נוספות:</span>
          {secondary}
        </div>
      )}
    </section>
  );
}
