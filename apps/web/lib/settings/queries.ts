// Read side of the settings area: who is responsible for each track of a season, ready to render.
// Nothing here writes. The rules come from the core: the letter loader (people of each letter),
// flowView (what blocks it) and abilities (what the actor may change).
import { getDb, schema, type Db } from "@al/db";
import { abilities, flowView, type Actor, type FlowState, type Phase, type Role } from "@al/domain";
import { asc, eq, sql } from "drizzle-orm";
import { listUsers, type UserOption } from "../letters/queries";
import { loadLetters } from "../letters/state";

const { letterRequests, seasons } = schema;

export interface PersonRef {
  id: string;
  name: string;
}

export interface TrackAssignment {
  id: string;
  campus: string;
  faculty: string;
  trackName: string;
  trackNumber: string;
  phase: Phase;
  state: FlowState;
  /** The track's own advisor; null until assigned (or when she is no longer an active advisor). */
  advisor: PersonRef | null;
  /** The track's registration manager; null until assigned. */
  manager: PersonRef | null;
  /** More advisors, and the commenters attached to the track. */
  extras: (PersonRef & { kind: "ADVISOR" | "COMMENTER" })[];
  /** Nobody can prepare the letter: it cannot move until an advisor is assigned. */
  missingAdvisor: boolean;
  /** Nobody can review in the registration manager's place: the letter cannot be sent to review. */
  missingManager: boolean;
  /** The actor may replace the main advisor of this track. */
  canChangeAdvisor: boolean;
}

export interface TrackBoard {
  tracks: TrackAssignment[];
  advisors: PersonRef[];
  managers: PersonRef[];
  /** Every active person, for attaching a commenter. */
  everyone: PersonRef[];
  campuses: string[];
  faculties: string[];
}

const ref = (people: Map<string, UserOption>, id: string): PersonRef => ({ id, name: people.get(id)?.name ?? "—" });
const holds = (u: UserOption | undefined, role: Role) => Boolean(u?.active && u.roles.includes(role));

/** Every track of the season with its people, in campus / faculty / name order. */
export async function getTrackBoard(actor: Actor, seasonId: string, db: Db = getDb()): Promise<TrackBoard> {
  const [rows, people, known] = await Promise.all([
    db
      .select()
      .from(letterRequests)
      .where(eq(letterRequests.seasonId, seasonId))
      .orderBy(asc(letterRequests.campus), asc(letterRequests.faculty), asc(letterRequests.trackName)),
    listUsers(db),
    // Campuses and faculties are whatever the tracks of any season say; there is no separate list to keep.
    db.selectDistinct({ campus: letterRequests.campus, faculty: letterRequests.faculty }).from(letterRequests),
  ]);
  const loaded = await loadLetters(db, rows);
  const byId = new Map(people.map((u) => [u.id, u]));

  const tracks = loaded.map(({ row, input }): TrackAssignment => {
    const mainManager = row.registrationManagerId;
    const extras = [
      ...input.people.extraAdvisorIds.map((id) => ({ ...ref(byId, id), kind: "ADVISOR" as const })),
      ...input.people.commenterIds.map((id) => ({ ...ref(byId, id), kind: "COMMENTER" as const })),
    ];
    const advisorOk = row.advisorId !== null && holds(byId.get(row.advisorId), "CONTROL_ADVISOR");
    const view = flowView(input);
    // Whether it could be sent to review, asked of the core as if it were a draft.
    const asDraft = flowView({ ...input, phase: "DRAFT" });
    return {
      id: row.id,
      campus: row.campus,
      faculty: row.faculty,
      trackName: row.trackName,
      trackNumber: row.trackNumber,
      phase: view.phase,
      state: view.state,
      advisor: advisorOk && row.advisorId ? ref(byId, row.advisorId) : null,
      manager: mainManager ? ref(byId, mainManager) : null,
      extras,
      missingAdvisor: !advisorOk && !input.people.extraAdvisorIds.some((id) => holds(byId.get(id), "CONTROL_ADVISOR")),
      missingManager: asDraft.blockers.includes("NO_REGISTRATION_MANAGER"),
      canChangeAdvisor: abilities(actor, input).reassignAdvisor,
    };
  });

  const opt = (role: Role) => people.filter((u) => holds(u, role)).map((u) => ({ id: u.id, name: u.name }));
  const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "he"));
  return {
    tracks,
    advisors: opt("CONTROL_ADVISOR"),
    managers: opt("REGISTRATION_MANAGER"),
    everyone: people.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })),
    campuses: sorted(known.map((k) => k.campus)),
    faculties: sorted(known.map((k) => k.faculty)),
  };
}

/** How many tracks of the season each person holds, by what they do there. */
export interface PersonLoad {
  advisor: number;
  manager: number;
  extra: number;
}

export function loadPerPerson(tracks: TrackAssignment[]): Map<string, PersonLoad> {
  const out = new Map<string, PersonLoad>();
  const at = (id: string) => out.get(id) ?? (out.set(id, { advisor: 0, manager: 0, extra: 0 }), out.get(id)!);
  for (const t of tracks) {
    if (t.advisor) at(t.advisor.id).advisor++;
    if (t.manager) at(t.manager.id).manager++;
    for (const e of t.extras) at(e.id).extra++;
  }
  return out;
}

/** One track code per season, to show what "227 ← 228" will do, and where each season came from. */
export async function seasonFacts(db: Db = getDb()) {
  const rows = await db
    .select({
      seasonId: letterRequests.seasonId,
      sample: sql<string>`min(${letterRequests.trackNumber})`,
    })
    .from(letterRequests)
    .groupBy(letterRequests.seasonId);
  const names = new Map((await db.select({ id: seasons.id, name: seasons.name }).from(seasons)).map((s) => [s.id, s.name]));
  return { sampleCode: new Map(rows.map((r) => [r.seasonId, r.sample])), seasonName: names };
}
