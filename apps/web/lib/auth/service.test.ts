// Integration test against a real PostgreSQL (DATABASE_URL). Skipped when none is reachable.
import { closeDb, getDb, hashPassword, schema } from "@al/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { allowLoginAttempt, resetLoginThrottle } from "./throttle";
import { getSessionUser, LOCK_MS, loginWithPassword, MAX_FAILED_LOGINS, revokeSession } from "./service";

const email = `auth-test-${process.pid}@example.test`;
const PASSWORD = "correct horse battery";
let dbUp = false;

const row = () => getDb().query.users.findFirst({ where: eq(schema.users.email, email) });

beforeAll(async () => {
  try {
    await getDb().execute("select 1");
    dbUp = true;
  } catch {
    return;
  }
  await getDb()
    .insert(schema.users)
    .values({ email, name: "בדיקה", roles: ["CONTROL_ADVISOR"], passwordHash: await hashPassword(PASSWORD) });
});

afterAll(async () => {
  if (dbUp) {
    // Users are never deleted in the app (history keeps them); the test cleans up its own rows.
    const user = await row();
    await getDb().delete(schema.auditEvents).where(eq(schema.auditEvents.actorId, user!.id));
    await getDb().delete(schema.users).where(eq(schema.users.id, user!.id));
  }
  await closeDb();
});

beforeEach(async () => {
  if (dbUp)
    await getDb()
      .update(schema.users)
      .set({ failedLogins: 0, lockedUntil: null, active: true })
      .where(eq(schema.users.email, email));
});

describe.skipIf(!process.env.DATABASE_URL)("password login", () => {
  it("opens a session with the right password, and revoking ends it", async () => {
    const ok = await loginWithPassword(`  ${email.toUpperCase()} `, PASSWORD, "test");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect((await getSessionUser(ok.token))?.email).toBe(email);
    await revokeSession(ok.token);
    expect(await getSessionUser(ok.token)).toBeNull();
  });

  it("refuses a wrong password, an unknown email and a disabled user the same way", async () => {
    expect(await loginWithPassword(email, "wrong password!", null)).toEqual({ ok: false });
    expect(await loginWithPassword("nobody@example.test", PASSWORD, null)).toEqual({ ok: false });
    await getDb().update(schema.users).set({ active: false }).where(eq(schema.users.email, email));
    expect(await loginWithPassword(email, PASSWORD, null)).toEqual({ ok: false });
  });

  it("refuses users who have no password yet", async () => {
    const noPw = `nopw-${process.pid}@example.test`;
    await getDb().insert(schema.users).values({ email: noPw, name: "בלי סיסמה", roles: [] });
    try {
      expect(await loginWithPassword(noPw, "", null)).toEqual({ ok: false });
      expect(await loginWithPassword(noPw, "anything at all", null)).toEqual({ ok: false });
    } finally {
      await getDb().delete(schema.users).where(eq(schema.users.email, noPw));
    }
  });

  it("locks the account after too many wrong tries, even for the right password", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect((await loginWithPassword(email, "nope nope nope", null)).ok).toBe(false);
    const locked = await row();
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + LOCK_MS - 60_000);
    expect((await loginWithPassword(email, PASSWORD, null)).ok).toBe(false);

    // The lock ends on its own.
    await getDb().update(schema.users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(schema.users.email, email));
    expect((await loginWithPassword(email, PASSWORD, null)).ok).toBe(true);
    expect((await row())!.failedLogins).toBe(0);
  });
});

describe("login throttle per address", () => {
  it("allows a burst, then refuses until the window passes", () => {
    resetLoginThrottle();
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(allowLoginAttempt("1.2.3.4", t0 + i)).toBe(true);
    expect(allowLoginAttempt("1.2.3.4", t0 + 100)).toBe(false);
    expect(allowLoginAttempt("5.6.7.8", t0 + 100)).toBe(true);
    expect(allowLoginAttempt("1.2.3.4", t0 + 11 * 60 * 1000)).toBe(true);
  });
});
