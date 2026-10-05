import { getDb, hashPassword, passwordProblem, schema, type Db } from "@al/db";
import { canGlobal, ROLES, type Actor, type Role } from "@al/domain";
import { eq } from "drizzle-orm";
import { normalizeEmail } from "../auth/crypto";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../notify";

const { users, sessions } = schema;

function ensure(actor: Actor) {
  if (!canGlobal(actor, "MANAGE_USERS")) throw forbidden();
}

function cleanRoles(roles: readonly string[]): Role[] {
  const set = [...new Set(roles)];
  if (set.some((r) => !(ROLES as readonly string[]).includes(r))) throw new AppError("INVALID", "תפקיד לא מוכר");
  return set as Role[];
}

/** Would the actor lose the right to manage users with these roles? */
const locksSelfOut = (actor: Actor, userId: string, roles: Role[]) =>
  actor.userId === userId && !canGlobal({ userId, roles }, "MANAGE_USERS");

export async function createUser(
  actor: Actor,
  input: { name: string; email: string; roles: readonly string[]; password: string },
  db: Db = getDb(),
) {
  ensure(actor);
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name) throw new AppError("INVALID", "צריך למלא שם");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("INVALID", "כתובת המייל לא תקינה");
  const roles = cleanRoles(input.roles);
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError("INVALID", problem);
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name, email, roles, passwordHash, passwordSetAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (!user) throw new AppError("CONFLICT", "כבר יש משתמש עם המייל הזה");
    await audit(tx, actor.userId, "USER_CREATED", {}, { userId: user.id, email, roles });
    return user;
  });
}

export async function setUserRoles(actor: Actor, userId: string, rawRoles: readonly string[], db: Db = getDb()) {
  ensure(actor);
  const roles = cleanRoles(rawRoles);
  if (locksSelfOut(actor, userId, roles))
    throw new AppError("INVALID", "אי אפשר להסיר מעצמך את ההרשאה לנהל משתמשים");
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ roles: users.roles }).from(users).where(eq(users.id, userId)).for("update");
    if (!before) throw notFound();
    await tx.update(users).set({ roles }).where(eq(users.id, userId));
    await audit(tx, actor.userId, "USER_ROLES_SET", {}, { userId, from: before.roles, to: roles });
  });
}

/** Users are never deleted: a deactivated user cannot sign in, and their history stays. */
export async function setUserActive(actor: Actor, userId: string, active: boolean, db: Db = getDb()) {
  ensure(actor);
  if (!active && actor.userId === userId) throw new AppError("INVALID", "אי אפשר להשבית את המשתמש שלך");
  await db.transaction(async (tx) => {
    const updated = await tx.update(users).set({ active }).where(eq(users.id, userId)).returning({ id: users.id });
    if (updated.length === 0) throw notFound();
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, actor.userId, active ? "USER_REACTIVATED" : "USER_DEACTIVATED", {}, { userId });
  });
}

/**
 * The control manager sets (or replaces) a user's password. The user's open sessions end and
 * a lock from too many wrong tries is cleared. The password itself is never stored or logged.
 */
export async function setUserPassword(actor: Actor, userId: string, password: string, db: Db = getDb()) {
  ensure(actor);
  const problem = passwordProblem(password);
  if (problem) throw new AppError("INVALID", problem);
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, passwordSetAt: new Date(), failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updated.length === 0) throw notFound();
    if (actor.userId !== userId) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, actor.userId, "USER_PASSWORD_SET", {}, { userId });
  });
}
