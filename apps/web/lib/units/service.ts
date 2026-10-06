import { getDb, schema, type Db } from "@al/db";
import { canGlobal, type Actor } from "@al/domain";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { AppError, forbidden } from "../errors";
import { audit } from "../notify";
import { replaceApprover } from "../letters/service";
import { resolveDefaults } from "./resolve";

const { units, campuses, users, letterRequests, seasons } = schema;

export interface UnitRow {
  id: string;
  campus: string;
  faculty: string;
  registrationManagerId: string | null;
  advisorId: string | null;
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
  units: UnitRow[];
}

/** Every campus with its faculties, as set up so far. */
export async function listCampuses(db: Db = getDb()): Promise<CampusRow[]> {
  const [campusRows, unitRows] = await Promise.all([
    db.select().from(campuses).orderBy(asc(campuses.name)),
    db
      .select({
        unit: units,
        letterCount: sql<number>`(select count(*)::int from ${letterRequests} where ${letterRequests.campus} = ${units.campus} and ${letterRequests.faculty} = ${units.faculty})`,
      })
      .from(units)
      .orderBy(asc(units.faculty)),
  ]);
  return campusRows.map((c) => ({
    id: c.id,
    name: c.name,
    registrationManagerId: c.registrationManagerId,
    advisorId: c.advisorId,
    units: unitRows
      .filter((u) => u.unit.campus === c.name)
      .map(({ unit, letterCount }) => ({
        id: unit.id,
        campus: unit.campus,
        faculty: unit.faculty,
        registrationManagerId: unit.registrationManagerId,
        advisorId: unit.advisorId,
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
  const set: { registrationManagerId?: string | null; advisorId?: string | null } = {};
  if (change.registrationManagerId !== undefined) set.registrationManagerId = change.registrationManagerId;
  if (change.advisorId !== undefined) set.advisorId = change.advisorId;
  return set;
}

/**
 * After a registration manager changed, every open letter (not yet approved for distribution) in
 * an active season of the affected faculties follows the person who now applies to it.
 */
async function followManagers(actor: Actor, affected: { campus: string; faculty: string }[], db: Db) {
  for (const u of affected) {
    const { registrationManagerId } = await resolveDefaults(db, u.campus, u.faculty);
    if (!registrationManagerId) continue;
    const open = await db
      .select({ id: letterRequests.id })
      .from(letterRequests)
      .innerJoin(seasons, eq(seasons.id, letterRequests.seasonId))
      .where(
        and(
          eq(letterRequests.campus, u.campus),
          eq(letterRequests.faculty, u.faculty),
          ne(letterRequests.stage, "APPROVED"),
          eq(seasons.status, "ACTIVE"),
        ),
      );
    for (const letter of open) await replaceApprover(actor, letter.id, "REGISTRATION_MANAGER", registrationManagerId, db);
  }
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
  if (change.registrationManagerId !== undefined) {
    const inCampus = await db.select().from(units).where(eq(units.campus, campus.name));
    await followManagers(actor, inCampus, db);
  }
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
  if (change.registrationManagerId !== undefined) await followManagers(actor, [unit], db);
}
