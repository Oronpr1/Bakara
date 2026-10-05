import { getDb, schema, type Db } from "@al/db";
import {
  canOnLetter,
  validateAnchor,
  validateStatusChange,
  type Actor,
  type CommentAnchor,
  type StatusChange,
} from "@al/domain";
import { and, eq } from "drizzle-orm";
import { AppError, forbidden, notFound } from "../errors";
import { audit, notify } from "../notify";
import { getFileStore } from "../storage";
import { settleLetter } from "./service";
import { loadLetter } from "./state";

const { comments, commentReplies, versions } = schema;
const MAX_BODY = 4000;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

function cleanBody(body: string) {
  const text = body.trim();
  if (!text) throw new AppError("INVALID", "צריך לכתוב את ההערה");
  if (text.length > MAX_BODY) throw new AppError("INVALID", "ההערה ארוכה מדי");
  return text;
}

function isPng(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/** A new comment on a marked area of a version's PDF. */
export async function createComment(
  actor: Actor,
  letterId: string,
  input: { anchor: CommentAnchor; body: string; snapshotPng?: Uint8Array },
  db: Db = getDb(),
) {
  const body = cleanBody(input.body);
  if (input.snapshotPng && (input.snapshotPng.byteLength > MAX_SNAPSHOT_BYTES || !isPng(input.snapshotPng)))
    throw new AppError("INVALID", "תמונת האזור לא תקינה");

  return db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    if (!canOnLetter(actor, "COMMENT", state)) throw forbidden();
    const [version] = await tx
      .select({ pageCount: versions.pageCount })
      .from(versions)
      .where(and(eq(versions.letterId, letterId), eq(versions.number, input.anchor.versionNumber)));
    if (!version) throw notFound();
    validateAnchor(input.anchor, version.pageCount, row.latestVersion);

    let snapshotKey: string | null = null;
    if (input.snapshotPng) {
      snapshotKey = `letters/${letterId}/snapshots/${crypto.randomUUID()}.png`;
      await getFileStore().put(snapshotKey, input.snapshotPng, "image/png");
    }
    const { versionNumber, page, x, y, width, height } = input.anchor;
    const [comment] = await tx
      .insert(comments)
      .values({ letterId, versionNumber, page, x, y, width, height, snapshotKey, body, authorId: actor.userId })
      .returning();
    await audit(tx, actor.userId, "COMMENT_CREATED", { letterId, seasonId: row.seasonId }, { commentId: comment!.id });
    await notify(tx, [row.advisorId], "NEW_COMMENT", letterId, actor.userId, { commentId: comment!.id });
    return comment!;
  });
}

export async function replyToComment(actor: Actor, commentId: string, body: string, db: Db = getDb()) {
  const text = cleanBody(body);
  return db.transaction(async (tx) => {
    const [comment] = await tx.select().from(comments).where(eq(comments.id, commentId));
    if (!comment) throw notFound();
    const { row, state } = await loadLetter(tx, comment.letterId);
    if (!canOnLetter(actor, "REPLY", state)) throw forbidden();
    const [reply] = await tx.insert(commentReplies).values({ commentId, authorId: actor.userId, body: text }).returning();
    const earlier = await tx
      .select({ authorId: commentReplies.authorId })
      .from(commentReplies)
      .where(eq(commentReplies.commentId, commentId));
    await notify(
      tx,
      [comment.authorId, row.advisorId, ...earlier.map((r) => r.authorId)],
      "COMMENT_REPLY",
      comment.letterId,
      actor.userId,
      { commentId },
    );
    return reply!;
  });
}

/** Only the assigned advisor or the control manager change a comment's status. */
export async function setCommentStatus(actor: Actor, commentId: string, change: StatusChange, db: Db = getDb()) {
  return db.transaction(async (tx) => {
    const [comment] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
    if (!comment) throw notFound();
    const { row, state } = await loadLetter(tx, comment.letterId, { lock: true });
    if (!canOnLetter(actor, "SET_COMMENT_STATUS", state)) throw forbidden();
    validateStatusChange(comment.status, change, {
      commentVersion: comment.versionNumber,
      latestVersion: row.latestVersion,
    });

    await tx
      .update(comments)
      .set({
        status: change.to,
        statusNote: change.note?.trim() || null,
        fixedInVersion: change.to === "RESOLVED_FIXED" ? change.fixedInVersion! : null,
        statusChangedBy: actor.userId,
        statusChangedAt: new Date(),
      })
      .where(eq(comments.id, commentId));
    // The note is also kept in the thread, so the conversation reads in order.
    if (change.note?.trim())
      await tx.insert(commentReplies).values({ commentId, authorId: actor.userId, body: change.note.trim() });
    await audit(tx, actor.userId, "COMMENT_STATUS", { letterId: row.id, seasonId: row.seasonId }, { commentId, ...change });
    await notify(tx, [comment.authorId], "COMMENT_STATUS", row.id, actor.userId, { commentId, status: change.to });
    await settleLetter(tx, row.id, actor.userId);
  });
}
