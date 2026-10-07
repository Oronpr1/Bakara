// Track import against a real PostgreSQL (DATABASE_URL). Tracks are created whether or not the file
// names an advisor and a registration manager: unassigned ones show as blocked until the control
// manager assigns people, and the report counts how many still need it.
import { closeDb, getDb, schema } from "@al/db";
import { flowView, type Actor, type Role } from "@al/domain";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeason } from "../letters/service";
import { loadLetter } from "../letters/state";
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
    await makeUser("adv2", ["CONTROL_ADVISOR"], `רונית ${tag}`);
    await makeUser("twin1", ["CONTROL_ADVISOR"], `תאומה ${tag}`);
    await makeUser("twin2", ["CONTROL_ADVISOR"], `תאומה ${tag}`);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("plain", ["CONTROL_ADVISOR"]);
    seasonId = (await createSeason(people.cm!, { name: `עונה ${tag}` })).id;
  });
  afterAll(async () => {
    const db = getDb();
    const letters = await db.select({ id: schema.letterRequests.id }).from(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db
      .delete(schema.auditEvents)
      .where(
        or(
          inArray(schema.auditEvents.actorId, ids),
          eq(schema.auditEvents.seasonId, seasonId),
          ...(letters.length ? [inArray(schema.auditEvents.letterId, letters.map((l) => l.id))] : []),
        ),
      );
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
    await closeDb();
  });

  const row = (line: number, n: string, advisor: string, faculty = "משפטים", name = `מסלול ${n}`, manager = "") => ({
    line,
    trackName: name,
    trackNumber: n,
    faculty,
    campus,
    advisor,
    manager,
  });
  const letters = () => getDb().select().from(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
  const stateOf = async (id: string) => flowView((await loadLetter(getDb(), id)).input).state;

  const rows = [
    row(2, "227111001", `ADV-${tag}@example.test`), // by email, any case
    row(3, "227111002", `דנה ${tag}`), // by name
    row(4, "227111003", "אין כזו"),
    row(5, "227111001", `adv-${tag}@example.test`), // same code twice in the file
    row(6, "227111004", ""), // nobody named: created unassigned
    row(7, "-", "", "משפטים", 'ללא ממ"ה'), // placeholder row
    row(8, "227111005", "", ""), // no faculty
    row(9, "ab", "", "משפטים"), // bad code
    row(10, "227111006", `תאומה ${tag}`), // two advisors with that name
    row(11, "227111007", `רונית ${tag}`, "משפטים", "מסלול 227111007", `RM-${tag}@example.test`), // advisor and manager named
    row(12, "227111008", "", "משפטים", "מסלול 227111008", "אין כזה"), // a manager who does not exist
  ];

  it("only managers import", async () => {
    await expect(importTracks(people.plain!, seasonId, rows)).rejects.toThrow(/הרשאה/);
    await expect(planTrackImport(people.plain!, seasonId, rows)).rejects.toThrow(/הרשאה/);
    expect(await letters()).toHaveLength(0);
  });

  it("creates what it can: assigned where the file says who, unassigned where it does not; the rest is explained", async () => {
    const first = await importTracks(people.cm!, seasonId, rows);
    expect(first.rows.map((r) => r.status)).toEqual(["CREATED", "CREATED", "ERROR", "ERROR", "CREATED", "SKIPPED", "ERROR", "ERROR", "ERROR", "CREATED", "ERROR"]);
    expect(first.counts).toEqual({ ok: 0, exists: 0, error: 6, created: 4, skipped: 1 });
    expect(first.rows[2]!.problem).toMatch(/אין יועץ בקרה/);
    expect(first.rows[3]!.problem).toMatch(/פעמיים/);
    expect(first.rows[6]!.problem).toMatch(/פקולטה/);
    expect(first.rows[7]!.problem).toMatch(/קוד מסלול/);
    expect(first.rows[8]!.problem).toMatch(/יותר מיועץ בקרה אחד/);
    expect(first.rows[10]!.problem).toMatch(/אין מנהל רישום/);
    // Created: two assigned an advisor only, one with nobody, one with an advisor and a manager.
    expect(first.unassigned).toEqual({ noAdvisor: 1, noManager: 3 });

    const byNumber = new Map((await letters()).map((l) => [l.trackNumber, l]));
    expect(byNumber.size).toBe(4);
    expect(byNumber.get("227111001")).toMatchObject({ advisorId: people.adv!.userId, registrationManagerId: null });
    expect(byNumber.get("227111004")).toMatchObject({ advisorId: null, registrationManagerId: null });
    expect(byNumber.get("227111007")).toMatchObject({ advisorId: people.adv2!.userId, registrationManagerId: people.rm!.userId });
    expect(await stateOf(byNumber.get("227111001")!.id)).toBe("BLOCKED"); // no manager yet
    expect(flowView((await loadLetter(getDb(), byNumber.get("227111004")!.id)).input).blockers).toEqual(expect.arrayContaining(["NO_ADVISOR", "NO_REGISTRATION_MANAGER"]));
    expect(await stateOf(byNumber.get("227111007")!.id)).toBe("PREPARING"); // fully assigned

    // Only the advisors who were named hear about a letter to prepare.
    const notes = await getDb()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, people.adv!.userId), eq(schema.notifications.type, "YOUR_TURN")));
    expect(notes).toHaveLength(2);
  });

  it("the preview changes nothing, and a second run adds nothing", async () => {
    const before = (await letters()).length;
    const preview = await planTrackImport(people.cm!, seasonId, rows);
    expect(preview.rows.map((r) => r.status)).toEqual(["EXISTS", "EXISTS", "ERROR", "ERROR", "EXISTS", "SKIPPED", "ERROR", "ERROR", "ERROR", "EXISTS", "ERROR"]);
    expect((await letters()).length).toBe(before);
    const again = await importTracks(people.cm!, seasonId, rows);
    expect(again.counts).toMatchObject({ created: 0, exists: 4, skipped: 1, error: 6 });
    expect((await letters()).length).toBe(before);
  });
});
