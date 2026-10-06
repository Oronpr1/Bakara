import { schema, type Db } from "@al/db";
import type { Decision, FlowInput, FlowSettings } from "@al/domain";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound } from "../errors";

const { letterRequests, seasons, units, campuses, users, letterAcademics, letterPeople, reviews, comments } = schema;

/** A transaction or the database; both expose the same query API. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

export type LetterRow = typeof letterRequests.$inferSelect;
export type SeasonRow = typeof seasons.$inferSelect;

export interface LoadedLetter {
  row: LetterRow;
  season: SeasonRow;
  input: FlowInput;
}

/** The people with a role on the whole system: the VP(s) and the control manager(s). */
export async function systemPeople(tx: Tx): Promise<{ vpIds: string[]; controlIds: string[] }> {
  const rows = await tx.select({ id: users.id, roles: users.roles }).from(users).where(eq(users.active, true));
  return {
    vpIds: rows.filter((u) => u.roles.includes("VP_REGISTRATION")).map((u) => u.id),
    controlIds: rows.filter((u) => u.roles.includes("CONTROL_MANAGER")).map((u) => u.id),
  };
}

export const settingsOf = (season: Pick<SeasonRow, "sequentialReview" | "controlReview">): FlowSettings => ({
  sequential: season.sequentialReview,
  controlReview: season.controlReview,
});

/**
 * Loads one letter and everything the flow rules need. With `lock`, the letter row is locked for
 * the rest of the transaction so concurrent actions on it run one at a time.
 */
export async function loadLetter(tx: Tx, letterId: string, opts: { lock?: boolean } = {}): Promise<LoadedLetter> {
  const q = tx.select().from(letterRequests).where(eq(letterRequests.id, letterId));
  const [row] = opts.lock ? await q.for("update") : await q;
  if (!row) throw notFound();
  const [loaded] = await buildInputs(tx, [row]);
  return loaded!;
}

/** The same for many letters, in a handful of queries (lists and dashboards). */
export async function loadLetters(tx: Tx, rows: LetterRow[]): Promise<LoadedLetter[]> {
  return buildInputs(tx, rows);
}

async function buildInputs(tx: Tx, rows: LetterRow[]): Promise<LoadedLetter[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const seasonIds = [...new Set(rows.map((r) => r.seasonId))];
  // One after another: a transaction has a single connection, and pg warns about overlapping queries on it.
  const seasonRows = await tx.select().from(seasons).where(inArray(seasons.id, seasonIds));
  const unitRows = await tx.select().from(units);
  const campusRows = await tx.select().from(campuses);
  const system = await systemPeople(tx);
  const academicRows = await tx.select().from(letterAcademics).where(and(inArray(letterAcademics.letterId, ids), isNull(letterAcademics.removedAt)));
  const extraRows = await tx.select().from(letterPeople).where(inArray(letterPeople.letterId, ids));
  const reviewRows = await tx.select().from(reviews).where(inArray(reviews.letterId, ids)).orderBy(asc(reviews.createdAt));
  const commentRows = await tx
    .select({ letterId: comments.letterId, n: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(inArray(comments.letterId, ids), sql`${comments.publishedAt} is not null`, inArray(comments.status, ["OPEN", "NEEDS_CLARIFICATION"])))
    .groupBy(comments.letterId);

  const seasonOf = new Map(seasonRows.map((s) => [s.id, s]));
  const unitOf = new Map(unitRows.map((u) => [`${u.campus}\u0000${u.faculty}`, u]));
  const campusOf = new Map(campusRows.map((c) => [c.name, c]));
  const openOf = new Map(commentRows.map((c) => [c.letterId, c.n]));

  return rows.map((row) => {
    const season = seasonOf.get(row.seasonId)!;
    const unit = unitOf.get(`${row.campus}\u0000${row.faculty}`);
    const campus = campusOf.get(row.campus);
    const rm = row.registrationManagerId ?? unit?.registrationManagerId ?? campus?.registrationManagerId ?? null;
    const decisions: Decision[] = reviewRows
      .filter((r) => r.letterId === row.id)
      .map((r) => ({
        seat: r.seat as Decision["seat"],
        kind: r.kind,
        userId: r.userId,
        onBehalfOf: r.onBehalfOf,
        versionNumber: r.versionNumber,
        note: r.note,
        at: r.createdAt,
      }));
    const extra = extraRows.filter((e) => e.letterId === row.id);
    const input: FlowInput = {
      phase: row.phase,
      latestVersion: row.latestVersion,
      settings: settingsOf(season),
      people: {
        advisorId: row.advisorId,
        extraAdvisorIds: extra.filter((e) => e.kind === "ADVISOR").map((e) => e.userId),
        rmIds: [...(rm ? [rm] : []), ...extra.filter((e) => e.kind === "MANAGER").map((e) => e.userId)],
        onlyVp: Boolean(unit?.onlyVp || (campus?.onlyVp && !unit?.registrationManagerId)) && !row.registrationManagerId,
        vpIds: system.vpIds,
        controlIds: system.controlIds,
      },
      academics: academicRows.filter((a) => a.letterId === row.id).map((a) => a.userId),
      decisions,
      openComments: openOf.get(row.id) ?? 0,
      advisorHold: row.advisorHold,
      inGilboa: Boolean(row.inGilboaAt),
    };
    return { row, season, input };
  });
}
