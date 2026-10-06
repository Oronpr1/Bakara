// The academic approver's personal link, against a real PostgreSQL (DATABASE_URL). Everything the
// test creates carries its tag and is removed at the end.
import { closeDb, getDb, schema } from "@al/db";
import { flowView, type Actor, type Role } from "@al/domain";
import { and, eq, inArray, or } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSessionUser } from "../auth/service";
import { getLetterRoom } from "../letters/queries";
import { createLetterRequest, createSeason, decideLetter, submitLetter, uploadVersion } from "../letters/service";
import { loadLetter } from "../letters/state";
import { setMailer, type MailMessage } from "../mail";
import { setFileStore } from "../storage";
import { inviteAcademic, redeemLink, reissueLink, removeAcademic, requestNewLink } from "./service";

const tag = `acad-${process.pid}-${Date.now()}`;
const people: Record<string, Actor> = {};
const ids: string[] = [];
const sent: MailMessage[] = [];
const files = new Map<string, Uint8Array>();
const campus = `קמפוס-${tag}`;
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....[Content_Types].xml....")]);
const newEmail = `new-${tag}@example.test`;

async function makeUser(key: string, roles: Role[]) {
  const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag}@example.test`, name: key, roles }).returning();
  people[key] = { userId: u!.id, roles };
  ids.push(u!.id);
}
async function pdf() {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}
const secretOf = (url: string) => url.split("/a/")[1]!;
const viewOf = async (id: string) => flowView((await loadLetter(getDb(), id)).input);
const userByEmail = (email: string) => getDb().query.users.findFirst({ where: eq(schema.users.email, email) });

describe.skipIf(!process.env.DATABASE_URL)("academic approver by personal link", () => {
  let seasonId = "";
  let letterId = "";
  let headId = ""; // the academic approver invited by name and email
  let lastUrl = "";

  /** A letter of this test, prepared, reviewed and approved by the manager and the VP. */
  async function letterAtAcademic(n: string) {
    const l = await createLetterRequest(people.cm!, {
      seasonId,
      campus,
      faculty: "משפטים",
      trackName: `מסלול ${n}`,
      trackNumber: `22700000${n}`,
      advisorId: people.adv!.userId,
      registrationManagerId: people.rm!.userId,
    });
    await uploadVersion(people.adv!, l.id, { docx, pdf: await pdf() });
    await submitLetter(people.adv!, l.id);
    await decideLetter(people.rm!, l.id, { seat: "RM", kind: "APPROVED" });
    await decideLetter(people.vp!, l.id, { seat: "VP", kind: "APPROVED" });
    return l.id;
  }

  beforeAll(async () => {
    setMailer({ send: async (m) => void sent.push(m) });
    setFileStore({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k)! });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("outsider", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("stranger", ["ACADEMIC_APPROVER"]);
    await makeUser("dean", ["ACADEMIC_APPROVER"]);
    seasonId = (await createSeason(people.cm!, { name: `עונה ${tag}` })).id;
  });

  afterAll(async () => {
    setMailer(undefined);
    setFileStore(undefined);
    const db = getDb();
    const created = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, newEmail));
    const userIds = [...ids, ...created.map((u) => u.id)];
    const letters = await db.select({ id: schema.letterRequests.id }).from(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    const letterIds = letters.map((l) => l.id);
    await db.delete(schema.sessions).where(inArray(schema.sessions.userId, userIds));
    await db.delete(schema.academicLinks).where(inArray(schema.academicLinks.userId, userIds));
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.units).where(eq(schema.units.campus, campus));
    await db.delete(schema.campuses).where(eq(schema.campuses.name, campus));
    await db
      .delete(schema.auditEvents)
      .where(
        or(
          inArray(schema.auditEvents.actorId, userIds),
          eq(schema.auditEvents.seasonId, seasonId),
          ...(letterIds.length ? [inArray(schema.auditEvents.letterId, letterIds)] : []),
        ),
      );
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await closeDb();
  });

  it("cannot invite before the letter reaches the academic step, nor from outside the letter", async () => {
    const draft = await createLetterRequest(people.cm!, {
      seasonId,
      campus,
      faculty: "משפטים",
      trackName: "טיוטה",
      trackNumber: "227009999",
      advisorId: people.adv!.userId,
      registrationManagerId: people.rm!.userId,
    });
    await expect(inviteAcademic(people.adv!, draft.id, { name: "x", email: `x-${tag}@example.test` })).rejects.toThrow(/הרשאה/);

    letterId = await letterAtAcademic("1");
    expect((await viewOf(letterId)).state).toBe("READY_FOR_ACADEMIC");
    // Not on the letter: as if it did not exist.
    await expect(inviteAcademic(people.stranger!, letterId, { name: "x", email: `x-${tag}@example.test` })).rejects.toThrow(/לא נמצא/);
    await expect(inviteAcademic(people.outsider!, letterId, { name: "x", email: `x-${tag}@example.test` })).rejects.toThrow(/לא נמצא/);
    expect(await userByEmail(`x-${tag}@example.test`)).toBeUndefined();
  });

  it("checks what is typed before creating anyone", async () => {
    await expect(inviteAcademic(people.adv!, letterId, { name: "  ", email: `x-${tag}@example.test` })).rejects.toThrow(/שם/);
    await expect(inviteAcademic(people.adv!, letterId, { name: "x", email: "not an email" })).rejects.toThrow(/מייל/);
    // An email that belongs to staff is not turned into an academic approver.
    await expect(inviteAcademic(people.adv!, letterId, { name: "x", email: `rm-${tag}@example.test` })).rejects.toThrow(/כבר יש משתמש/);
    await expect(inviteAcademic(people.adv!, letterId, { userId: people.rm!.userId })).rejects.toThrow(/אינו גורם אקדמי/);
    expect((await viewOf(letterId)).state).toBe("READY_FOR_ACADEMIC");
  });

  it("invites a new person by name and email: a user without a password, a link, and an email", async () => {
    sent.length = 0;
    const issued = await inviteAcademic(people.adv!, letterId, { name: " פרופ' כהן ", email: ` New-${tag}@Example.test ` });
    lastUrl = issued.url;
    expect(issued).toMatchObject({ emailed: true, userName: "פרופ' כהן" });
    expect(issued.url).toMatch(/\/a\/[A-Za-z0-9_-]{20,}$/);
    expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000); // 14 days
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(newEmail);
    expect(sent[0]!.text).toContain(issued.url);
    expect(sent[0]!.subject).toContain("מסלול 1");

    const user = await userByEmail(newEmail);
    headId = user!.id;
    expect(user).toMatchObject({ name: "פרופ' כהן", roles: ["ACADEMIC_APPROVER"], passwordHash: null });
    const links = await getDb().select().from(schema.academicLinks).where(eq(schema.academicLinks.userId, headId));
    expect(links).toHaveLength(1);
    expect(links[0]!.emailedAt).not.toBeNull();

    // The letter now waits for them, and only them.
    const v = await viewOf(letterId);
    expect(v.state).toBe("WITH_ACADEMIC");
    expect(v.holder).toEqual({ kind: "ACADEMIC", userIds: [headId] });
    const types = (await getDb().select().from(schema.auditEvents).where(eq(schema.auditEvents.letterId, letterId))).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["ACADEMIC_ADDED", "ACADEMIC_LINK_ISSUED", "USER_CREATED"]));
  });

  it("the link opens a session that only sees this letter, and only what an academic approver may do", async () => {
    const opened = await redeemLink(secretOf(lastUrl), "test");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.letterId).toBe(letterId);
    const session = await getSessionUser(opened.token);
    expect(session).toMatchObject({ id: headId, roles: ["ACADEMIC_APPROVER"], linkLetterId: letterId });

    const head: Actor = { userId: headId, roles: ["ACADEMIC_APPROVER"] };
    const room = await getLetterRoom(head, letterId);
    expect(room.can.decide).toEqual([{ seat: `ACADEMIC:${headId}`, onBehalfOf: null }]);
    expect(room.can).toMatchObject({ comment: true, uploadVersion: false, sendToAcademic: false, reassignAdvisor: false, remind: false });
    // No list of staff to pick from for an academic approver.
    expect(room.advisors).toEqual([]);
    expect(room.addable).toEqual({ advisors: [], managers: [] });
    expect(room.academics).toEqual([expect.objectContaining({ userId: headId, link: "active", decision: null })]);
    expect(room.academics[0]!.lastOpenedAt).not.toBeNull();
    // Another letter is not theirs.
    const other = await letterAtAcademic("2");
    await expect(getLetterRoom(head, other)).rejects.toThrow(/לא נמצא/);
  });

  it("inviting the same email again reuses the person and replaces the old link", async () => {
    const again = await inviteAcademic(people.cm!, letterId, { name: "שם אחר", email: newEmail });
    expect((await getDb().select().from(schema.users).where(eq(schema.users.email, newEmail))).length).toBe(1);
    expect((await redeemLink(secretOf(lastUrl), null)).ok).toBe(false);
    expect((await redeemLink(secretOf(again.url), null)).ok).toBe(true);
    lastUrl = again.url;
  });

  it("a second academic approver by user id: the letter waits for both", async () => {
    await inviteAcademic(people.adv!, letterId, { userId: people.dean!.userId });
    const v = await viewOf(letterId);
    expect(v.holder.kind).toBe("ACADEMIC");
    expect([...v.holder.userIds].sort()).toEqual([headId, people.dean!.userId].sort());
  });

  it("refuses wrong and replaced links the same way; a new link can be issued only to someone on the letter", async () => {
    expect(await redeemLink("not-a-real-secret-at-all-1234567890", null)).toEqual({ ok: false });
    expect(await redeemLink("short", null)).toEqual({ ok: false });
    expect(await redeemLink("../../etc/passwd-and-some-more-text", null)).toEqual({ ok: false });

    const first = await reissueLink(people.cm!, letterId, headId);
    const second = await reissueLink(people.adv!, letterId, headId);
    expect((await redeemLink(secretOf(first.url), null)).ok).toBe(false); // replaced by the newer link
    expect((await redeemLink(secretOf(second.url), null)).ok).toBe(true);
    lastUrl = second.url;

    await expect(reissueLink(people.cm!, letterId, people.stranger!.userId)).rejects.toThrow(/אינו משויך/);
    await expect(reissueLink(people.cm!, letterId, people.rm!.userId)).rejects.toThrow(/אינו גורם אקדמי/);
    await expect(reissueLink(people.outsider!, letterId, headId)).rejects.toThrow(/לא נמצא/);
  });

  it("an expired link does not open; asking for a new one tells the advisor and the control manager", async () => {
    await getDb().update(schema.academicLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.academicLinks.userId, headId));
    expect((await redeemLink(secretOf(lastUrl), null)).ok).toBe(false);
    const room = await getLetterRoom(people.cm!, letterId);
    expect(room.academics.find((a) => a.userId === headId)?.link).toBe("expired");

    await requestNewLink(secretOf(lastUrl));
    await requestNewLink("not-a-real-secret-at-all-1234567890"); // looks the same, does nothing
    const asked = await getDb()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.letterId, letterId), eq(schema.notifications.type, "LINK_REQUEST")));
    const to = asked.map((n) => n.userId);
    expect(to).toContain(people.adv!.userId);
    expect(to).toContain(people.cm!.userId);
    expect(to).not.toContain(headId);
    expect(asked.every((n) => (n.data as { userId?: string }).userId === headId)).toBe(true);

    const fresh = await reissueLink(people.adv!, letterId, headId);
    expect((await redeemLink(secretOf(fresh.url), null)).ok).toBe(true);
    lastUrl = fresh.url;
  });

  it("removing an academic approver kills their link; with nobody left the letter is back with the advisor", async () => {
    await expect(removeAcademic(people.stranger!, letterId, headId)).rejects.toThrow(/לא נמצא/);
    await removeAcademic(people.adv!, letterId, headId);
    expect((await redeemLink(secretOf(lastUrl), null)).ok).toBe(false);
    await expect(getLetterRoom({ userId: headId, roles: ["ACADEMIC_APPROVER"] }, letterId)).rejects.toThrow(/לא נמצא/);
    expect((await viewOf(letterId)).holder).toEqual({ kind: "ACADEMIC", userIds: [people.dean!.userId] });

    await removeAcademic(people.cm!, letterId, people.dean!.userId);
    const v = await viewOf(letterId);
    expect(v.state).toBe("READY_FOR_ACADEMIC");
    expect(v.holder.userIds).toEqual([people.adv!.userId]);
    const types = (await getDb().select().from(schema.auditEvents).where(eq(schema.auditEvents.letterId, letterId))).map((e) => e.type);
    expect(types.filter((t) => t === "ACADEMIC_REMOVED")).toHaveLength(2);
  });

  it("an academic approver invited back gets a working link again and can approve; the letter goes to final approval", async () => {
    const back = await inviteAcademic(people.adv!, letterId, { userId: headId });
    const opened = await redeemLink(secretOf(back.url), null);
    expect(opened.ok).toBe(true);
    const head: Actor = { userId: headId, roles: ["ACADEMIC_APPROVER"] };
    await decideLetter(head, letterId, { seat: `ACADEMIC:${headId}`, kind: "APPROVED" });
    const v = await viewOf(letterId);
    expect(v.phase).toBe("FINAL");
    expect(v.state).toBe("AWAITING_FINAL");
    // After the academic step, the approver can still open the letter but decide nothing.
    expect((await getLetterRoom(head, letterId)).can.decide).toEqual([]);
    await expect(inviteAcademic(people.adv!, letterId, { userId: people.dean!.userId })).rejects.toThrow(/הרשאה/);
  });
});
