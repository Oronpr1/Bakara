// Track import against a real PostgreSQL (DATABASE_URL). In the new flow a letter is created even
// when its campus + faculty has no registration manager yet: it shows as blocked until one is set,
// and the import report lists those units for information.
import { closeDb, getDb, schema } from "@al/db";
import { flowView, type Actor, type Role } from "@al/domain";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeason } from "../letters/service";
import { loadLetter } from "../letters/state";
import { listCampuses, setCampusDefaults, setUnitDefaults } from "../units/service";
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
    await db.delete(schema.units).where(eq(schema.units.campus, campus));
    await db.delete(schema.campuses).where(eq(schema.campuses.name, campus));
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

  const row = (line: number, n: string, advisor: string, faculty = "משפטים", name = `מסלול ${n}`) => ({
    line,
    trackName: name,
    trackNumber: n,
    faculty,
    campus,
    advisor,
  });
  const letters = () => getDb().select().from(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
  const stateOf = async (id: string) => flowView((await loadLetter(getDb(), id)).input).state;

  const rows = [
    row(2, "227111001", `ADV-${tag}@example.test`), // by email, any case
    row(3, "227111002", `דנה ${tag}`), // by name
    row(4, "227111003", "אין כזו"),
    row(5, "227111001", `adv-${tag}@example.test`), // same code twice in the file
    row(6, "227111004", ""), // no advisor in the file: the campus's advisor
    row(7, "-", "", "משפטים", 'ללא ממ"ה'), // placeholder row
    row(8, "227111005", "", ""), // no faculty
    row(9, "ab", "", "משפטים"), // bad code
    row(10, "227111006", `תאומה ${tag}`), // two advisors with that name
  ];

  it("only managers import", async () => {
    await expect(importTracks(people.plain!, seasonId, rows)).rejects.toThrow(/הרשאה/);
    await expect(planTrackImport(people.plain!, seasonId, rows)).rejects.toThrow(/הרשאה/);
    expect(await letters()).toHaveLength(0);
  });

  it("creates letters even where nobody manages the unit yet; those units are listed, and the letters are blocked", async () => {
    const first = await importTracks(people.cm!, seasonId, rows);
    expect(first.rows.map((r) => r.status)).toEqual(["CREATED", "CREATED", "ERROR", "ERROR", "ERROR", "SKIPPED", "ERROR", "ERROR", "ERROR"]);
    expect(first.counts).toEqual({ ok: 0, exists: 0, error: 6, created: 2, skipped: 1 });
    expect(first.rows[2]!.problem).toMatch(/אין יועצת/);
    expect(first.rows[3]!.problem).toMatch(/פעמיים/);
    expect(first.rows[4]!.problem).toMatch(/לא הוגדרה יועצת/); // no default advisor yet
    expect(first.rows[6]!.problem).toMatch(/פקולטה/);
    expect(first.rows[7]!.problem).toMatch(/קוד מסלול/);
    expect(first.rows[8]!.problem).toMatch(/יותר מיועצת אחת/);
    expect(first.unitsWithoutManager).toEqual([{ campus, faculty: "משפטים" }]);

    // The campus + faculty is registered for the "קמפוסים ופקולטות" screen.
    const camp = (await listCampuses()).find((c) => c.name === campus);
    expect(camp?.units.map((u) => u.faculty)).toEqual(["משפטים"]);

    const created = await letters();
    expect(created).toHaveLength(2);
    for (const l of created) {
      expect(l.advisorId).toBe(people.adv!.userId);
      expect(l.registrationManagerId).toBeNull();
      expect(await stateOf(l.id)).toBe("BLOCKED");
    }
    // The advisor hears about her new letters.
    const notes = await getDb()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, people.adv!.userId), eq(schema.notifications.type, "YOUR_TURN")));
    expect(notes).toHaveLength(2);
  });

  it("after the campus is set: the preview changes nothing, the rest is created, and a second run adds nothing", async () => {
    const camp = (await listCampuses()).find((c) => c.name === campus)!;
    await setCampusDefaults(people.cm!, camp.id, { registrationManagerId: people.rm!.userId, advisorId: people.adv!.userId });

    const preview = await planTrackImport(people.cm!, seasonId, rows);
    expect(preview.rows.map((r) => r.status)).toEqual(["EXISTS", "EXISTS", "ERROR", "ERROR", "OK", "SKIPPED", "ERROR", "ERROR", "ERROR"]);
    expect(preview.rows[4]).toMatchObject({ advisorId: people.adv!.userId, advisorName: `דנה ${tag}` });
    expect(preview.unitsWithoutManager).toEqual([]);
    expect(await letters()).toHaveLength(2);

    const done = await importTracks(people.cm!, seasonId, rows);
    expect(done.counts).toMatchObject({ created: 1, exists: 2, skipped: 1, error: 5 });
    const again = await importTracks(people.cm!, seasonId, rows);
    expect(again.counts).toMatchObject({ created: 0, exists: 3, skipped: 1, error: 5 });

    const all = await letters();
    expect(all).toHaveLength(3);
    expect(all.every((l) => l.advisorId === people.adv!.userId)).toBe(true);
    // The manager set on the campus now applies to the letters imported before it was set.
    for (const l of all) expect(await stateOf(l.id)).toBe("PREPARING");
  });

  it("a faculty's own advisor is used; a unit marked 'only the VP' is not reported as missing a manager", async () => {
    const extra = [row(2, "227112001", "", "חינוך"), row(3, "227112002", "", "אמנות")];
    // New faculties: registered by the first run, then set up.
    await importTracks(people.cm!, seasonId, extra);
    const units = (await listCampuses()).find((c) => c.name === campus)!.units;
    await setUnitDefaults(people.cm!, units.find((u) => u.faculty === "חינוך")!.id, { advisorId: people.adv2!.userId, onlyVp: true });
    await setCampusDefaults(people.cm!, (await listCampuses()).find((c) => c.name === campus)!.id, { registrationManagerId: null });

    const plan = await planTrackImport(people.cm!, seasonId, extra);
    expect(plan.rows.map((r) => r.status)).toEqual(["EXISTS", "EXISTS"]);
    expect(plan.rows[0]).toMatchObject({ advisorId: people.adv2!.userId }); // the faculty's own advisor
    expect(plan.unitsWithoutManager).toEqual([]); // nothing new is created, so nothing is reported

    const more = [row(4, "227112003", "", "חינוך"), row(5, "227112004", "", "אמנות")];
    const report = await importTracks(people.cm!, seasonId, more);
    expect(report.counts.created).toBe(2);
    expect(report.unitsWithoutManager).toEqual([{ campus, faculty: "אמנות" }]);
    const byNumber = new Map((await letters()).map((l) => [l.trackNumber, l]));
    expect(byNumber.get("227112003")!.advisorId).toBe(people.adv2!.userId);
    expect(await stateOf(byNumber.get("227112003")!.id)).toBe("PREPARING"); // only the VP: not blocked
    expect(await stateOf(byNumber.get("227112004")!.id)).toBe("BLOCKED");
  });
});
