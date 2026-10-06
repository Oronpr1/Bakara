import { schema } from "@al/db";
import type { Tx } from "./letters/state";

export type NotificationType =
  | "SUBMITTED_FOR_REVIEW" // מכתב חדש ממתין לבדיקה ראשונית
  | "RETURNED_FOR_CHANGES" // הוחזר לתיקון
  | "AWAITING_YOUR_APPROVAL" // המכתב ממתין לאישורך
  | "READY_FOR_FINAL" // ממתין לאישור סופי
  | "CHOOSE_ACADEMIC" // סבב הרישום הסתיים: צריך לבחור גורם אקדמי
  | "APPROVED_FOR_DISTRIBUTION"
  | "NEW_VERSION" // הועלתה גרסה חדשה
  | "NEW_COMMENT"
  | "COMMENT_REPLY" // הגיבו להערה שלך
  | "COMMENT_STATUS" // ההערה שלך טופלה / ממתינה להבהרה
  | "REMINDER";

/** Queues in-app notifications (emailed by the notification worker). Never notifies the actor. */
export async function notify(
  tx: Tx,
  recipients: Iterable<string>,
  type: NotificationType,
  letterId: string | null,
  actorId: string | null,
  data: Record<string, unknown> = {},
) {
  const ids = [...new Set(recipients)].filter((id) => id !== actorId);
  if (ids.length === 0) return;
  await tx.insert(schema.notifications).values(ids.map((userId) => ({ userId, letterId, type, data })));
}

export async function audit(
  tx: Tx,
  actorId: string | null,
  type: string,
  ids: { letterId?: string; seasonId?: string },
  data: Record<string, unknown> = {},
) {
  await tx.insert(schema.auditEvents).values({ actorId, type, letterId: ids.letterId, seasonId: ids.seasonId, data });
}
