// Integration test against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import { allowed, setPolicy, type Actor } from "@al/domain";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePolicy, resetPolicy, savePolicy } from "./policy";

const tag = `rules-${process.pid}-${Date.now()}`;
const people: Record<string, Actor> = {};
const ids: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("the control manager's rules", () => {
  beforeAll(async () => {
    for (const [key, roles] of [["cm", ["CONTROL_MANAGER"]], ["vp", ["VP_REGISTRATION"]], ["admin", ["ADMIN"]]] as const) {
      const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag}@example.test`, name: key, roles: [...roles] }).returning();
      people[key] = { userId: u!.id, roles };
      ids.push(u!.id);
    }
  });
  afterAll(async () => {
    await resetPolicy(people.admin!).catch(() => {});
    setPolicy(null);
    await getDb().delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, ids));
    await getDb().delete(schema.users).where(inArray(schema.users.id, ids));
    await closeDb();
  });

  it("are saved, apply at once, and can be reset; only those with the right can change them", async () => {
    await expect(savePolicy(people.vp!, { SKIP_ACADEMIC: [] })).rejects.toThrow(/הרשאה/);
    await expect(savePolicy(people.cm!, { NOPE: [] } as never)).rejects.toThrow(/לא מוכר/);
    expect(allowed(people.vp!, "SKIP_ACADEMIC")).toBe(true);
    await savePolicy(people.cm!, { SKIP_ACADEMIC: ["CONTROL_MANAGER"] });
    expect(allowed(people.vp!, "SKIP_ACADEMIC")).toBe(false);
    expect(allowed(people.cm!, "SKIP_ACADEMIC")).toBe(true);
    setPolicy(null); // as if another process: reads from the database again
    await ensurePolicy(getDb());
    expect(allowed(people.vp!, "SKIP_ACADEMIC")).toBe(true); // not refreshed yet (20 seconds)
    await savePolicy(people.cm!, { SKIP_ACADEMIC: ["CONTROL_MANAGER"] }); // forces a refresh
    expect(allowed(people.vp!, "SKIP_ACADEMIC")).toBe(false);
    await resetPolicy(people.admin!);
    expect(allowed(people.vp!, "SKIP_ACADEMIC")).toBe(true);
  });
});
