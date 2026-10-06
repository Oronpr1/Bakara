// Read side for the screens. Mutations live in service.ts / comments.ts; nothing here writes.
import { getDb, schema, type Db } from "@al/db";
import {
  activeApprovers,
  canGlobal,
  canOnLetter,
  isOpenComment,
  openCommentCount,
  pendingApprovers,
  type Actor,
  type Approval,
  type ApproverAssignment,
  type CommentSummary,
  type LetterState,
  type Role,
} from "@al/domain";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "../errors";
import type { LetterRow } from "./state";

const { users, seasons, letterRequests, approverAssignments, approvals, comments, commentReplies, versions, auditEvents } =
  schema;

export type SeasonRow = typeof seasons.$inferSelect;
export interface UserOption {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  active: boolean;
}

/** Workflow states for many letters at once, keyed by letter id. */
async function loadStates(db: Db, rows: LetterRow[]): Promise<Map<string, LetterState>> {
  const ids = rows.map((r) => r.id);
  const parts = new Map(
    ids.map((id) => [id, { approvers: [] as ApproverAssignment[], approvals: [] as Approval[], comments: [] as CommentSummary[] }]),
  );
  if (ids.length) {
    const [assigned, given, commentRows] = await Promise.all([
      db.select().from(approverAssignments).where(inArray(approverAssignments.letterId, ids)),
      db.select().from(approvals).where(inArray(approvals.letterId, ids)),
      db
        .select({ id: comments.id, letterId: comments.letterId, authorId: comments.authorId, status: comments.status })
        .from(comments)
        .where(inArray(comments.letterId, ids)),
    ]);
    for (const a of assigned)
      parts.get(a.letterId)!.approvers.push({ userId: a.userId, slot: a.slot, removedAt: a.removedAt });
    for (const a of given)
      parts
        .get(a.letterId)!
        .approvals.push({ userId: a.userId, slot: a.slot, versionNumber: a.versionNumber, at: a.createdAt });
    for (const c of commentRows) parts.get(c.letterId)!.comments.push({ id: c.id, authorId: c.authorId, status: c.status });
  }
  return new Map(
    rows.map((r) => [r.id, { stage: r.stage, advisorId: r.advisorId, latestVersion: r.latestVersion, ...parts.get(r.id)! }]),
  );
}

export async function listUsers(db: Db = getDb()): Promise<UserOption[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, roles: users.roles, active: users.active })
    .from(users)
    .orderBy(asc(users.name));
}

export const usersWithRole = (all: UserOption[], role: Role) => all.filter((u) => u.active && u.roles.includes(role));

// ---------------------------------------------------------------- seasons

export async function listSeasons(db: Db = getDb()) {
  const [rows, counts] = await Promise.all([
    db.select().from(seasons).orderBy(desc(seasons.createdAt)),
    db
      .select({ seasonId: letterRequests.seasonId, n: sql<number>`count(*)::int` })
      .from(letterRequests)
      .groupBy(letterRequests.seasonId),
  ]);
  const bySeason = new Map(counts.map((c) => [c.seasonId, c.n]));
  return rows.map((s) => ({ ...s, letterCount: bySeason.get(s.id) ?? 0 }));
}

export async function getSeason(seasonId: string, db: Db = getDb()) {
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season) throw notFound();
  return season;
}

// ---------------------------------------------------------------- letter lists

/** Who the letter is waiting on right now, as display text. */
export function waitingOn(state: LetterState, names: Map<string, string>): string {
  const name = (id: string) => names.get(id) ?? "—";
  switch (state.stage) {
    case "DRAFT":
      return name(state.advisorId);
    case "INITIAL_REVIEW":
    case "FINAL_REVIEW":
      return "מנהלת הבקרה";
    case "APPROVED":
      return "—";
    default: {
      const pending = pendingApprovers(state);
      if (pending.length) return pending.map((a) => name(a.userId)).join(", ");
      return openCommentCount(state) ? `${name(state.advisorId)} (הערות פתוחות)` : "—";
    }
  }
}

export interface LetterListItem {
  row: LetterRow;
  state: LetterState;
  advisorName: string;
  openComments: number;
  waitingOn: string;
  overdue: boolean;
}

export function isOverdue(row: Pick<LetterRow, "dueDate" | "stage">, today = new Date()) {
  if (!row.dueDate || row.stage === "APPROVED") return false;
  return row.dueDate < today.toISOString().slice(0, 10);
}

async function listItems(actor: Actor, rows: LetterRow[], db: Db): Promise<LetterListItem[]> {
  const [states, all] = await Promise.all([loadStates(db, rows), listUsers(db)]);
  const names = new Map(all.map((u) => [u.id, u.name]));
  return rows
    .filter((r) => canOnLetter(actor, "VIEW", states.get(r.id)!))
    .map((row) => {
      const state = states.get(row.id)!;
      return {
        row,
        state,
        advisorName: names.get(row.advisorId) ?? "—",
        openComments: openCommentCount(state),
        waitingOn: waitingOn(state, names),
        overdue: isOverdue(row),
      };
    });
}

/** The season's letters the actor may see. */
export async function listSeasonLetters(actor: Actor, seasonId: string, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(letterRequests)
    .where(eq(letterRequests.seasonId, seasonId))
    .orderBy(asc(letterRequests.campus), asc(letterRequests.faculty), asc(letterRequests.trackName));
  return listItems(actor, rows, db);
}

export type QueueReason = "APPROVE" | "INITIAL_REVIEW" | "FINAL_REVIEW" | "DRAFT" | "OPEN_COMMENTS" | "CHOOSE_ACADEMIC";

export const QUEUE_REASON_LABELS: Record<QueueReason, string> = {
  APPROVE: "ממתין לאישורך",
  INITIAL_REVIEW: "ממתין לבדיקה ראשונית",
  FINAL_REVIEW: "ממתין לאישור סופי",
  DRAFT: "בהכנה: להעלות גרסה ולשלוח לבדיקה",
  OPEN_COMMENTS: "יש הערות לטיפול",
  CHOOSE_ACADEMIC: "צריך לבחור גורם אקדמי",
};

/** Why this letter is in the actor's work queue, or null when it is not. */
export function queueReason(actor: Actor, state: LetterState): QueueReason | null {
  if (canOnLetter(actor, "APPROVE", state)) return "APPROVE";
  if (canOnLetter(actor, "INITIAL_APPROVE", state)) return "INITIAL_REVIEW";
  if (canOnLetter(actor, "FINAL_APPROVE", state)) return "FINAL_REVIEW";
  if (
    state.stage === "ACADEMIC_ROUND" &&
    activeApprovers(state, ["ACADEMIC"]).length === 0 &&
    canOnLetter(actor, "SET_ACADEMIC_APPROVERS", state)
  )
    return "CHOOSE_ACADEMIC";
  if (state.advisorId === actor.userId && state.stage !== "APPROVED") {
    if (state.stage === "DRAFT") return "DRAFT";
    if (state.comments.some((c) => isOpenComment(c.status))) return "OPEN_COMMENTS";
  }
  return null;
}

/** Letters in active seasons that wait for the actor, grouped by season (newest first). */
export async function workQueue(actor: Actor, seasonId?: string, db: Db = getDb()) {
  const rows = await db
    .select({ letter: letterRequests, season: seasons })
    .from(letterRequests)
    .innerJoin(seasons, eq(seasons.id, letterRequests.seasonId))
    .where(seasonId ? eq(seasons.id, seasonId) : eq(seasons.status, "ACTIVE"))
    .orderBy(desc(seasons.createdAt), asc(letterRequests.dueDate), asc(letterRequests.trackName));
  const items = await listItems(
    actor,
    rows.map((r) => r.letter),
    db,
  );
  const seasonOf = new Map(rows.map((r) => [r.letter.id, r.season]));
  const groups = new Map<string, { season: SeasonRow; items: (LetterListItem & { reason: QueueReason })[] }>();
  for (const item of items) {
    const reason = queueReason(actor, item.state);
    if (!reason) continue;
    const season = seasonOf.get(item.row.id)!;
    if (!groups.has(season.id)) groups.set(season.id, { season, items: [] });
    groups.get(season.id)!.items.push({ ...item, reason });
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- one letter

export async function getLetterDetail(actor: Actor, letterId: string, db: Db = getDb()) {
  const [row] = await db.select().from(letterRequests).where(eq(letterRequests.id, letterId));
  if (!row) throw notFound();
  const state = (await loadStates(db, [row])).get(row.id)!;
  // Hide the letter's existence from people who may not see it.
  if (!canOnLetter(actor, "VIEW", state)) throw notFound();

  const [season, people, assigned, given, versionRows, commentRows, replyRows, history] = await Promise.all([
    getSeason(row.seasonId, db),
    listUsers(db),
    db
      .select()
      .from(approverAssignments)
      .where(eq(approverAssignments.letterId, letterId))
      .orderBy(asc(approverAssignments.assignedAt)),
    db.select().from(approvals).where(eq(approvals.letterId, letterId)),
    db.select().from(versions).where(eq(versions.letterId, letterId)).orderBy(desc(versions.number)),
    db.select().from(comments).where(eq(comments.letterId, letterId)).orderBy(asc(comments.createdAt)),
    db
      .select({ reply: commentReplies })
      .from(commentReplies)
      .innerJoin(comments, eq(comments.id, commentReplies.commentId))
      .where(eq(comments.letterId, letterId))
      .orderBy(asc(commentReplies.createdAt)),
    db.select().from(auditEvents).where(eq(auditEvents.letterId, letterId)).orderBy(desc(auditEvents.at)).limit(500),
  ]);

  const replies = new Map<string, (typeof replyRows)[number]["reply"][]>();
  for (const { reply } of replyRows) replies.set(reply.commentId, [...(replies.get(reply.commentId) ?? []), reply]);

  return {
    row,
    state,
    season,
    people,
    names: new Map(people.map((u) => [u.id, u.name])),
    assignments: assigned,
    approvals: given,
    versions: versionRows,
    comments: commentRows.map((c) => ({ ...c, replies: replies.get(c.id) ?? [] })),
    history,
  };
}

export type LetterDetail = Awaited<ReturnType<typeof getLetterDetail>>;

/** Loads what a download needs and checks the actor may see the letter. */
export async function letterForFile(actor: Actor, letterId: string, db: Db = getDb()) {
  const [row] = await db.select().from(letterRequests).where(eq(letterRequests.id, letterId));
  if (!row) throw notFound();
  const state = (await loadStates(db, [row])).get(row.id)!;
  if (!canOnLetter(actor, "VIEW", state)) throw notFound();
  return row;
}

export const canSeeAllLetters = (actor: Actor) => canGlobal(actor, "VIEW_ALL_LETTERS");
