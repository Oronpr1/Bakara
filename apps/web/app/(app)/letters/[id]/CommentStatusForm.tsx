"use client";

import { COMMENT_STATUS_LABELS, COMMENT_STATUSES, isOpenComment, type CommentStatus } from "@al/domain";
import { CircleCheck, CircleHelp, MessageSquareText, RotateCcw, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { SelectField, TextAreaField } from "@/components/Field";
import { btnSecondary } from "@/components/ui";
import { commentStatusAction } from "./actions";

const VERB: Record<CommentStatus, string> = {
  OPEN: "פתח מחדש",
  NEEDS_CLARIFICATION: "בקש הבהרה",
  RESOLVED_FIXED: "סמן כטופלה",
  RESOLVED_NO_CHANGE: "ענה ללא שינוי",
};

const ICON: Record<CommentStatus, LucideIcon> = {
  OPEN: RotateCcw,
  NEEDS_CLARIFICATION: CircleHelp,
  RESOLVED_FIXED: CircleCheck,
  RESOLVED_NO_CHANGE: MessageSquareText,
};

/** Advisor / control manager: move a comment to its next status. The server re-checks everything. */
export function CommentStatusForm({
  letterId,
  commentId,
  from,
  versionNumbers,
}: {
  letterId: string;
  commentId: string;
  from: CommentStatus;
  /** Versions that may carry a fix: the comment's version and later ones. */
  versionNumbers: number[];
}) {
  const choices = COMMENT_STATUSES.filter((s) => s !== from && (isOpenComment(from) || s === "OPEN"));
  const [to, setTo] = useState<CommentStatus>(choices[0]!);
  const Icon = ICON[to];
  const noteRequired = to === "NEEDS_CLARIFICATION" || to === "RESOLVED_NO_CHANGE";

  return (
    <ActionForm
      action={commentStatusAction}
      submitLabel={VERB[to]}
      submitIcon={<Icon aria-hidden className="size-4" />}
      buttonClassName={btnSecondary}
      className="@container flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3"
    >
      <input type="hidden" name="letterId" value={letterId} />
      <input type="hidden" name="commentId" value={commentId} />
      <div className="grid gap-3 @md:grid-cols-2">
        <SelectField
          label="סטטוס חדש"
          name="to"
          value={to}
          onChange={(e) => setTo(e.currentTarget.value as CommentStatus)}
          options={choices.map((s) => ({ value: s, label: COMMENT_STATUS_LABELS[s] }))}
        />
        {to === "RESOLVED_FIXED" && (
          <SelectField
            label="תוקן בגרסה"
            name="fixedInVersion"
            required
            defaultValue={String(versionNumbers.at(-1) ?? "")}
            options={versionNumbers.map((n) => ({ value: String(n), label: `גרסה ${n}` }))}
          />
        )}
      </div>
      {to !== "OPEN" && (
        <TextAreaField
          label={noteRequired ? (to === "NEEDS_CLARIFICATION" ? "מה צריך להבהיר (חובה)" : "הסבר (חובה)") : "הערה (לא חובה)"}
          name="note"
          required={noteRequired}
          maxLength={4000}
        />
      )}
    </ActionForm>
  );
}
