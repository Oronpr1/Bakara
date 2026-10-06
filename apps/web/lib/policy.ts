// The control manager's rules, kept in the database and applied to the process the web app runs.
import { getDb, schema, type Db } from "@al/db";
import {
  CAPABILITIES,
  canGlobal,
  getPolicy,
  ROLES,
  setPolicy,
  type Actor,
  type CapabilityKey,
  type Policy,
  type Role,
} from "@al/domain";

import { AppError, forbidden } from "./errors";
import { audit } from "./notify";

const { rules } = schema;
const REFRESH_MS = 20_000;
let loadedAt = 0;

/** Reads the rules from the database (at most every 20 seconds) into the running process. */
export async function ensurePolicy(db: Db = getDb()): Promise<void> {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  const rows = await db.select().from(rules);
  setPolicy(Object.fromEntries(rows.map((r) => [r.capability, r.roles])) as Partial<Record<CapabilityKey, Role[]>>);
  loadedAt = Date.now();
}

/** Saves the roles for each capability given. Roles not listed lose the right. */
export async function savePolicy(actor: Actor, change: Partial<Record<CapabilityKey, readonly Role[]>>, db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_RULES")) throw forbidden();
  const known = new Set<string>(CAPABILITIES.map((c) => c.key));
  for (const [key, roles] of Object.entries(change)) {
    if (!known.has(key)) throw new AppError("INVALID", "כלל לא מוכר");
    if (roles && roles.some((r) => !(ROLES as readonly string[]).includes(r))) throw new AppError("INVALID", "תפקיד לא מוכר");
  }
  await db.transaction(async (tx) => {
    for (const [key, roles] of Object.entries(change)) {
      if (!roles) continue;
      await tx
        .insert(rules)
        .values({ capability: key, roles: [...new Set(roles)], updatedBy: actor.userId })
        .onConflictDoUpdate({ target: rules.capability, set: { roles: [...new Set(roles)], updatedBy: actor.userId, updatedAt: new Date() } });
    }
    await audit(tx, actor.userId, "RULES_SAVED", {}, { change });
  });
  loadedAt = 0;
  await ensurePolicy(db);
}

/** Back to the rules the process started with. */
export async function resetPolicy(actor: Actor, db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_RULES")) throw forbidden();
  await db.transaction(async (tx) => {
    await tx.delete(rules);
    await audit(tx, actor.userId, "RULES_RESET", {});
  });
  loadedAt = 0;
  await ensurePolicy(db);
}

export const currentPolicy = (): Policy => getPolicy();

