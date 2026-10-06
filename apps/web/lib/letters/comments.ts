import { getDb, schema, type Db } from "@al/db";
import { abilities, validateAnchor, validateStatusChange, type Actor, type CommentAnchor, type StatusChange } from "@al/domain";
import { and, eq, isNull } from "drizzle-orm";
import { AppError, forbidden, notFound } from "../errors";
import { audit, notify } from "../notify";
import { getFileStore } from "../storage";
import { afterChange } from "./engine";
import { loadLetter } from "./state";

const { comments, commentReplies, versions, letterRequests } = schema;
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

/**
 * A new comment on a marked area of a version's PDF. A reviewer whose turn it is writes drafts that
 * only they see until they approve or return the letter; anyone else's comment is published at once
 * and puts the letter with the advisor.
 */
export async function createComment(
  actor: Actor,
  letterId: string,
  input: { anchor: CommentAnchor; body: string; suggestion?: string; snapshotPng?: Uint8Array },
  db: Db = getDb(),
) {
  const body = cleanBody(input.body);
  const suggestion = input.suggestion?.trim() ? cleanBody(input.suggestion) : null;
  if (input.snapshotPng && (input.snapshotPng.byteLength > MAX_SNAPSHOT_BYTES || !isPng(input.snapshotPng)))
    throw new AppError("INVALID", "תמונת האזור לא תקינה");

  return db.transaction(async (tx) => {
    const l = await loadLetter(tx, letterId, { lock: true });
    const ab = abilities(actor, l.input);
    if (!ab.view) throw notFound();
    if (!ab.comment) throw forbidden();
    const [version] = await tx
      .select({ pageCount: versions.pageCount })
      .from(versions)
      .where(and(eq(versions.letterId, letterId), eq(versions.number, input.anchor.versionNumber)));
    if (!version) throw notFound();
    validateAnchor(input.anchor, version.pageCount, l.row.latestVersion);

    let snapshotKey: string | null = null;
    if (input.snapshotPng) {
      snapshotKey = `letters/${letterId}/snapshots/${crypto.randomUUID()}.png`;
      await getFileStore().put(snapshotKey, input.snapshotPng, "image/png");
    }
    const draft = ab.decide.length > 0;
    const { versionNumber, page, x, y, width, height } = input.anchor;
    const [comment] = await tx
      .insert(comments)
      .values({
        letterId,
        versionNumber,
        page,
        x,
        y,
        width,
        height,
        snapshotKey,
        body,
        suggestion,
        publishedAt: draft ? null : new Date(),
        authorId: actor.userId,
      })
      .returning();
    await audit(tx, actor.userId, "COMMENT_CREATED", { letterId, seasonId: l.row.seasonId }, { commentId: comment!.id, draft });
    if (!draft) {
      if (actor.userId !== l.row.advisorId) {
        await tx.update(letterRequests).set({ advisorHold: true }).where(eq(letterRequests.id, letterId));
        await notify(tx, [l.row.advisorId], "NEW_COMMENT", letterId, actor.userId, { commentId: comment!.id });
      }
      await afterChange(tx, letterId, ab.flow, actor.userId);
    }
    return comment!;
  });
}

/** A reviewer removes a draft comment they wrote and have not published. */
export async function deleteDraftComment(actor: Actor, commentId: string, db: Db = getDb()) {
  const removed = await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.authorId, actor.userId), isNull(comments.publishedAt)))
    .returning({ id: comments.id });
  if (removed.length === 0) throw forbidden();
}

export async function replyToComment(actor: Actor, commentId: string, body: string, db: Db = getDb()) {
  const text = cleanBody(body);
  return db.transaction(async (tx) => {
    const [comment] = await tx.select().from(comments).where(eq(comments.id, commentId));
    if (!comment) throw notFound();
    const l = await loadLetter(tx, comment.letterId);
    const ab = abilities(actor, l.input);
    if (!ab.view || !ab.comment) throw forbidden();
    if (!comment.publishedAt && comment.authorId !== actor.userId) throw notFound();
    const [reply] = await tx.insert(commentReplies).values({ commentId, authorId: actor.userId, body: text }).returning();
    const earlier = await tx.select({ authorId: commentReplies.authorId }).from(commentReplies).where(eq(commentReplies.commentId, commentId));
    await notify(tx, [comment.authorId, l.row.advisorId, ...earlier.map((r) => r.authorId)], "COMMENT_REPLY", comment.letterId, actor.userId, { commentId });
    return reply!;
  });
}

/**
 * The advisor (or the control manager) answers a comment: fixed, or not accepted with a reason.
 * The comment's author, or the control manager, can reopen it.
 */
export async function setCommentStatus(actor: Actor, commentId: string, change: StatusChange, db: Db = getDb()) {
  return db.transaction(async (tx) => {
    const [comment] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
    if (!comment || !comment.publishedAt) throw notFound();
    const l = await loadLetter(tx, comment.letterId, { lock: true });
    const ab = abilities(actor, l.input);
    if (!ab.view) throw notFound();
    const reopening = change.to === "OPEN";
    const mayReopen = ab.view && l.row.phase !== "APPROVED" && (comment.authorId === actor.userId || actor.roles.includes("CONTROL_MANAGER"));
    if (reopening ? !mayReopen : !ab.handleComments) throw forbidden();
    validateStatusChange(comment.status, change);

    await tx
      .update(comments)
      .set({
        status: change.to,
        statusNote: change.note?.trim() || null,
        fixedInVersion: change.to === "RESOLVED_FIXED" ? l.row.latestVersion : null,
        statusChangedBy: actor.userId,
        statusChangedAt: new Date(),
      })
      .where(eq(comments.id, commentId));
    // The note is also kept in the thread, so the conversation reads in order.
    if (change.note?.trim()) await tx.insert(commentReplies).values({ commentId, authorId: actor.userId, body: change.note.trim() });
    if (reopening) await tx.update(letterRequests).set({ advisorHold: true }).where(eq(letterRequests.id, l.row.id));
    await audit(tx, actor.userId, "COMMENT_STATUS", { letterId: l.row.id, seasonId: l.row.seasonId }, { commentId, ...change });
    await notify(tx, [comment.authorId, ...(reopening ? [l.row.advisorId] : [])], "COMMENT_STATUS", l.row.id, actor.userId, { commentId, status: change.to });
    await afterChange(tx, l.row.id, ab.flow, actor.userId);
  });
}
