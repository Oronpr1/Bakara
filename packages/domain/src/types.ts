// Core vocabulary of the acceptance-letter workflow. Plain data only, so the same
// rules run on the server, in tests, and anywhere else that needs them.

export const ROLES = [
  "ADMIN",
  "CONTROL_MANAGER", // מנהלת מחלקת בקרה
  "VP_REGISTRATION", // סמנכ"ל רישום
  "CONTROL_ADVISOR", // יועצת בקרה
  "REGISTRATION_MANAGER", // מנהל רישום
  "ACADEMIC_APPROVER", // גורם אקדמי
] as const;
export type Role = (typeof ROLES)[number];

export const STAGES = [
  "DRAFT", // טיוטה: אין גרסה, או הוחזר לתיקון
  "INITIAL_REVIEW", // בדיקה ראשונית של מנהלת הבקרה
  "REGISTRATION_ROUND", // מנהל רישום + סמנכ"ל רישום במקביל
  "ACADEMIC_ROUND", // כל הגורמים האקדמיים
  "FINAL_REVIEW", // אישור סופי של מנהלת הבקרה
  "APPROVED", // מאושר להפצה
] as const;
export type Stage = (typeof STAGES)[number];

/** Which round an assigned approver belongs to. */
export const APPROVER_SLOTS = ["REGISTRATION_MANAGER", "VP_REGISTRATION", "ACADEMIC"] as const;
export type ApproverSlot = (typeof APPROVER_SLOTS)[number];

export const COMMENT_STATUSES = [
  "OPEN",
  "NEEDS_CLARIFICATION", // היועצת ביקשה הבהרה מכותב ההערה
  "RESOLVED_FIXED", // טופלה, תוקן בגרסה N
  "RESOLVED_NO_CHANGE", // נענתה ללא שינוי, עם הסבר
] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface Actor {
  userId: string;
  roles: readonly Role[];
}

export interface ApproverAssignment {
  userId: string;
  slot: ApproverSlot;
  /** Set when the control manager removed this approver from the process. */
  removedAt?: Date | null;
}

export interface Approval {
  userId: string;
  slot: ApproverSlot;
  /** The version number that was current when the approval was given. */
  versionNumber: number;
  at: Date;
}

export interface CommentSummary {
  id: string;
  authorId: string;
  status: CommentStatus;
}

/** Everything the rules need to know about one letter request. */
export interface LetterState {
  stage: Stage;
  advisorId: string;
  approvers: readonly ApproverAssignment[];
  approvals: readonly Approval[];
  comments: readonly CommentSummary[];
  /** Highest version number uploaded so far, 0 when there is none. */
  latestVersion: number;
}
