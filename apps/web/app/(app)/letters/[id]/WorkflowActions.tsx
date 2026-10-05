import { openCommentCount, STAGE_LABELS, STAGES, stageIndex, type LetterAction, type TransitionAction } from "@al/domain";
import { ActionForm } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { btnDanger, btnSecondary, card } from "@/components/ui";
import type { LetterDetail } from "@/lib/letters/queries";
import { approveAction, transitionAction } from "./actions";

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
  summary,
  submitLabel,
  reasonLabel,
  required,
  danger,
}: {
  letterId: string;
  action: TransitionAction;
  summary: string;
  submitLabel: string;
  reasonLabel: string;
  required: boolean;
  danger?: boolean;
}) {
  return (
    <details className="w-full rounded-lg border border-line p-3 open:bg-bg">
      <summary className="cursor-pointer font-semibold text-accent">{summary}</summary>
      <ActionForm
        action={transitionAction}
        submitLabel={submitLabel}
        buttonClassName={danger ? btnDanger : btnSecondary}
        className="mt-3 flex flex-col gap-3"
      >
        <Hidden letterId={letterId} action={action} />
        <TextAreaField label={reasonLabel} name="reason" required={required} maxLength={2000} />
      </ActionForm>
    </details>
  );
}

/** The workflow buttons this person may use right now. */
export function WorkflowActions({
  detail,
  can,
}: {
  detail: LetterDetail;
  can: (a: LetterAction) => boolean;
}) {
  const { row, state } = detail;
  const id = row.id;
  const open = openCommentCount(state);
  const next = STAGES[stageIndex(row.stage) + 1];

  const primary: React.ReactNode[] = [];
  if (can("SUBMIT_FOR_REVIEW"))
    primary.push(
      row.latestVersion > 0 ? (
        <ActionForm key="submit" action={transitionAction} submitLabel="שלח לבדיקה" pendingLabel="שולח…" inline>
          <Hidden letterId={id} action="SUBMIT_FOR_REVIEW" />
        </ActionForm>
      ) : (
        <p key="submit" className="text-sm text-muted">
          כדי לשלוח לבדיקה צריך קודם להעלות גרסה (Word ו-PDF).
        </p>
      ),
    );
  if (can("INITIAL_APPROVE"))
    primary.push(
      <ActionForm key="initial" action={transitionAction} submitLabel="אשר לסבב" inline>
        <Hidden letterId={id} action="INITIAL_APPROVE" />
      </ActionForm>,
    );
  if (can("APPROVE"))
    primary.push(
      <ActionForm key="approve" action={approveAction} submitLabel={`אשר את גרסה ${row.latestVersion}`} inline>
        <Hidden letterId={id} />
      </ActionForm>,
    );
  if (can("FINAL_APPROVE"))
    primary.push(
      open > 0 ? (
        <p key="final" className="text-sm text-warn">
          לפני אישור סופי צריך לסגור או לענות על {open} הערות פתוחות.
        </p>
      ) : (
        <ActionForm
          key="final"
          action={transitionAction}
          submitLabel="אישור סופי: מאושר להפצה"
          confirm="לאשר את המכתב להפצה?"
          inline
        >
          <Hidden letterId={id} action="FINAL_APPROVE" />
        </ActionForm>
      ),
    );

  const secondary: React.ReactNode[] = [];
  if (can("RETURN_FOR_CHANGES"))
    secondary.push(
      <WithReason
        key="return"
        letterId={id}
        action="RETURN_FOR_CHANGES"
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
        summary="העבר שלב"
        submitLabel={`העבר ל${STAGE_LABELS[next]}`}
        reasonLabel="סיבה (חובה, נשמרת בהיסטוריה)"
        required
        danger
      />,
    );
  if (can("REOPEN"))
    secondary.push(
      <WithReason
        key="reopen"
        letterId={id}
        action="REOPEN"
        summary="פתח מחדש"
        submitLabel="פתח מחדש לאישור סופי"
        reasonLabel="סיבה (חובה, נשמרת בהיסטוריה)"
        required
        danger
      />,
    );

  if (primary.length === 0 && secondary.length === 0) return null;
  return (
    <section aria-labelledby="actions-h" className={`${card} flex flex-col gap-3`}>
      <h2 id="actions-h" className="font-bold">
        מה אפשר לעשות עכשיו
      </h2>
      {primary.length > 0 && <div className="flex flex-wrap items-start gap-3">{primary}</div>}
      {secondary.length > 0 && <div className="flex flex-col gap-2">{secondary}</div>}
    </section>
  );
}
