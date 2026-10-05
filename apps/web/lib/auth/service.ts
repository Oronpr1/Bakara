import { getDb, schema, type Db } from "@al/db";
import type { Role } from "@al/domain";
import { and, desc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { escapeHtml, getMailer, rtlEmail } from "../mail";
import { keyedHash, newLoginCode, newSessionToken, normalizeEmail, safeEqualHex } from "./crypto";

const { users, loginCodes, sessions, auditEvents } = schema;

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_CODES_PER_IP_PER_HOUR = 30;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

const codeHash = (userId: string, code: string) => keyedHash(code, `login:${userId}`);
const tokenHash = (token: string) => keyedHash(token, "session");

/**
 * Sends a login code if the email belongs to an active user. Always resolves the same way
 * for unknown emails, so the form does not reveal who has an account.
 */
export async function requestLoginCode(rawEmail: string, ip: string | null, db: Db = getDb()): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const user = await db.query.users.findFirst({ where: and(eq(users.email, email), eq(users.active, true)) });
  if (!user) return;

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ n: perUser }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginCodes)
    .where(and(eq(loginCodes.userId, user.id), gte(loginCodes.createdAt, hourAgo)))) as [{ n: number }];
  if (perUser >= MAX_CODES_PER_HOUR) return;
  if (ip) {
    const [{ n: perIp }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginCodes)
      .where(and(eq(loginCodes.requestIp, ip), gte(loginCodes.createdAt, hourAgo)))) as [{ n: number }];
    if (perIp >= MAX_CODES_PER_IP_PER_HOUR) return;
  }

  const code = newLoginCode();
  await db.transaction(async (tx) => {
    // Only the newest code is valid.
    await tx
      .update(loginCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(loginCodes.userId, user.id), isNull(loginCodes.consumedAt)));
    await tx.insert(loginCodes).values({
      userId: user.id,
      codeHash: codeHash(user.id, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      requestIp: ip,
    });
  });

  await getMailer().send({
    to: user.email,
    subject: `קוד הכניסה שלך: ${code}`,
    text: `שלום ${user.name},\n\nקוד הכניסה למערכת מכתבי הקבלה: ${code}\nהקוד בתוקף ל-10 דקות.\n\nאם לא ביקשת קוד, אפשר להתעלם מהמייל.`,
    html: rtlEmail(
      `<p>שלום ${escapeHtml(user.name)},</p><p>קוד הכניסה למערכת מכתבי הקבלה:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p><p>הקוד בתוקף ל-10 דקות. אם לא ביקשת קוד, אפשר להתעלם מהמייל.</p>`,
    ),
  });
}

export type VerifyResult = { ok: true; token: string; expiresAt: Date } | { ok: false };

/** Checks a code and opens a session. Wrong codes count toward the attempt limit. */
export async function verifyLoginCode(
  rawEmail: string,
  code: string,
  userAgent: string | null,
  db: Db = getDb(),
): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const user = await db.query.users.findFirst({ where: and(eq(users.email, email), eq(users.active, true)) });
  if (!user) return { ok: false };

  const row = await db.query.loginCodes.findFirst({
    where: and(eq(loginCodes.userId, user.id), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, new Date())),
    orderBy: desc(loginCodes.createdAt),
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false };

  if (!safeEqualHex(row.codeHash, codeHash(user.id, code))) {
    await db
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(eq(loginCodes.id, row.id));
    return { ok: false };
  }

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.transaction(async (tx) => {
    // Consume atomically so a code cannot be used twice in a race.
    const consumed = await tx
      .update(loginCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.consumedAt)))
      .returning({ id: loginCodes.id });
    if (consumed.length === 0) throw new Error("Code already used");
    await tx.insert(sessions).values({ tokenHash: tokenHash(token), userId: user.id, expiresAt, userAgent });
    await tx.insert(auditEvents).values({ actorId: user.id, type: "LOGIN", data: {} });
  });
  return { ok: true, token, expiresAt };
}

export async function getSessionUser(token: string | undefined, db: Db = getDb()): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt, user: users })
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
  return { id, email, name, roles };
}

export async function revokeSession(token: string | undefined, db: Db = getDb()): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
}
