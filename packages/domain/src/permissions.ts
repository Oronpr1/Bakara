import type { Actor, ApproverSlot, LetterState, Role } from "./types";
import { hasApproved, roundOfSlot, stageIndex } from "./workflow";

/** Actions that do not belong to a single letter. */
export type GlobalAction =
  | "MANAGE_USERS"
  | "MANAGE_SEASONS" // יצירת עונה, "צור על בסיס עונה קודמת"
  | "SET_REMINDER_INTERVAL"
  | "CREATE_LETTER_REQUEST"
  | "VIEW_ALL_LETTERS"; // דשבורד מלא

/** Actions on one letter request. */
export type LetterAction =
  | "VIEW"
  | "COMMENT"
  | "REPLY"
  | "SET_COMMENT_STATUS" // סגירה, "ממתינה להבהרה", פתיחה מחדש
  | "UPLOAD_VERSION"
  | "SUBMIT_FOR_REVIEW"
  | "INITIAL_APPROVE"
  | "RETURN_FOR_CHANGES"
  | "APPROVE"
  | "FINAL_APPROVE"
  | "FORCE_ADVANCE"
  | "REOPEN"
  | "SET_REGISTRATION_MANAGER"
  | "SET_ACADEMIC_APPROVERS"
  | "REMOVE_APPROVER"
  | "CHANGE_ADVISOR"
  | "EDIT_DETAILS"; // קמפוס, פקולטה, מסלול, תאריך יעד

const has = (actor: Actor, ...roles: Role[]) => roles.some((r) => actor.roles.includes(r));

/** Control manager and VP of registration are the top authority in the system. */
export const isTopAuthority = (actor: Actor) => has(actor, "CONTROL_MANAGER", "VP_REGISTRATION");

export function canGlobal(actor: Actor, action: GlobalAction): boolean {
  switch (action) {
    case "MANAGE_USERS":
      return has(actor, "ADMIN", "CONTROL_MANAGER");
    case "MANAGE_SEASONS":
    case "VIEW_ALL_LETTERS":
      return has(actor, "ADMIN", "CONTROL_MANAGER", "VP_REGISTRATION");
    case "SET_REMINDER_INTERVAL":
      return has(actor, "CONTROL_MANAGER");
    case "CREATE_LETTER_REQUEST":
      return has(actor, "CONTROL_MANAGER", "VP_REGISTRATION", "CONTROL_ADVISOR", "REGISTRATION_MANAGER");
  }
}

function isParticipant(actor: Actor, letter: LetterState): boolean {
  return letter.advisorId === actor.userId || letter.approvers.some((a) => a.userId === actor.userId);
}

/** The approver slots this actor holds on the letter (active ones only). */
export function activeSlotsOf(actor: Actor, letter: LetterState): ApproverSlot[] {
  return letter.approvers.filter((a) => a.userId === actor.userId && !a.removedAt).map((a) => a.slot);
}

/**
 * Whether the actor may perform the action on this letter. Stage rules that are about the
 * process (e.g. no open comments at final approval) are enforced by workflow.transition;
 * this answers "is this person allowed to try".
 */
export function canOnLetter(actor: Actor, action: LetterAction, letter: LetterState): boolean {
  const cm = has(actor, "CONTROL_MANAGER");
  const top = isTopAuthority(actor);
  const advisor = letter.advisorId === actor.userId;
  const handler = advisor || cm; // רק היועצת האחראית או מנהלת הבקרה מטפלות בהערות ובגרסאות
  const viewer = top || has(actor, "ADMIN") || isParticipant(actor, letter);
  const open = letter.stage !== "APPROVED";

  switch (action) {
    case "VIEW":
      return viewer;
    case "COMMENT":
    case "REPLY":
      // סביבת עבודה: כל מי שרואה את המכתב יכול להעיר עד האישור הסופי.
      return viewer && open;
    case "SET_COMMENT_STATUS":
    case "UPLOAD_VERSION":
      return handler && open;
    case "SUBMIT_FOR_REVIEW":
      return handler && letter.stage === "DRAFT";
    case "INITIAL_APPROVE":
    case "RETURN_FOR_CHANGES":
      return cm && letter.stage === "INITIAL_REVIEW";
    case "APPROVE":
      // An approver may approve once their round has started, and until final approval.
      return (
        open &&
        activeSlotsOf(actor, letter).some(
          (slot) =>
            stageIndex(letter.stage) >= stageIndex(roundOfSlot(slot)) && !hasApproved(letter, actor.userId, slot),
        )
      );
    case "FINAL_APPROVE":
      return cm && letter.stage === "FINAL_REVIEW";
    case "FORCE_ADVANCE":
      return cm && open && letter.stage !== "FINAL_REVIEW";
    case "REOPEN":
      return cm && letter.stage === "APPROVED";
    case "SET_REGISTRATION_MANAGER":
      // היועצת בוחרת בתחילת הדרך; סמנכ"ל או מנהלת בקרה יכולים להחליף בכל שלב.
      return open && (top || (advisor && letter.stage === "DRAFT"));
    case "SET_ACADEMIC_APPROVERS":
      return open && (top || (advisor && stageIndex(letter.stage) < stageIndex("ACADEMIC_ROUND")));
    case "REMOVE_APPROVER":
      return open && top;
    case "CHANGE_ADVISOR":
      return open && cm;
    case "EDIT_DETAILS":
      return open && (top || advisor);
  }
}
