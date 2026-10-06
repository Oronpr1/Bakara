// Read side of "קמפוסים ופקולטות": every campus and faculty with who is set there, what actually
// applies, and how the season's tracks in it are doing.
import { PHASES, type Actor, type Phase } from "@al/domain";
import { listUsers } from "../letters/queries";
import { listCampuses, type CampusRow, type UnitRow } from "../units/service";
import { getTrackBoard, type PersonRef } from "./queries";

export type PhaseCounts = Record<Phase, number>;

export interface UnitView extends UnitRow {
  managerFrom: "FACULTY" | "CAMPUS" | null;
  advisorFrom: "FACULTY" | "CAMPUS" | null;
  /**
   * Only the VP reviews this faculty's tracks. The same rule the letter loader applies
   * (lib/letters/state.ts): the faculty's own switch, or the campus's when the faculty has no manager.
   */
  effectiveOnlyVp: boolean;
  /** Tracks of the current season here, and how many are in each phase. */
  tracks: number;
  phases: PhaseCounts;
  /** Of those, how many cannot be sent to review for want of a registration manager. */
  missingManager: number;
}

export interface CampusView extends Omit<CampusRow, "units"> {
  units: UnitView[];
  tracks: number;
}

const zero = (): PhaseCounts => Object.fromEntries(PHASES.map((p) => [p, 0])) as PhaseCounts;

export async function getUnitsBoard(actor: Actor, seasonId: string | null) {
  const [campuses, people, board] = await Promise.all([
    listCampuses(),
    listUsers(),
    seasonId ? getTrackBoard(actor, seasonId) : Promise.resolve(null),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const tracks = board?.tracks ?? [];

  const views: CampusView[] = campuses.map((c) => {
    const units = c.units.map((u): UnitView => {
      const mine = tracks.filter((t) => t.campus === c.name && t.faculty === u.faculty);
      const phases = zero();
      for (const t of mine) phases[t.phase]++;
      return {
        ...u,
        managerFrom: u.registrationManagerId ? "FACULTY" : c.registrationManagerId ? "CAMPUS" : null,
        advisorFrom: u.advisorId ? "FACULTY" : c.advisorId ? "CAMPUS" : null,
        effectiveOnlyVp: u.onlyVp || (c.onlyVp && !u.registrationManagerId),
        tracks: mine.length,
        phases,
        missingManager: mine.filter((t) => t.missingManager).length,
      };
    });
    // Faculties with tracks this season first.
    units.sort((a, b) => Number(b.tracks > 0) - Number(a.tracks > 0) || a.faculty.localeCompare(b.faculty, "he"));
    return { ...c, units, tracks: units.reduce((n, u) => n + u.tracks, 0) };
  });
  // Campuses with tracks this season first; the rest (set up in other seasons) after them.
  views.sort((a, b) => Number(b.tracks > 0) - Number(a.tracks > 0) || a.name.localeCompare(b.name, "he"));

  const ref = (id: string | null): PersonRef | null => (id ? { id, name: names.get(id) ?? "—" } : null);
  return {
    campuses: views,
    managers: board?.managers ?? people.filter((p) => p.active && p.roles.includes("REGISTRATION_MANAGER")).map((p) => ({ id: p.id, name: p.name })),
    advisors: board?.advisors ?? people.filter((p) => p.active && p.roles.includes("CONTROL_ADVISOR")).map((p) => ({ id: p.id, name: p.name })),
    ref,
  };
}
