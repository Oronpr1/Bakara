import { DUMMY_HASH, getDb, schema, verifyPassword, type Db } from "@al/db";
import type { Role } from "@al/domain";
import { and, eq, gt, sql } from "drizzle-orm";
import { keyedHash, newSessionToken, normalizeEmail } from "./crypto";

const { users, sessions, auditEvents } = schema;

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
/** Staff stay signed in on their device for a month (a link in an email must open the letter, not a login). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  /** Set for a session opened from a personal link: it only works for this letter. */
  linkLetterId?: string | null;
}

export const LINK_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Opens a session for a personal link. It carries only the academic approver role, whatever else the user is. */
export async function createLinkSession(userId: string, letterId: string, userAgent: string | null, db: Db = getDb()) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + LINK_SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: tokenHash(token), userId, expiresAt, userAgent, linkLetterId: letterId });
  return { token, expiresAt };
}

const tokenHash = (token: string) => keyedHash(token, "session");

export type LoginResult = { ok: true; token: string; expiresAt: Date } | { ok: false };

/**
 * Checks email + password and opens a session. Every failure looks the same to the caller
 * (unknown email, wrong password, disabled user, locked account), and an unknown email costs
 * the same time as a wrong password. After MAX_FAILED_LOGINS wrong passwords in a row the
 * account is locked for LOCK_MS; a correct password during the lock does not open a session.
 */
export async function loginWithPassword(
  rawEmail: string,
  password: string,
  userAgent: string | null,
  db: Db = getDb(),
): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !user.passwordHash) return { ok: false };

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) return { ok: false };

  if (!passwordOk) {
    await db
      .update(users)
      .set({
        failedLogins: sql`case when ${users.failedLogins} + 1 >= ${MAX_FAILED_LOGINS} then 0 else ${users.failedLogins} + 1 end`,
        lockedUntil: sql`case when ${users.failedLogins} + 1 >= ${MAX_FAILED_LOGINS} then ${new Date(now.getTime() + LOCK_MS)} else ${users.lockedUntil} end`,
      })
      .where(eq(users.id, user.id));
    return { ok: false };
  }

  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await tx.insert(sessions).values({ tokenHash: tokenHash(token), userId: user.id, expiresAt, userAgent });
    await tx.insert(auditEvents).values({ actorId: user.id, type: "LOGIN", data: {} });
  });
  return { ok: true, token, expiresAt };
}

export async function getSessionUser(token: string | undefined, db: Db = getDb()): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt, linkLetterId: sessions.linkLetterId, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId));
  }
  const { id, email, name, roles } = row.user;
  if (row.linkLetterId) return { id, email, name, roles: ["ACADEMIC_APPROVER"], linkLetterId: row.linkLetterId };
  return { id, email, name, roles };
}

export async function revokeSession(token: string | undefined, db: Db = getDb()): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
}
