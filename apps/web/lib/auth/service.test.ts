// Integration test against a real PostgreSQL (DATABASE_URL). Skipped when none is reachable.
import { closeDb, getDb, schema } from "@al/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setMailer, type MailMessage } from "../mail";
import { getSessionUser, MAX_ATTEMPTS, requestLoginCode, revokeSession, verifyLoginCode } from "./service";

const sent: MailMessage[] = [];
const email = `auth-test-${process.pid}@example.test`;
let dbUp = false;

beforeAll(async () => {
  try {
    await getDb().execute("select 1");
    dbUp = true;
  } catch {
    return;
  }
  setMailer({ send: async (m) => void sent.push(m) });
  await getDb().insert(schema.users).values({ email, name: "בדיקה", roles: ["CONTROL_ADVISOR"] });
});

afterAll(async () => {
  if (dbUp) {
    // Users are never deleted in the app (history keeps them); the test cleans up its own rows.
    const user = await getDb().query.users.findFirst({ where: eq(schema.users.email, email) });
    await getDb().delete(schema.auditEvents).where(eq(schema.auditEvents.actorId, user!.id));
    await getDb().delete(schema.users).where(eq(schema.users.id, user!.id));
  }
  await closeDb();
});

beforeEach(async () => {
  sent.length = 0;
  if (dbUp) {
    const user = await getDb().query.users.findFirst({ where: eq(schema.users.email, email) });
    await getDb().delete(schema.loginCodes).where(eq(schema.loginCodes.userId, user!.id));
  }
});

const lastCode = () => /(\d{6})/.exec(sent.at(-1)!.subject)![1]!;

describe.skipIf(!process.env.DATABASE_URL)("email code login", () => {
  it("sends a code and opens a session with it, once", async () => {
    await requestLoginCode(`  ${email.toUpperCase()} `, "10.0.0.1");
    expect(sent).toHaveLength(1);
    const code = lastCode();

    const ok = await verifyLoginCode(email, code, "test");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const user = await getSessionUser(ok.token);
    expect(user?.email).toBe(email);

    expect((await verifyLoginCode(email, code, "test")).ok).toBe(false); // already used
    await revokeSession(ok.token);
    expect(await getSessionUser(ok.token)).toBeNull();
  });

  it("says nothing different for unknown emails", async () => {
    await expect(requestLoginCode("nobody@example.test", null)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("locks a code after too many wrong tries", async () => {
    await requestLoginCode(email, null);
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await verifyLoginCode(email, wrong, null)).ok).toBe(false);
    expect((await verifyLoginCode(email, code, null)).ok).toBe(false);
  });

  it("only the newest code works", async () => {
    await requestLoginCode(email, null);
    const first = lastCode();
    await requestLoginCode(email, null);
    const second = lastCode();
    if (first !== second) expect((await verifyLoginCode(email, first, null)).ok).toBe(false);
    expect((await verifyLoginCode(email, second, null)).ok).toBe(true);
  });
});
