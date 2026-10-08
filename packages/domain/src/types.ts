// Core vocabulary of the acceptance-letter workflow. Plain data only, so the same
// rules run on the server, in tests, and anywhere else that needs them.

export const ROLES = [
  "ADMIN", // מנהל מערכת
  "CONTROL_MANAGER", // ורוניקה: מנהלת מחלקת בקרה
  "VP_REGISTRATION", // סמנכ"ל רישום
  "CONTROL_ADVISOR", // יועצת בקרה
  "REGISTRATION_MANAGER", // מנהל רישום
  "ACADEMIC_APPROVER", // גורם אקדמי (בקישור אישי)
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Comment states. "NEEDS_CLARIFICATION" is legacy and no longer used (a reply in the thread does
 * that job); it stays in the list only because the database enum has it.
 */
export const COMMENT_STATUSES = [
  "OPEN", // פתוחה
  "NEEDS_CLARIFICATION",
  "RESOLVED_FIXED", // טופלה: תוקן
  "RESOLVED_NO_CHANGE", // לא מקובלת: נענתה ללא שינוי, עם הסבר
] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface Actor {
  userId: string;
  roles: readonly Role[];
}
