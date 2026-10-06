import { schema, type Db } from "@al/db";
import { and, eq } from "drizzle-orm";

const { units, campuses } = schema;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/** Registers the campus and the campus + faculty, if new. Safe to call again. */
export async function ensureUnit(db: Executor, campus: string, faculty: string) {
  await db.insert(campuses).values({ name: campus }).onConflictDoNothing();
  await db.insert(units).values({ campus, faculty }).onConflictDoNothing();
}

export interface UnitDefaults {
  registrationManagerId: string | null;
  advisorId: string | null;
}

/**
 * Who is responsible for a campus + faculty: what is set on the faculty itself, else what is
 * set on its campus (a small campus has one registration manager for every faculty).
 */
export async function resolveDefaults(db: Executor, campus: string, faculty: string): Promise<UnitDefaults> {
  const [unit] = await db.select().from(units).where(and(eq(units.campus, campus), eq(units.faculty, faculty)));
  const [camp] = await db.select().from(campuses).where(eq(campuses.name, campus));
  return {
    registrationManagerId: unit?.registrationManagerId ?? camp?.registrationManagerId ?? null,
    advisorId: unit?.advisorId ?? camp?.advisorId ?? null,
  };
}
