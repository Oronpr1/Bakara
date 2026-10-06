import { getDb, schema, type Db } from "@al/db";
import { canGlobal, type Actor } from "@al/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { AppError, forbidden } from "../errors";
import { audit } from "../notify";

const { units, campuses, users } = schema;

export interface UnitRow {
  id: string;
  campus: string;
  faculty: string;
  registrationManagerId: string | null;
  advisorId: string | null;
  /** "Only the VP reviews here": no registration manager is needed. */
  onlyVp: boolean;
  /** What actually applies: the faculty's own setting, else the campus's. */
  effectiveManagerId: string | null;
  effectiveAdvisorId: string | null;
  letterCount: number;
}

export interface CampusRow {
  id: string;
  name: string;
  registrationManagerId: string | null;
  advisorId: string | null;
  onlyVp: boolean;
  units: UnitRow[];
}

/** Every campus with its faculties, as set up so far. */
export async function listCampuses(db: Db = getDb()): Promise<CampusRow[]> {
  const [campusRows, unitRows] = await Promise.all([
    db.select().from(campuses).orderBy(asc(campuses.name)),
    db
      .select({
        unit: units,
        letterCount: sql<number>`(select count(*)::int from "letter_requests" lr where lr."campus" = "units"."campus" and lr."faculty" = "units"."faculty")`,
      })
      .from(units)
      .orderBy(asc(units.faculty)),
  ]);
  return campusRows.map((c) => ({
    id: c.id,
    name: c.name,
    registrationManagerId: c.registrationManagerId,
    advisorId: c.advisorId,
    onlyVp: c.onlyVp,
    units: unitRows
      .filter((u) => u.unit.campus === c.name)
      .map(({ unit, letterCount }) => ({
        id: unit.id,
        campus: unit.campus,
        faculty: unit.faculty,
        registrationManagerId: unit.registrationManagerId,
        advisorId: unit.advisorId,
        onlyVp: unit.onlyVp,
        effectiveManagerId: unit.registrationManagerId ?? c.registrationManagerId,
        effectiveAdvisorId: unit.advisorId ?? c.advisorId,
        letterCount,
      })),
  }));
}

export interface DefaultsChange {
  /** undefined = leave as is; null = clear (the campus's setting applies again). */
  registrationManagerId?: string | null;
  advisorId?: string | null;
  onlyVp?: boolean;
}

async function assertPeople(db: Db, change: DefaultsChange) {
  const check = async (id: string | null | undefined, role: "REGISTRATION_MANAGER" | "CONTROL_ADVISOR", what: string) => {
    if (!id) return;
    const u = await db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.active, true)) });
    if (!u?.roles.includes(role)) throw new AppError("INVALID", `המשתמש שנבחר אינו ${what} פעיל`);
  };
  await check(change.registrationManagerId, "REGISTRATION_MANAGER", "מנהל רישום");
  await check(change.advisorId, "CONTROL_ADVISOR", "יועצת בקרה");
}

function patch(change: DefaultsChange) {
  const set: { registrationManagerId?: string | null; advisorId?: string | null; onlyVp?: boolean } = {};
  if (change.registrationManagerId !== undefined) set.registrationManagerId = change.registrationManagerId;
  if (change.advisorId !== undefined) set.advisorId = change.advisorId;
  if (change.onlyVp !== undefined) set.onlyVp = change.onlyVp;
  return set;
}

export async function setCampusDefaults(actor: Actor, campusId: string, change: DefaultsChange, db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const campus = await db.query.campuses.findFirst({ where: eq(campuses.id, campusId) });
  if (!campus) throw new AppError("NOT_FOUND", "הקמפוס לא נמצא");
  await assertPeople(db, change);
  await db.transaction(async (tx) => {
    await tx.update(campuses).set(patch(change)).where(eq(campuses.id, campusId));
    await audit(tx, actor.userId, "CAMPUS_DEFAULTS_SET", {}, { campus: campus.name, ...change });
  });
}

export async function setUnitDefaults(actor: Actor, unitId: string, change: DefaultsChange, db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const unit = await db.query.units.findFirst({ where: eq(units.id, unitId) });
  if (!unit) throw new AppError("NOT_FOUND", "הפקולטה לא נמצאה");
  await assertPeople(db, change);
  await db.transaction(async (tx) => {
    await tx.update(units).set(patch(change)).where(eq(units.id, unitId));
    await audit(tx, actor.userId, "UNIT_DEFAULTS_SET", {}, { campus: unit.campus, faculty: unit.faculty, ...change });
  });
}
