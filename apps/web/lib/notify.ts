import { schema } from "@al/db";
import type { Tx } from "./letters/state";

export type NotificationType =
  | "YOUR_TURN" // המכתב ממתין לבדיקתך / לאישורך
  | "RETURNED_FOR_FIXES" // יש הערות לטיפול (הוחזר לתיקון, או אושר עם הערות)
  | "RESUBMITTED" // היועצת שלחה תיקונים
  | "READY_FOR_ACADEMIC" // כל הבדיקות הושלמו: אפשר לשלוח לגורם אקדמי
  | "ACADEMIC_ANSWERED" // הגורם האקדמי ענה
  | "APPROVED_FOR_DISTRIBUTION"
  | "NEW_VERSION" // הועלתה גרסה חדשה
  | "NEW_COMMENT"
  | "COMMENT_REPLY" // הגיבו להערה שלך
  | "COMMENT_STATUS" // ההערה שלך טופלה / לא התקבלה
  | "ACTED_FOR_YOU" // ורוניקה פעלה במקומך
  | "LINK_REQUEST" // גורם אקדמי ביקש קישור חדש
  | "ADDED_TO_LETTER" // צירפו אותך לצפייה ולהערות על מכתב
  | "REMINDER";

/** Queues in-app notifications (emailed by the notification worker). Never notifies the actor. */
export async function notify(
  tx: Tx,
  recipients: Iterable<string | null | undefined>,
  type: NotificationType,
  letterId: string | null,
  actorId: string | null,
  data: Record<string, unknown> = {},
) {
  const ids = [...new Set(recipients)].filter((id): id is string => Boolean(id) && id !== actorId);
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
