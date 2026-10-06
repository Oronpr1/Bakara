// Integration test against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSessionUser } from "../auth/service";
import { createLetterRequest, createSeason } from "../letters/service";
import { getLetterDetail } from "../letters/queries";
import { setMailer, type MailMessage } from "../mail";
import { inviteAcademic, redeemLink, reissueLink } from "./service";

const tag = `acad-${process.pid}-${Date.now()}`;
const people: Record<string, Actor> = {};
const ids: string[] = [];
const sent: MailMessage[] = [];
async function makeUser(key: string, roles: Role[]) {
  const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag}@example.test`, name: key, roles }).returning();
  people[key] = { userId: u!.id, roles };
  ids.push(u!.id);
}
const campus = `קמפוס-${tag}`;
const secretOf = (url: string) => url.split("/a/")[1]!;

describe.skipIf(!process.env.DATABASE_URL)("academic approver by personal link", () => {
  let seasonId = "";
  let letterId = "";
  beforeAll(async () => {
    setMailer({ send: async (m) => void sent.push(m) });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("stranger", ["ACADEMIC_APPROVER"]);
    seasonId = (await createSeason(people.cm!, { name: `עונה ${tag}` })).id;
    letterId = (
      await createLetterRequest(people.cm!, {
        seasonId,
        campus,
        faculty: "משפטים",
        trackName: "מסלול",
        trackNumber: "227000001",
        advisorId: people.adv!.userId,
        registrationManagerId: people.rm!.userId,
      })
    ).id;
  });
  afterAll(async () => {
    setMailer(undefined);
    const db = getDb();
    const all = await db.select().from(schema.users).where(eq(schema.users.email, `new-${tag}@example.test`));
    const userIds = [...ids, ...all.map((u) => u.id)];
    await db.delete(schema.sessions).where(inArray(schema.sessions.userId, userIds));
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.units).where(eq(schema.units.campus, campus));
    await db.delete(schema.campuses).where(eq(schema.campuses.name, campus));
    await db.delete(schema.academicLinks).where(inArray(schema.academicLinks.userId, userIds));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await closeDb();
  });

  it("invites a new person by name and email: a user without a password, a link, and an email", async () => {
    await expect(inviteAcademic(people.stranger!, letterId, { name: "x", email: `x-${tag}@example.test` })).rejects.toThrow(/הרשאה/);
    expect(await getDb().query.users.findFirst({ where: eq(schema.users.email, `x-${tag}@example.test`) })).toBeUndefined();

    const issued = await inviteAcademic(people.adv!, letterId, { name: " פרופ' כהן ", email: ` New-${tag}@Example.test ` });
    expect(issued.emailed).toBe(true);
    expect(sent.at(-1)!.to).toBe(`new-${tag}@example.test`);
    expect(sent.at(-1)!.text).toContain(issued.url);
    const user = await getDb().query.users.findFirst({ where: eq(schema.users.email, `new-${tag}@example.test`) });
    expect(user?.roles).toEqual(["ACADEMIC_APPROVER"]);
    expect(user?.passwordHash).toBeNull();

    // The link opens a session that only sees this letter.
    const opened = await redeemLink(secretOf(issued.url), "test");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.letterId).toBe(letterId);
    const session = await getSessionUser(opened.token);
    expect(session?.roles).toEqual(["ACADEMIC_APPROVER"]);
    expect(session?.linkLetterId).toBe(letterId);
    const detail = await getLetterDetail({ userId: user!.id, roles: ["ACADEMIC_APPROVER"] }, letterId);
    expect(detail.people).toEqual([]); // no list of staff emails for an academic approver
  });

  it("refuses wrong, replaced and removed links the same way", async () => {
    expect(await redeemLink("not-a-real-secret-at-all-1234567890", null)).toEqual({ ok: false });
    expect(await redeemLink("short", null)).toEqual({ ok: false });

    const user = await getDb().query.users.findFirst({ where: eq(schema.users.email, `new-${tag}@example.test`) });
    const first = await reissueLink(people.cm!, letterId, user!.id);
    const second = await reissueLink(people.cm!, letterId, user!.id);
    expect((await redeemLink(secretOf(first.url), null)).ok).toBe(false); // replaced by the newer link
    expect((await redeemLink(secretOf(second.url), null)).ok).toBe(true);

    // Someone not on the letter cannot be given a link, and removing the approver kills the link.
    await expect(reissueLink(people.cm!, letterId, people.stranger!.userId)).rejects.toThrow(/אינו משויך/);
    await getDb()
      .update(schema.approverAssignments)
      .set({ removedAt: new Date() })
      .where(eq(schema.approverAssignments.userId, user!.id));
    expect((await redeemLink(secretOf(second.url), null)).ok).toBe(false);
  });

  it("an expired link does not open", async () => {
    const user = await getDb().query.users.findFirst({ where: eq(schema.users.email, `new-${tag}@example.test`) });
    await getDb()
      .update(schema.approverAssignments)
      .set({ removedAt: null })
      .where(eq(schema.approverAssignments.userId, user!.id));
    const issued = await reissueLink(people.cm!, letterId, user!.id);
    await getDb().update(schema.academicLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.academicLinks.userId, user!.id));
    expect((await redeemLink(secretOf(issued.url), null)).ok).toBe(false);
  });
});
