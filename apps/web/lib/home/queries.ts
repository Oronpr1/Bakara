import "server-only";
// What the home screen reads. The letters, the "who holds it" and the tower come ready from
// lib/letters/queries.ts (getHome); this file only adds what the home list needs on top: who the
// registration managers of each letter are (for filtering), and what the actor may do in bulk.
import { getDb, schema, type Db } from "@al/db";
import { abilities, type Actor } from "@al/domain";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getHome, listUsers, type Home } from "../letters/queries";
import { loadLetters } from "../letters/state";
import type { HomeLetter } from "./model";

const { letterRequests, comments } = schema;

export interface HomeView {
  season: Home["season"];
  tower: Home["tower"];
  letters: HomeLetter[];
}

/** Unpublished comments the actor wrote, per letter. */
async function draftCounts(db: Db, actor: Actor, letterIds: string[]) {
  if (letterIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ letterId: comments.letterId, n: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(inArray(comments.letterId, letterIds), eq(comments.authorId, actor.userId), isNull(comments.publishedAt)))
    .groupBy(comments.letterId);
  return new Map(rows.map((r) => [r.letterId, r.n]));
}

/**
 * The people and bulk abilities of letters, computed by the core rules (abilities) from the same
 * input the flow uses. Only for the given letter ids.
 */
export async function letterExtras(actor: Actor, letterIds: string[], db: Db = getDb()) {
  const out = new Map<
    string,
    { rmIds: string[]; advisorIds: string[]; canRemind: boolean; canFinal: boolean; finalOnBehalfOf: string | null; myDrafts: number; openComments: number }
  >();
  if (letterIds.length === 0) return out;
  const rows = await db.select().from(letterRequests).where(inArray(letterRequests.id, letterIds));
  const [loaded, drafts] = await Promise.all([loadLetters(db, rows), draftCounts(db, actor, letterIds)]);
  for (const l of loaded) {
    const can = abilities(actor, l.input);
    const final = can.decide.find((s) => s.seat === "FINAL");
    out.set(l.row.id, {
      rmIds: [...l.input.people.rmIds],
      advisorIds: [l.input.people.advisorId, ...l.input.people.extraAdvisorIds],
      canRemind: can.remind,
      canFinal: Boolean(final),
      finalOnBehalfOf: final?.onBehalfOf ?? null,
      myDrafts: drafts.get(l.row.id) ?? 0,
      openComments: l.input.openComments,
    });
  }
  return out;
}

/** Everything the home screen shows for one season, for this person. */
export async function getHomeView(actor: Actor, seasonId: string, db: Db = getDb()): Promise<HomeView> {
  const home = await getHome(actor, seasonId, db);
  const [extras, people] = await Promise.all([letterExtras(actor, home.all.map((l) => l.id), db), listUsers(db)]);
  const names = new Map(people.map((u) => [u.id, u.name]));
  const letters: HomeLetter[] = home.all.map((l) => {
    const x = extras.get(l.id);
    const rmIds = x?.rmIds ?? [];
    return {
      ...l,
      rmIds,
      rmNames: rmIds.map((id) => names.get(id) ?? "—"),
      advisorIds: x?.advisorIds ?? [l.advisorId],
      canRemind: x?.canRemind ?? false,
      canFinal: x?.canFinal ?? false,
      finalOnBehalfOf: x?.finalOnBehalfOf ? (names.get(x.finalOnBehalfOf) ?? null) : null,
      myDrafts: x?.myDrafts ?? 0,
    };
  });
  return { season: home.season, tower: home.tower, letters };
}
