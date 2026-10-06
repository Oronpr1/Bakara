// Integration test against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLetterRequest, createSeason } from "../letters/service";
import { listCampuses, setCampusDefaults, setUnitDefaults } from "./service";

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
    await db.delete(schema.campuses).where(eq(schema.campuses.name, campus));
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

  const letterIn = (n: string, faculty = "משפטים") => ({ ...track(n), faculty });
  const assigned = (letterId: string) =>
    getDb()
      .select()
      .from(schema.approverAssignments)
      .where(and(eq(schema.approverAssignments.letterId, letterId), isNull(schema.approverAssignments.removedAt)));
  const managerOf = async (letterId: string) =>
    (await assigned(letterId)).filter((r) => r.slot === "REGISTRATION_MANAGER").map((r) => r.userId);

  it("refuses a letter while nobody is set for the campus + faculty, but registers it", async () => {
    await expect(createLetterRequest(people.cm!, { ...track("1"), advisorId: undefined })).rejects.toThrow(/יועצת בקרה/);
    const found = (await listCampuses()).find((c) => c.name === campus);
    expect(found?.units.map((u) => u.faculty)).toEqual(["משפטים"]);
  });

  it("a campus-wide manager covers every faculty; a faculty's own setting wins; changes follow open letters", async () => {
    const camp = (await listCampuses()).find((c) => c.name === campus)!;
    await expect(setCampusDefaults(people.adv!, camp.id, { registrationManagerId: people.rm1!.userId })).rejects.toThrow(/הרשאה/);
    await expect(setCampusDefaults(people.cm!, camp.id, { registrationManagerId: people.vp!.userId })).rejects.toThrow(/מנהל רישום/);
    await setCampusDefaults(people.cm!, camp.id, { registrationManagerId: people.rm1!.userId, advisorId: people.adv!.userId });

    // No advisor in the input: the campus's advisor and manager apply, plus the VP, to every faculty.
    const law = await createLetterRequest(people.cm!, { ...letterIn("1"), advisorId: undefined });
    const biz = await createLetterRequest(people.adv!, { ...letterIn("2", "מנהל עסקים"), advisorId: undefined });
    for (const l of [law, biz]) {
      expect(l.advisorId).toBe(people.adv!.userId);
      expect(await managerOf(l.id)).toEqual([people.rm1!.userId]);
      expect((await assigned(l.id)).some((r) => r.slot === "VP_REGISTRATION" && r.userId === people.vp!.userId)).toBe(true);
      expect((await assigned(l.id)).some((r) => r.slot === "ACADEMIC")).toBe(false);
    }

    // The business faculty gets its own manager: only its letters move.
    const bizUnit = (await listCampuses()).find((c) => c.name === campus)!.units.find((u) => u.faculty === "מנהל עסקים")!;
    await setUnitDefaults(people.cm!, bizUnit.id, { registrationManagerId: people.rm2!.userId });
    expect(await managerOf(biz.id)).toEqual([people.rm2!.userId]);
    expect(await managerOf(law.id)).toEqual([people.rm1!.userId]);

    // Clearing it falls back to the campus; changing the campus moves the letters that follow it.
    await setUnitDefaults(people.cm!, bizUnit.id, { registrationManagerId: null });
    expect(await managerOf(biz.id)).toEqual([people.rm1!.userId]);
    await setCampusDefaults(people.cm!, camp.id, { registrationManagerId: people.rm2!.userId });
    expect(await managerOf(law.id)).toEqual([people.rm2!.userId]);
    expect(await managerOf(biz.id)).toEqual([people.rm2!.userId]);
  });
});
