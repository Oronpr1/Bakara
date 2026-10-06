import { CommentError, FlowError } from "@al/domain";

/** An error whose message is safe and meaningful to show the user (in Hebrew). */
export class AppError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = () => new AppError("FORBIDDEN", "אין לך הרשאה לפעולה הזאת");
export const notFound = () => new AppError("NOT_FOUND", "הפריט לא נמצא");

const COMMENT_MESSAGES: Record<CommentError["code"], string> = {
  INVALID_ANCHOR: "האזור המסומן לא תקין",
  INVALID_STATUS_CHANGE: "אי אפשר לשנות את ההערה לסטטוס הזה",
  NOTE_REQUIRED: "צריך לכתוב הסבר",
  VERSION_REQUIRED: "צריך לבחור את הגרסה שבה תוקן",
};

/** Turns any thrown error into a message for the user, hiding internals. */
export function userMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof FlowError) return err.message;
  if (err instanceof CommentError) return COMMENT_MESSAGES[err.code];
  console.error(err);
  return "משהו השתבש. נסו שוב, ואם זה חוזר פנו למנהלת הבקרה.";
}
