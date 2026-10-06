// Integration test against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLetterRequest, createSeason } from "../letters/service";
import { listUnits, setUnitRegistrationManager } from "./service";

const tag = `units-${process.pid}-${Date.now()}`;
const people: Record<string, Actor> = {};
const userIds: string[] = [];

async function makeUser(key: string, roles: Role[]) {
  const [u] = await getDb()
    .insert(schema.users)
    .values({ email: `${key}-${tag}@example.test`, name: key, roles })
    .returning();
  people[key] = { userId: u!.id, roles };
  userIds.push(u!.id);
}

const campus = `קמפוס-${tag}`;
const faculty = "משפטים";

describe.skipIf(!process.env.DATABASE_URL)("campus + faculty workspaces", () => {
  let seasonId = "";

  beforeAll(async () => {
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("rm1", ["REGISTRATION_MANAGER"]);
    await makeUser("rm2", ["REGISTRATION_MANAGER"]);
    seasonId = (await createSeason(people.cm!, { name: `עונה ${tag}` })).id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.units).where(eq(schema.units.campus, campus));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await closeDb();
  });

  const track = (n: string) => ({
    seasonId,
    campus,
    faculty,
    trackName: `מסלול ${n}`,
    trackNumber: n,
    advisorId: people.adv!.userId,
  });

  it("refuses a letter while the campus + faculty has no registration manager", async () => {
    await expect(createLetterRequest(people.cm!, track("1"))).rejects.toThrow(/מנהל רישום/);
    // The attempt still registered the campus + faculty, so it shows up to be set.
    expect((await listUnits()).some((u) => u.campus === campus && u.faculty === faculty)).toBe(true);
  });

  it("gives every track in the unit its registration manager and the VP, and follows a change", async () => {
    const unit = (await listUnits()).find((u) => u.campus === campus)!;
    await expect(setUnitRegistrationManager(people.adv!, unit.id, people.rm1!.userId)).rejects.toThrow(/הרשאה/);
    await expect(setUnitRegistrationManager(people.cm!, unit.id, people.vp!.userId)).rejects.toThrow(/מנהל רישום/);
    await setUnitRegistrationManager(people.cm!, unit.id, people.rm1!.userId);

    const a = await createLetterRequest(people.cm!, track("1"));
    const b = await createLetterRequest(people.adv!, track("2"));
    const assigned = (letterId: string) =>
      getDb()
        .select()
        .from(schema.approverAssignments)
        .where(and(eq(schema.approverAssignments.letterId, letterId), isNull(schema.approverAssignments.removedAt)));
    for (const letter of [a, b]) {
      const rows = await assigned(letter.id);
      expect(rows.find((r) => r.slot === "REGISTRATION_MANAGER")?.userId).toBe(people.rm1!.userId);
      expect(rows.some((r) => r.slot === "VP_REGISTRATION" && r.userId === people.vp!.userId)).toBe(true);
      expect(rows.some((r) => r.slot === "ACADEMIC")).toBe(false);
    }

    // Changing the unit's manager moves the open letters of that unit to the new person.
    await setUnitRegistrationManager(people.cm!, unit.id, people.rm2!.userId);
    for (const letter of [a, b]) {
      const rows = await assigned(letter.id);
      expect(rows.filter((r) => r.slot === "REGISTRATION_MANAGER").map((r) => r.userId)).toEqual([people.rm2!.userId]);
    }
  });
});
