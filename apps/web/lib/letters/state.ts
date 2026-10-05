import { schema, type Db } from "@al/db";
import type { LetterState } from "@al/domain";
import { eq } from "drizzle-orm";
import { notFound } from "../errors";

const { letterRequests, approverAssignments, approvals, comments } = schema;

/** A transaction or the database; both expose the same query API. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

export type LetterRow = typeof letterRequests.$inferSelect;

/**
 * Loads the letter and everything the workflow rules need. With `lock`, the letter row is
 * locked for the rest of the transaction so concurrent actions on it run one at a time.
 */
export async function loadLetter(
  tx: Tx,
  letterId: string,
  opts: { lock?: boolean } = {},
): Promise<{ row: LetterRow; state: LetterState }> {
  const q = tx.select().from(letterRequests).where(eq(letterRequests.id, letterId));
  const [row] = opts.lock ? await q.for("update") : await q;
  if (!row) throw notFound();

  const [assigned, given, commentRows] = await Promise.all([
    tx.select().from(approverAssignments).where(eq(approverAssignments.letterId, letterId)),
    tx.select().from(approvals).where(eq(approvals.letterId, letterId)),
    tx
      .select({ id: comments.id, authorId: comments.authorId, status: comments.status })
      .from(comments)
      .where(eq(comments.letterId, letterId)),
  ]);

  return {
    row,
    state: {
      stage: row.stage,
      advisorId: row.advisorId,
      latestVersion: row.latestVersion,
      approvers: assigned.map((a) => ({ userId: a.userId, slot: a.slot, removedAt: a.removedAt })),
      approvals: given.map((a) => ({ userId: a.userId, slot: a.slot, versionNumber: a.versionNumber, at: a.createdAt })),
      comments: commentRows,
    },
  };
}
