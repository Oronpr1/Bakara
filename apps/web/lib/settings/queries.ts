// Read side of the settings area: who is responsible for each track of a season, ready to render.
// Nothing here writes. The rules come from the core: the letter loader (people of each letter),
// flowView (what blocks it) and abilities (what the actor may change).
import { getDb, schema, type Db } from "@al/db";
import { abilities, flowView, type Actor, type FlowState, type Phase, type Role } from "@al/domain";
import { asc, eq, sql } from "drizzle-orm";
import { listUsers, type UserOption } from "../letters/queries";
import { loadLetters } from "../letters/state";

const { letterRequests, units, campuses, seasons } = schema;

/** Where the registration manager of a track comes from. */
export type ManagerSource = "TRACK" | "FACULTY" | "CAMPUS" | "ONLY_VP" | "NONE";

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
  advisor: PersonRef & { /** Still an active advisor (else she must be replaced). */ ok: boolean };
  /** The registration manager who reviews this track, when there is one. */
  manager: PersonRef | null;
  managerSource: ManagerSource;
  extras: (PersonRef & { kind: "ADVISOR" | "MANAGER" })[];
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
  campuses: string[];
  faculties: string[];
}

const ref = (people: Map<string, UserOption>, id: string): PersonRef => ({ id, name: people.get(id)?.name ?? "—" });
const holds = (u: UserOption | undefined, role: Role) => Boolean(u?.active && u.roles.includes(role));

/** Every track of the season with its people, in campus / faculty / name order. */
export async function getTrackBoard(actor: Actor, seasonId: string, db: Db = getDb()): Promise<TrackBoard> {
  const [rows, people, unitRows, campusRows] = await Promise.all([
    db
      .select()
      .from(letterRequests)
      .where(eq(letterRequests.seasonId, seasonId))
      .orderBy(asc(letterRequests.campus), asc(letterRequests.faculty), asc(letterRequests.trackName)),
    listUsers(db),
    db.select().from(units),
    db.select().from(campuses).orderBy(asc(campuses.name)),
  ]);
  const loaded = await loadLetters(db, rows);
  const byId = new Map(people.map((u) => [u.id, u]));
  const unitOf = new Map(unitRows.map((u) => [`${u.campus}\u0000${u.faculty}`, u]));
  const campusOf = new Map(campusRows.map((c) => [c.name, c]));

  const tracks = loaded.map(({ row, input }): TrackAssignment => {
    const unit = unitOf.get(`${row.campus}\u0000${row.faculty}`);
    const campus = campusOf.get(row.campus);
    // The same order the letter loader uses: the track's own, else the faculty's, else the campus's.
    const mainId = row.registrationManagerId ?? unit?.registrationManagerId ?? campus?.registrationManagerId ?? null;
    const source: ManagerSource = input.people.onlyVp
      ? "ONLY_VP"
      : row.registrationManagerId
        ? "TRACK"
        : unit?.registrationManagerId
          ? "FACULTY"
          : campus?.registrationManagerId
            ? "CAMPUS"
            : "NONE";
    const extras = [
      ...input.people.extraAdvisorIds.map((id) => ({ ...ref(byId, id), kind: "ADVISOR" as const })),
      ...input.people.rmIds.slice(mainId ? 1 : 0).map((id) => ({ ...ref(byId, id), kind: "MANAGER" as const })),
    ];
    const advisorOk = holds(byId.get(row.advisorId), "CONTROL_ADVISOR");
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
      advisor: { ...ref(byId, row.advisorId), ok: advisorOk },
      manager: mainId && source !== "ONLY_VP" ? ref(byId, mainId) : null,
      managerSource: source,
      extras,
      missingAdvisor: !advisorOk && !input.people.extraAdvisorIds.some((id) => holds(byId.get(id), "CONTROL_ADVISOR")),
      missingManager: asDraft.blockers.includes("NO_REGISTRATION_MANAGER"),
      canChangeAdvisor: abilities(actor, input).reassignAdvisor,
    };
  });

  const opt = (role: Role) => people.filter((u) => holds(u, role)).map((u) => ({ id: u.id, name: u.name }));
  return {
    tracks,
    advisors: opt("CONTROL_ADVISOR"),
    managers: opt("REGISTRATION_MANAGER"),
    campuses: [...new Set([...campusRows.map((c) => c.name), ...rows.map((r) => r.campus)])].sort((a, b) => a.localeCompare(b, "he")),
    faculties: [...new Set([...unitRows.map((u) => u.faculty), ...rows.map((r) => r.faculty)])].sort((a, b) => a.localeCompare(b, "he")),
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
    at(t.advisor.id).advisor++;
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
