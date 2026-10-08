import { getDb, schema, type Db } from "@al/db";
import {
  abilities,
  isColor,
  lineAnchor,
  validateAnchor,
  validateStatusChange,
  type Actor,
  type CommentAnchor,
  type CommentKind,
  type CommentPoints,
  type StatusChange,
} from "@al/domain";
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
const advisorsOf = (p: { advisorId: string | null; extraAdvisorIds: readonly string[] }) => [p.advisorId, ...p.extraAdvisorIds].filter((id): id is string => Boolean(id));

export async function createComment(
  actor: Actor,
  letterId: string,
  input: {
    anchor: CommentAnchor;
    /** Required for a note; optional for an X or a line (a mark without words). */
    body?: string;
    suggestion?: string;
    kind?: CommentKind;
    color?: string | null;
    /** For a line: its two end points. */
    points?: CommentPoints;
    snapshotPng?: Uint8Array;
  },
  db: Db = getDb(),
) {
  const kind = input.kind ?? "NOTE";
  const body = kind === "NOTE" ? cleanBody(input.body ?? "") : (input.body ?? "").trim().slice(0, MAX_BODY);
  const suggestion = input.suggestion?.trim() ? cleanBody(input.suggestion) : null;
  if (input.color != null && !isColor(input.color)) throw new AppError("INVALID", "הצבע לא תקין");
  const anchorIn = kind === "LINE" ? lineAnchor(input.points ?? [], input.anchor.versionNumber, input.anchor.page) : input.anchor;
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
    validateAnchor(anchorIn, version.pageCount, l.row.latestVersion);

    let snapshotKey: string | null = null;
    if (input.snapshotPng) {
      snapshotKey = `letters/${letterId}/snapshots/${crypto.randomUUID()}.png`;
      await getFileStore().put(snapshotKey, input.snapshotPng, "image/png");
    }
    const draft = ab.decide.length > 0;
    const { versionNumber, page, x, y, width, height } = anchorIn;
    const [comment] = await tx
      .insert(comments)
      .values({
        kind,
        color: input.color ?? null,
        points: kind === "LINE" ? input.points : null,
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
        advisory: ab.commentIsAdvisory,
        authorId: actor.userId,
      })
      .returning();
    await audit(tx, actor.userId, "COMMENT_CREATED", { letterId, seasonId: l.row.seasonId }, { commentId: comment!.id, draft });
    if (ab.commentIsAdvisory) {
      // Advice from someone attached only to look and comment: the advisors are told, but the letter
      // stays where it is, and nothing here counts as open work that holds anything back.
      await notify(tx, advisorsOf(l.input.people), "NEW_COMMENT", letterId, actor.userId, { commentId: comment!.id });
    } else if (!draft) {
      const advisors = advisorsOf(l.input.people);
      if (!advisors.includes(actor.userId)) {
        await tx.update(letterRequests).set({ advisorHold: true }).where(eq(letterRequests.id, letterId));
        await notify(tx, advisors, "NEW_COMMENT", letterId, actor.userId, { commentId: comment!.id });
      }
      await afterChange(tx, letterId, ab.flow, actor.userId);
    }
    return comment!;
  });
}

/** The author changes a draft: moves or resizes it, recolours it, or rewrites it. Published comments are not edited. */
export async function updateDraftComment(
  actor: Actor,
  commentId: string,
  change: { anchor?: Omit<CommentAnchor, "versionNumber" | "page"> & Partial<Pick<CommentAnchor, "versionNumber" | "page">>; color?: string | null; points?: CommentPoints; body?: string; suggestion?: string | null },
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [comment] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
    if (!comment || comment.authorId !== actor.userId || comment.publishedAt) throw forbidden();
    const l = await loadLetter(tx, comment.letterId);
    if (!abilities(actor, l.input).comment) throw forbidden();
    if (change.color != null && !isColor(change.color)) throw new AppError("INVALID", "הצבע לא תקין");
    const set: Partial<typeof comments.$inferInsert> = {};
    if (change.color !== undefined) set.color = change.color;
    if (change.body !== undefined) set.body = comment.kind === "NOTE" ? cleanBody(change.body) : change.body.trim().slice(0, MAX_BODY);
    if (change.suggestion !== undefined) set.suggestion = change.suggestion?.trim() ? cleanBody(change.suggestion) : null;
    const page = change.anchor?.page ?? comment.page;
    const versionNumber = change.anchor?.versionNumber ?? comment.versionNumber;
    // A line moved by its box alone: its points move by the same distance, so they stay inside it.
    let points = change.points;
    if (comment.kind === "LINE" && !points && change.anchor && comment.points) {
      const dx = change.anchor.x - comment.x;
      const dy = change.anchor.y - comment.y;
      points = comment.points.map(([px, py]) => [px + dx, py + dy] as [number, number]);
    }
    const anchor =
      comment.kind === "LINE" && points
        ? lineAnchor(points, versionNumber, page)
        : change.anchor
          ? { versionNumber, page, x: change.anchor.x, y: change.anchor.y, width: change.anchor.width, height: change.anchor.height }
          : null;
    if (anchor) {
      const [version] = await tx.select({ pageCount: versions.pageCount }).from(versions).where(and(eq(versions.letterId, comment.letterId), eq(versions.number, versionNumber)));
      if (!version) throw notFound();
      validateAnchor(anchor, version.pageCount, l.row.latestVersion);
      // The picture of the old place no longer shows what the mark points at, so it is dropped.
      Object.assign(set, { page: anchor.page, x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height, snapshotKey: null });
    }
    if (points && comment.kind === "LINE") set.points = points;
    if (Object.keys(set).length === 0) return comment;
    const [updated] = await tx.update(comments).set(set).where(eq(comments.id, commentId)).returning();
    return updated!;
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
    if (!ab.view || !ab.reply) throw forbidden();
    if (!comment.publishedAt && comment.authorId !== actor.userId) throw notFound();
    const [reply] = await tx.insert(commentReplies).values({ commentId, authorId: actor.userId, body: text }).returning();
    const earlier = await tx.select({ authorId: commentReplies.authorId }).from(commentReplies).where(eq(commentReplies.commentId, commentId));
    await notify(tx, [comment.authorId, ...advisorsOf(l.input.people), ...earlier.map((r) => r.authorId)], "COMMENT_REPLY", comment.letterId, actor.userId, { commentId });
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
    // Advice from a commenter never holds the letter back, not even when reopened.
    if (reopening && !comment.advisory) await tx.update(letterRequests).set({ advisorHold: true }).where(eq(letterRequests.id, l.row.id));
    await audit(tx, actor.userId, "COMMENT_STATUS", { letterId: l.row.id, seasonId: l.row.seasonId }, { commentId, ...change });
    await notify(tx, [comment.authorId, ...(reopening ? advisorsOf(l.input.people) : [])], "COMMENT_STATUS", l.row.id, actor.userId, { commentId, status: change.to });
    await afterChange(tx, l.row.id, ab.flow, actor.userId);
  });
}
