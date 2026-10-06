import { getDb, schema, type Db } from "@al/db";
import { canGlobal, type Actor } from "@al/domain";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { AppError, forbidden } from "../errors";
import { audit } from "../notify";
import { replaceApprover } from "../letters/service";

const { units, users, letterRequests, seasons } = schema;

export interface UnitRow {
  id: string;
  campus: string;
  faculty: string;
  registrationManagerId: string | null;
  registrationManagerName: string | null;
  letterCount: number;
}

/** Every campus + faculty known to the system, with its registration manager. */
export async function listUnits(db: Db = getDb()): Promise<UnitRow[]> {
  const rows = await db
    .select({
      id: units.id,
      campus: units.campus,
      faculty: units.faculty,
      registrationManagerId: units.registrationManagerId,
      registrationManagerName: users.name,
      letterCount: sql<number>`(select count(*)::int from ${letterRequests} where ${letterRequests.campus} = ${units.campus} and ${letterRequests.faculty} = ${units.faculty})`,
    })
    .from(units)
    .leftJoin(users, eq(users.id, units.registrationManagerId))
    .orderBy(asc(units.campus), asc(units.faculty));
  return rows;
}

/**
 * Sets the registration manager of a campus + faculty. From now on every track in it has this
 * person, and so do its open letters (not yet approved for distribution) in active seasons.
 */
export async function setUnitRegistrationManager(
  actor: Actor,
  unitId: string,
  userId: string | null,
  db: Db = getDb(),
) {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const unit = await db.query.units.findFirst({ where: eq(units.id, unitId) });
  if (!unit) throw new AppError("NOT_FOUND", "הקמפוס והפקולטה לא נמצאו");
  if (userId) {
    const manager = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.active, true)) });
    if (!manager?.roles.includes("REGISTRATION_MANAGER"))
      throw new AppError("INVALID", "המשתמש שנבחר אינו מנהל רישום פעיל");
  }
  await db.transaction(async (tx) => {
    await tx.update(units).set({ registrationManagerId: userId }).where(eq(units.id, unitId));
    await audit(tx, actor.userId, "UNIT_MANAGER_SET", {}, { campus: unit.campus, faculty: unit.faculty, userId });
  });
  if (!userId) return;

  const open = await db
    .select({ id: letterRequests.id })
    .from(letterRequests)
    .innerJoin(seasons, eq(seasons.id, letterRequests.seasonId))
    .where(
      and(
        eq(letterRequests.campus, unit.campus),
        eq(letterRequests.faculty, unit.faculty),
        ne(letterRequests.stage, "APPROVED"),
        eq(seasons.status, "ACTIVE"),
      ),
    );
  for (const letter of open) await replaceApprover(actor, letter.id, "REGISTRATION_MANAGER", userId, db);
}

