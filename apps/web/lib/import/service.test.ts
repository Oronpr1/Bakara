// Integration test against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeason } from "../letters/service";
import { listCampuses, setCampusDefaults } from "../units/service";
import { importTracks, planTrackImport } from "./service";

const tag = `imp-${process.pid}-${Date.now()}`;
const people: Record<string, Actor> = {};
const ids: string[] = [];
async function makeUser(key: string, roles: Role[], name = key) {
  const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag}@example.test`, name, roles }).returning();
  people[key] = { userId: u!.id, roles };
  ids.push(u!.id);
}
const campus = `קמפוס-${tag}`;

describe.skipIf(!process.env.DATABASE_URL)("track import", () => {
  let seasonId = "";
  beforeAll(async () => {
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"], `דנה ${tag}`);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("plain", ["CONTROL_ADVISOR"]);
    seasonId = (await createSeason(people.cm!, { name: `עונה ${tag}` })).id;
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.units).where(eq(schema.units.campus, campus));
    await db.delete(schema.campuses).where(eq(schema.campuses.name, campus));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
    await closeDb();
  });

  const row = (line: number, n: string, advisor: string, faculty = "משפטים", name = `מסלול ${n}`) => ({
    line,
    trackName: name,
    trackNumber: n,
    faculty,
    campus,
    advisor,
  });

  it("imports what is valid, reports the rest, uses the campus defaults, and is safe to run twice", async () => {
    const rows = [
      row(2, "227111001", `adv-${tag}@example.test`),
      row(3, "227111002", `דנה ${tag}`),
      row(4, "227111003", "אין כזו"),
      row(5, "227111001", `adv-${tag}@example.test`), // same code twice in the file
      row(6, "227111004", ""), // no advisor in the file: the campus's advisor
      row(7, "-", "", "משפטים", 'ללא ממ"ה'), // placeholder row
      row(8, "227111005", "", ""), // no faculty
      row(9, "ab", "", "משפטים"), // bad code
    ];
    await expect(importTracks(people.plain!, seasonId, rows)).rejects.toThrow(/הרשאה/);

    // Nobody set for the campus yet: nothing can be created, but the campus + faculty is registered.
    const first = await importTracks(people.cm!, seasonId, rows);
    expect(first.counts.created).toBe(0);
    expect(first.unitsWithoutManager).toEqual([{ campus, faculty: "משפטים" }]);
    const camp = (await listCampuses()).find((c) => c.name === campus);
    expect(camp?.units.map((u) => u.faculty)).toEqual(["משפטים"]);

    await setCampusDefaults(people.cm!, camp!.id, { registrationManagerId: people.rm!.userId, advisorId: people.adv!.userId });
    const preview = await planTrackImport(people.cm!, seasonId, rows);
    expect(preview.rows.map((r) => r.status)).toEqual(["OK", "OK", "ERROR", "ERROR", "OK", "SKIPPED", "ERROR", "ERROR"]);
    expect(preview.rows[2]!.problem).toMatch(/אין יועצת/);
    expect(preview.rows[3]!.problem).toMatch(/פעמיים/);
    expect(preview.rows[6]!.problem).toMatch(/פקולטה/);
    expect(preview.rows[7]!.problem).toMatch(/קוד מסלול/);

    const done = await importTracks(people.cm!, seasonId, rows);
    expect(done.counts).toMatchObject({ created: 3, skipped: 1, error: 4 });
    const again = await importTracks(people.cm!, seasonId, rows);
    expect(again.counts).toMatchObject({ created: 0, exists: 3, skipped: 1, error: 4 });
    const letters = await getDb().select().from(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    expect(letters).toHaveLength(3);
    expect(letters.every((l) => l.advisorId === people.adv!.userId)).toBe(true);
  });
});
