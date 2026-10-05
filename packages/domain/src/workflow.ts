import type { ApproverSlot, LetterState, Stage } from "./types";

const ROUND_SLOTS: Partial<Record<Stage, readonly ApproverSlot[]>> = {
  REGISTRATION_ROUND: ["REGISTRATION_MANAGER", "VP_REGISTRATION"],
  ACADEMIC_ROUND: ["ACADEMIC"],
};

const STAGE_ORDER: Record<Stage, number> = {
  DRAFT: 0,
  INITIAL_REVIEW: 1,
  REGISTRATION_ROUND: 2,
  ACADEMIC_ROUND: 3,
  FINAL_REVIEW: 4,
  APPROVED: 5,
};

/** The round in which an approver of this slot is asked to approve. */
export function roundOfSlot(slot: ApproverSlot): Stage {
  return slot === "ACADEMIC" ? "ACADEMIC_ROUND" : "REGISTRATION_ROUND";
}

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER[stage];
}

export function isOpenComment(status: string): boolean {
  return status === "OPEN" || status === "NEEDS_CLARIFICATION";
}

export function openCommentCount(letter: LetterState): number {
  return letter.comments.filter((c) => isOpenComment(c.status)).length;
}

export function activeApprovers(letter: LetterState, slots?: readonly ApproverSlot[]) {
  return letter.approvers.filter((a) => !a.removedAt && (!slots || slots.includes(a.slot)));
}

export function hasApproved(letter: LetterState, userId: string, slot: ApproverSlot): boolean {
  return letter.approvals.some((a) => a.userId === userId && a.slot === slot);
}

/** Approvers of the current round who still have to approve. */
export function pendingApprovers(letter: LetterState) {
  const slots = ROUND_SLOTS[letter.stage];
  if (!slots) return [];
  return activeApprovers(letter, slots).filter((a) => !hasApproved(letter, a.userId, a.slot));
}

export type GateBlocker =
  | { kind: "PENDING_APPROVAL"; userId: string; slot: ApproverSlot }
  | { kind: "OPEN_COMMENTS"; count: number }
  | { kind: "NO_VERSION" };

/**
 * Why the letter cannot leave its current round automatically. An empty list means the
 * round is complete. Only the two approval rounds advance on their own; every other stage
 * moves by an explicit action.
 */
export function roundBlockers(letter: LetterState): GateBlocker[] {
  if (!ROUND_SLOTS[letter.stage]) return [];
  const blockers: GateBlocker[] = pendingApprovers(letter).map((a) => ({
    kind: "PENDING_APPROVAL" as const,
    userId: a.userId,
    slot: a.slot,
  }));
  const open = openCommentCount(letter);
  if (open > 0) blockers.push({ kind: "OPEN_COMMENTS", count: open });
  return blockers;
}

/**
 * The stage the letter should move to on its own, or null when it stays put.
 * Called after every approval, comment status change, or approver removal. Rounds with
 * no active approvers left are skipped.
 */
export function autoAdvance(letter: LetterState): Stage | null {
  let stage = letter.stage;
  // Loop so that an empty academic round right after the registration round is skipped too.
  for (;;) {
    if (!ROUND_SLOTS[stage]) break;
    if (roundBlockers({ ...letter, stage }).length > 0) break;
    stage = stage === "REGISTRATION_ROUND" ? "ACADEMIC_ROUND" : "FINAL_REVIEW";
  }
  return stage === letter.stage ? null : stage;
}

/** Explicit transitions people trigger. Rounds also advance via autoAdvance. */
export const ACTIONS = [
  "SUBMIT_FOR_REVIEW", // יועצת: שליחה לבדיקה ראשונית
  "INITIAL_APPROVE", // מנהלת בקרה: אישור לסבב
  "RETURN_FOR_CHANGES", // מנהלת בקרה: החזרה לתיקון
  "FORCE_ADVANCE", // מנהלת בקרה: העברה לשלב הבא למרות חוסמים, עם סיבה
  "FINAL_APPROVE", // מנהלת בקרה: מאושר להפצה
  "REOPEN", // מנהלת בקרה: פתיחה מחדש של מכתב מאושר
] as const;
export type TransitionAction = (typeof ACTIONS)[number];

export class WorkflowError extends Error {
  constructor(
    public readonly code:
      | "INVALID_STAGE"
      | "NO_VERSION"
      | "OPEN_COMMENTS"
      | "REASON_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

const NEXT_STAGE: Record<Stage, Stage | null> = {
  DRAFT: "INITIAL_REVIEW",
  INITIAL_REVIEW: "REGISTRATION_ROUND",
  REGISTRATION_ROUND: "ACADEMIC_ROUND",
  ACADEMIC_ROUND: "FINAL_REVIEW",
  FINAL_REVIEW: "APPROVED",
  APPROVED: null,
};

/**
 * Applies an explicit transition and returns the resulting stage, after any automatic
 * advancing. Permission checks live in permissions.ts; this only enforces the rules of
 * the process itself.
 */
export function transition(
  letter: LetterState,
  action: TransitionAction,
  opts: { reason?: string } = {},
): Stage {
  const need = (stage: Stage) => {
    if (letter.stage !== stage)
      throw new WorkflowError("INVALID_STAGE", `Action ${action} is not allowed in stage ${letter.stage}`);
  };
  const settle = (stage: Stage) => autoAdvance({ ...letter, stage }) ?? stage;

  switch (action) {
    case "SUBMIT_FOR_REVIEW":
      need("DRAFT");
      if (letter.latestVersion < 1) throw new WorkflowError("NO_VERSION", "Upload a version before submitting");
      return "INITIAL_REVIEW";
    case "INITIAL_APPROVE":
      need("INITIAL_REVIEW");
      return settle("REGISTRATION_ROUND");
    case "RETURN_FOR_CHANGES":
      need("INITIAL_REVIEW");
      return "DRAFT";
    case "FINAL_APPROVE":
      need("FINAL_REVIEW");
      if (openCommentCount(letter) > 0)
        throw new WorkflowError("OPEN_COMMENTS", "Close or answer all open comments before final approval");
      return "APPROVED";
    case "FORCE_ADVANCE": {
      if (!opts.reason?.trim()) throw new WorkflowError("REASON_REQUIRED", "A reason is required");
      const next = NEXT_STAGE[letter.stage];
      if (!next || next === "APPROVED")
        throw new WorkflowError("INVALID_STAGE", "Final approval cannot be forced; use FINAL_APPROVE");
      if (letter.latestVersion < 1) throw new WorkflowError("NO_VERSION", "Upload a version first");
      return settle(next);
    }
    case "REOPEN":
      need("APPROVED");
      if (!opts.reason?.trim()) throw new WorkflowError("REASON_REQUIRED", "A reason is required");
      return "FINAL_REVIEW";
  }
}

/** True when the approver's approval was given on an older version than the latest one. */
export function changedSinceApproval(letter: LetterState, userId: string, slot: ApproverSlot): boolean {
  const approval = letter.approvals.find((a) => a.userId === userId && a.slot === slot);
  return !!approval && approval.versionNumber < letter.latestVersion;
}
