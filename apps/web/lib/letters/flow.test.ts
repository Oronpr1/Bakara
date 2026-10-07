// End-to-end walk through a letter's life against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { eq, inArray, or } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inviteAcademic, redeemLink } from "../academic/service";
import { setMailer } from "../mail";
import { setFileStore } from "../storage";
import { getSessionUser } from "../auth/service";
import { createComment, deleteDraftComment, replyToComment, setCommentStatus, updateDraftComment } from "./comments";
import { getHome, getLetterRoom, listLetters } from "./queries";
import {
  addLetterPerson,
  changeAdvisor,
  createLetterRequest,
  createSeason,
  decideLetter,
  markInGilboa,
  remindHolders,
  removeLetterPerson,
  reopenLetter,
  resetLetterApprovals,
  resubmitLetter,
  retractApproval,
  setLetterRegistrationManager,
  skipAcademicRound,
  submitLetter,
  uploadVersion,
} from "./service";
import { loadLetter } from "./state";
import { flowView } from "@al/domain";

const tag = `flow-${process.pid}-${Date.now()}`;
const files = new Map<string, Uint8Array>();
const people: Record<string, Actor> = {};
const userIds: string[] = [];
const campus = `קמפוס-${tag}`;
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....[Content_Types].xml....")]);

async function makeUser(key: string, roles: Role[]) {
  const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag}@example.test`, name: key, roles }).returning();
  people[key] = { userId: u!.id, roles };
  userIds.push(u!.id);
}
async function pdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}
const anchor = (v = 1) => ({ versionNumber: v, page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.05 });
const phaseOf = async (id: string) => (await loadLetter(getDb(), id)).row.phase;
const viewOf = async (id: string) => flowView((await loadLetter(getDb(), id)).input);
const notes = async (userId: string, type: string) =>
  (await getDb().select().from(schema.notifications).where(eq(schema.notifications.userId, userId))).filter((n) => n.type === type);

describe.skipIf(!process.env.DATABASE_URL)("a letter from preparation to approved for distribution", () => {
  let seasonId = "";
  let letterId = "";

  beforeAll(async () => {
    setFileStore({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k)! });
    setMailer({ send: async () => {} });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("adv2", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("rm2", ["REGISTRATION_MANAGER"]);
    await makeUser("outsider", ["CONTROL_ADVISOR"]);
    seasonId = (await createSeason(people.cm!, { name: `תשפ"ז א' ${tag}` })).id;
  });

  afterAll(async () => {
    setMailer(undefined);
    const db = getDb();
    const extra = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, [`head-${tag}@example.test`]));
    const all = [...userIds, ...extra.map((u) => u.id)];
    await db.delete(schema.sessions).where(inArray(schema.sessions.userId, all));
    await db.delete(schema.academicLinks).where(inArray(schema.academicLinks.userId, all));
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.auditEvents).where(or(inArray(schema.auditEvents.actorId, all)));
    await db.delete(schema.users).where(inArray(schema.users.id, all));
    await closeDb();
  });

  it("a track nobody is assigned to cannot be sent; assigning an advisor and a manager one by one fixes it", async () => {
    await expect(createLetterRequest(people.adv!, { seasonId, campus, faculty: "מנהל עסקים", trackName: "x", trackNumber: "227000001" })).rejects.toThrow(); // only the control manager sets tracks up
    await expect(createLetterRequest(people.cm!, { seasonId, campus, faculty: "מנהל עסקים", trackName: "x", trackNumber: "227000001", advisorId: people.rm!.userId })).rejects.toThrow(/לא מתאים לתפקיד/); // an advisor must be an advisor
    const letter = await createLetterRequest(people.cm!, { seasonId, campus, faculty: "מנהל עסקים", trackName: "מימון BA", trackNumber: "227113006" });
    letterId = letter.id;
    expect((await viewOf(letterId)).blockers).toEqual(expect.arrayContaining(["NO_ADVISOR", "NO_REGISTRATION_MANAGER"])); // nobody yet
    await changeAdvisor(people.cm!, letterId, people.adv!.userId);
    expect((await notes(people.adv!.userId, "YOUR_TURN")).length).toBeGreaterThan(0); // a new letter to prepare
    expect((await viewOf(letterId)).state).toBe("BLOCKED"); // no registration manager
    await uploadVersion(people.adv!, letterId, { docx, pdf: await pdf() });
    await expect(submitLetter(people.adv!, letterId)).rejects.toThrow(/מנהל רישום/);
    await setLetterRegistrationManager(people.cm!, letterId, people.rm!.userId);
    expect((await viewOf(letterId)).state).toBe("PREPARING");
  });

  it("only the right people see the letter, and the VP is on every list", async () => {
    await expect(getLetterRoom(people.outsider!, letterId)).rejects.toThrow();
    expect((await listLetters(people.outsider!, seasonId)).length).toBe(0);
    expect((await listLetters(people.adv!, seasonId)).length).toBe(1);
    expect((await listLetters(people.rm!, seasonId)).length).toBe(1);
    expect((await listLetters(people.vp!, seasonId)).length).toBe(1);
    const home = await getHome(people.cm!, seasonId);
    expect(home.tower?.total).toBe(1);
    expect(home.tower?.byPhase.DRAFT).toBe(1);
    expect(home.mine).toHaveLength(0); // the control manager is not a holder
    expect((await getHome(people.adv!, seasonId)).mine).toHaveLength(1);
  });

  it("the registration manager reviews first; his comments are drafts until he decides; approving with comments sends it to the advisor", async () => {
    await submitLetter(people.adv!, letterId);
    expect(await phaseOf(letterId)).toBe("REVIEW");
    expect((await getHome(people.rm!, seasonId)).mine).toHaveLength(1);
    expect((await getHome(people.vp!, seasonId)).mine).toHaveLength(0); // not his turn yet
    expect((await notes(people.rm!.userId, "YOUR_TURN")).length).toBeGreaterThan(0);

    const c = await createComment(people.rm!, letterId, { anchor: anchor(), body: "הימים לא נכונים", suggestion: "ב׳ וד׳ במקום א׳ וג׳" });
    expect((await viewOf(letterId)).state).toBe("IN_REVIEW"); // a draft does not stop anyone
    expect((await getLetterRoom(people.adv!, letterId)).comments).toHaveLength(0);
    expect((await getLetterRoom(people.rm!, letterId)).comments[0]).toMatchObject({ id: c.id, isDraft: true, suggestion: "ב׳ וד׳ במקום א׳ וג׳" });

    await expect(decideLetter(people.vp!, letterId, { seat: "VP", kind: "APPROVED" })).rejects.toThrow();
    await decideLetter(people.rm!, letterId, { seat: "RM", kind: "APPROVED" });
    const v = await viewOf(letterId);
    expect(v.state).toBe("FIXING");
    expect(v.holder.userIds).toEqual([people.adv!.userId]);
    expect((await getLetterRoom(people.adv!, letterId)).comments[0]).toMatchObject({ isDraft: false, status: "OPEN" });
    expect((await notes(people.adv!.userId, "RETURNED_FOR_FIXES")).length).toBe(1);
    await expect(decideLetter(people.rm!, letterId, { seat: "RM", kind: "APPROVED" })).rejects.toThrow(); // already decided
  });

  it("the advisor must answer every comment, and the VP does not get the letter before she sends it", async () => {
    const room = await getLetterRoom(people.adv!, letterId);
    await expect(resubmitLetter(people.adv!, letterId)).rejects.toThrow(/להגיב/);
    await expect(setCommentStatus(people.rm!, room.comments[0]!.id, { to: "RESOLVED_FIXED" })).rejects.toThrow(); // only the advisor answers
    await replyToComment(people.rm!, room.comments[0]!.id, "תודה");
    await setCommentStatus(people.adv!, room.comments[0]!.id, { to: "RESOLVED_FIXED", note: "תוקן ל-ב׳ וד׳" });
    // Every comment is answered, but the letter stays with her until she sends it.
    expect((await viewOf(letterId)).holder.userIds).toEqual([people.adv!.userId]);
    await uploadVersion(people.adv!, letterId, { docx, pdf: await pdf(2), note: "תוקנו הימים" });
    await resubmitLetter(people.adv!, letterId);
    const v = await viewOf(letterId);
    expect(v.state).toBe("IN_REVIEW");
    expect(v.holder.userIds).toEqual([people.vp!.userId]); // straight to the VP, not back to the manager
    expect((await notes(people.vp!.userId, "YOUR_TURN")).length).toBeGreaterThan(0);
    const room2 = await getLetterRoom(people.vp!, letterId);
    expect(room2.seats.find((s) => s.key === "RM")).toMatchObject({ status: "approved", changedSince: true }); // approved version 1, now version 2
  });

  it("the VP returns it; the advisor fixes; the VP approves; the letter waits to be sent to an academic approver", async () => {
    await createComment(people.vp!, letterId, { anchor: anchor(2), body: "תאריך תחילת הלימודים שגוי" });
    await decideLetter(people.vp!, letterId, { seat: "VP", kind: "CHANGES" });
    expect((await viewOf(letterId)).state).toBe("FIXING");
    await expect(resubmitLetter(people.adv!, letterId)).rejects.toThrow(/להגיב/);
    const open = (await getLetterRoom(people.adv!, letterId)).comments.find((c) => c.status === "OPEN")!;
    await setCommentStatus(people.adv!, open.id, { to: "RESOLVED_NO_CHANGE" }).catch((e) => expect(String(e.message)).toMatch(/להסביר/));
    await setCommentStatus(people.adv!, open.id, { to: "RESOLVED_FIXED", note: "עודכן ל-8.11" });
    await uploadVersion(people.adv!, letterId, { docx, pdf: await pdf(2), note: "תוקן התאריך" });
    await resubmitLetter(people.adv!, letterId);
    expect((await viewOf(letterId)).holder.userIds).toEqual([people.vp!.userId]);
    await decideLetter(people.vp!, letterId, { seat: "VP", kind: "APPROVED" });
    expect(await phaseOf(letterId)).toBe("ACADEMIC");
    expect((await viewOf(letterId)).state).toBe("READY_FOR_ACADEMIC");
    expect((await notes(people.adv!.userId, "READY_FOR_ACADEMIC")).length).toBe(1);
  });

  it("the advisor sends it to an academic approver by a personal link; the academic answers; it goes to final approval", async () => {
    await expect(inviteAcademic(people.outsider!, letterId, { name: "x", email: `x-${tag}@example.test` })).rejects.toThrow();
    const issued = await inviteAcademic(people.adv!, letterId, { name: "פרופ׳ לוי", email: `head-${tag}@example.test` });
    expect(issued.url).toContain("/a/");
    expect((await viewOf(letterId)).state).toBe("WITH_ACADEMIC");

    const opened = await redeemLink(issued.url.split("/a/")[1]!, "test");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const session = (await getSessionUser(opened.token))!;
    expect(session.roles).toEqual(["ACADEMIC_APPROVER"]);
    const headActor: Actor = { userId: session.id, roles: session.roles };
    const room = await getLetterRoom(headActor, letterId);
    expect(room.can.decide).toEqual([{ seat: `ACADEMIC:${session.id}`, onBehalfOf: null }]);
    expect(room.can.sendToAcademic).toBe(false);

    await decideLetter(headActor, letterId, { seat: `ACADEMIC:${session.id}`, kind: "APPROVED" });
    expect(await phaseOf(letterId)).toBe("FINAL");
    expect((await notes(people.adv!.userId, "ACADEMIC_ANSWERED")).length).toBe(1);
    expect((await notes(people.vp!.userId, "YOUR_TURN")).length).toBeGreaterThan(1);
  });

  it("the control manager signs in the VP's place, on record; the VP and the advisor are told", async () => {
    const room = await getLetterRoom(people.cm!, letterId);
    expect(room.can.decide).toEqual([{ seat: "FINAL", onBehalfOf: people.vp!.userId }]);
    await expect(decideLetter(people.rm!, letterId, { seat: "FINAL", kind: "APPROVED" })).rejects.toThrow();
    await decideLetter(people.cm!, letterId, { seat: "FINAL", kind: "APPROVED" });
    expect(await phaseOf(letterId)).toBe("APPROVED");
    const done = await getLetterRoom(people.adv!, letterId);
    expect(done.seats[0]).toMatchObject({ role: "FINAL", status: "approved", decidedByName: "cm", onBehalfOfName: "vp" });
    expect((await notes(people.vp!.userId, "ACTED_FOR_YOU")).length).toBe(1);
    expect((await notes(people.adv!.userId, "APPROVED_FOR_DISTRIBUTION")).length).toBe(1);
    expect((await viewOf(letterId)).state).toBe("LOADING");
    await expect(uploadVersion(people.adv!, letterId, { docx, pdf: await pdf() })).rejects.toThrow();
    await markInGilboa(people.adv!, letterId);
    expect((await viewOf(letterId)).state).toBe("APPROVED");
    expect((await getHome(people.cm!, seasonId)).tower).toMatchObject({ approved: 1, inGilboa: 1 });
  });

  it("the history names everything that happened, in order", async () => {
    const room = await getLetterRoom(people.cm!, letterId);
    const types = room.history.map((h) => h.type);
    for (const t of ["SUBMITTED", "APPROVED", "RETURNED", "RESUBMITTED", "ACADEMIC_ADDED", "PHASE_CHANGED", "IN_GILBOA"]) expect(types).toContain(t);
    expect(room.versions.map((v) => v.number)).toEqual([3, 2, 1]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("overrides and the awkward cases", () => {
  const tag2 = `${tag}-b`;
  const ppl: Record<string, Actor> = {};
  const ids: string[] = [];
  let seasonId = "";
  const camp = `קמפוס-${tag2}`;

  async function user(key: string, roles: Role[]) {
    const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag2}@example.test`, name: key, roles }).returning();
    ppl[key] = { userId: u!.id, roles };
    ids.push(u!.id);
  }
  async function makeLetter(n: string) {
    const l = await createLetterRequest(ppl.cm!, { seasonId, campus: camp, faculty: "משפטים", trackName: `מסלול ${n}`, trackNumber: `22700${n}`, advisorId: ppl.adv!.userId, registrationManagerId: ppl.rm!.userId });
    await uploadVersion(ppl.adv!, l.id, { docx, pdf: await pdf() });
    await submitLetter(ppl.adv!, l.id);
    return l.id;
  }
  async function toAcademic(id: string) {
    await decideLetter(ppl.rm!, id, { seat: "RM", kind: "APPROVED" });
    await decideLetter(ppl.vp!, id, { seat: "VP", kind: "APPROVED" });
  }

  beforeAll(async () => {
    setFileStore({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k)! });
    setMailer({ send: async () => {} });
    await user("cm", ["CONTROL_MANAGER"]);
    await user("vp", ["VP_REGISTRATION"]);
    await user("adv", ["CONTROL_ADVISOR"]);
    await user("adv2", ["CONTROL_ADVISOR"]);
    await user("rm", ["REGISTRATION_MANAGER"]);
    await user("rm2", ["REGISTRATION_MANAGER"]);
    await user("shuli", ["CONTROL_ADVISOR", "REGISTRATION_MANAGER"]);
    await user("dean", []); // someone with no role at all: only ever attached to a track by the control manager
    seasonId = (await createSeason(ppl.cm!, { name: `עונה ${tag2}` })).id;
  });

  afterAll(async () => {
    setMailer(undefined);
    const db = getDb();
    const extra = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, [`head-${tag2}@example.test`]));
    const all = [...ids, ...extra.map((u) => u.id)];
    await db.delete(schema.sessions).where(inArray(schema.sessions.userId, all));
    await db.delete(schema.academicLinks).where(inArray(schema.academicLinks.userId, all));
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, all));
    await db.delete(schema.users).where(inArray(schema.users.id, all));
    await closeDb();
  });

  it("the control manager skips the academic step; the VP signs; the control manager reopens; everyone approves again", async () => {
    const id = await makeLetter("1");
    await toAcademic(id);
    await expect(skipAcademicRound(ppl.adv!, id, undefined)).rejects.toThrow();
    await skipAcademicRound(ppl.cm!, id, "מסלול ישן, אין צורך");
    expect(await phaseOf(id)).toBe("FINAL");
    await decideLetter(ppl.vp!, id, { seat: "FINAL", kind: "APPROVED" });
    expect(await phaseOf(id)).toBe("APPROVED");
    await expect(reopenLetter(ppl.adv!, id, undefined)).rejects.toThrow();
    await reopenLetter(ppl.cm!, id, "טעות במחיר");
    expect(await phaseOf(id)).toBe("FINAL");
    await resetLetterApprovals(ppl.cm!, id, "שינוי מהותי");
    const v = await viewOf(id);
    expect(v.phase).toBe("REVIEW");
    expect(v.holder.userIds).toEqual([ppl.rm!.userId]); // the manager first again
  });

  it("a reviewer takes back an approval; the control manager decides in the manager's place", async () => {
    const id = await makeLetter("2");
    await decideLetter(ppl.rm!, id, { seat: "RM", kind: "APPROVED" });
    await retractApproval(ppl.rm!, id, "RM");
    expect((await viewOf(id)).holder.userIds).toEqual([ppl.rm!.userId]);
    await decideLetter(ppl.cm!, id, { seat: "RM", kind: "APPROVED" });
    const room = await getLetterRoom(ppl.cm!, id);
    expect(room.seats.find((s) => s.key === "RM")).toMatchObject({ decidedByName: "cm", onBehalfOfName: "rm" });
  });

  it("an academic approver who asks for changes sends it to the advisor, then to final approval, not back", async () => {
    const id = await makeLetter("3");
    await toAcademic(id);
    const issued = await inviteAcademic(ppl.adv!, id, { name: "ראש חוג", email: `head-${tag2}@example.test` });
    const opened = await redeemLink(issued.url.split("/a/")[1]!, null);
    if (!opened.ok) throw new Error("link");
    const s = (await getSessionUser(opened.token))!;
    const head: Actor = { userId: s.id, roles: s.roles };
    await createComment(head, id, { anchor: anchor(), body: "להחליף שם" });
    await decideLetter(head, id, { seat: `ACADEMIC:${s.id}`, kind: "CHANGES" });
    expect((await viewOf(id)).state).toBe("FIXING");
    const c = (await getLetterRoom(ppl.adv!, id)).comments[0]!;
    await setCommentStatus(ppl.adv!, c.id, { to: "RESOLVED_FIXED" });
    await uploadVersion(ppl.adv!, id, { docx, pdf: await pdf() });
    await resubmitLetter(ppl.adv!, id);
    expect(await phaseOf(id)).toBe("FINAL");
  });

  it("an advisor who is also the registration manager is approved by submitting; the VP is still required", async () => {
    const l = await createLetterRequest(ppl.cm!, { seasonId, campus: camp, faculty: "בריאות", trackName: "שולי", trackNumber: "227009", advisorId: ppl.shuli!.userId, registrationManagerId: ppl.shuli!.userId });
    await uploadVersion(ppl.shuli!, l.id, { docx, pdf: await pdf() });
    await submitLetter(ppl.shuli!, l.id);
    const v = await viewOf(l.id);
    expect(v.seats[0]).toMatchObject({ key: "RM", status: "approved", auto: true });
    expect(v.holder.userIds).toEqual([ppl.vp!.userId]);
  });

  it("extra people on a track share it: another advisor prepares, another manager reviews", async () => {
    const id = await makeLetter("4");
    await expect(addLetterPerson(ppl.adv!, id, ppl.adv2!.userId, "ADVISOR")).rejects.toThrow(); // only the control manager
    await addLetterPerson(ppl.cm!, id, ppl.adv2!.userId, "ADVISOR");
    await addLetterPerson(ppl.cm!, id, ppl.rm2!.userId, "MANAGER");
    expect((await listLetters(ppl.adv2!, seasonId)).some((l) => l.id === id)).toBe(true);
    expect((await listLetters(ppl.rm2!, seasonId)).some((l) => l.id === id)).toBe(true);
    await decideLetter(ppl.rm2!, id, { seat: "RM", kind: "CHANGES", note: "לתקן" }); // a second manager may decide
    expect((await viewOf(id)).holder.userIds).toEqual([ppl.adv!.userId, ppl.adv2!.userId]);
    await uploadVersion(ppl.adv2!, id, { docx, pdf: await pdf() }); // the other advisor fixes
    await resubmitLetter(ppl.adv2!, id);
    expect((await viewOf(id)).holder.userIds).toEqual([ppl.rm!.userId, ppl.rm2!.userId]);
  });

  it("a commenter attached to a track sees it and comments, nothing waits for them, and the control manager can remove them", async () => {
    const id = await makeLetter("8"); // in review, waiting for the registration manager
    expect((await listLetters(ppl.dean!, seasonId)).some((l) => l.id === id)).toBe(false);
    await expect(addLetterPerson(ppl.adv!, id, ppl.dean!.userId, "COMMENTER")).rejects.toThrow(); // only the control manager
    await addLetterPerson(ppl.cm!, id, ppl.dean!.userId, "COMMENTER");
    expect((await notes(ppl.dean!.userId, "ADDED_TO_LETTER")).length).toBe(1);
    const room = await getLetterRoom(ppl.dean!, id);
    expect(room.can).toMatchObject({ view: true, comment: true, reply: true });
    expect(room.can.decide).toEqual([]);
    expect((await viewOf(id)).holder.userIds).toEqual([ppl.rm!.userId]); // still the manager's turn, not theirs
    const c = await createComment(ppl.dean!, id, { anchor: anchor(), body: "שימו לב לתאריך" });
    expect(c.publishedAt).not.toBeNull(); // no draft: a commenter's mark is published at once
    expect((await viewOf(id)).holder.userIds).toEqual([ppl.adv!.userId]); // it gives the advisor something to fix
    await expect(decideLetter(ppl.dean!, id, { seat: "RM", kind: "APPROVED" })).rejects.toThrow();
    await removeLetterPerson(ppl.cm!, id, ppl.dean!.userId, "COMMENTER");
    await expect(getLetterRoom(ppl.dean!, id)).rejects.toThrow();
  });

  it("changing a track's registration manager moves a waiting letter to the new person and tells them", async () => {
    const id = await makeLetter("10");
    await setLetterRegistrationManager(ppl.cm!, id, ppl.rm2!.userId);
    expect((await viewOf(id)).holder.userIds).toEqual([ppl.rm2!.userId]);
    expect((await notes(ppl.rm2!.userId, "YOUR_TURN")).length).toBeGreaterThan(0);
    expect((await listLetters(ppl.rm!, seasonId)).some((l) => l.id === id)).toBe(false); // the old manager no longer has it
  });

  it("copying a season keeps each track's own people, for whoever is still active", async () => {
    const id = await makeLetter("11");
    await addLetterPerson(ppl.cm!, id, ppl.rm2!.userId, "MANAGER");
    await addLetterPerson(ppl.cm!, id, ppl.dean!.userId, "COMMENTER");
    const next = await createSeason(ppl.cm!, { name: `עונה הבאה ${tag2}`, copyFromSeasonId: seasonId, codeFrom: "227", codeTo: "228" });
    const db = getDb();
    try {
      const copied = (await db.select().from(schema.letterRequests).where(eq(schema.letterRequests.seasonId, next.id))).find((r) => r.trackNumber === "2280011")!;
      expect(copied).toMatchObject({ advisorId: ppl.adv!.userId, registrationManagerId: ppl.rm!.userId, phase: "DRAFT", latestVersion: 0 });
      const extras = await db.select().from(schema.letterPeople).where(eq(schema.letterPeople.letterId, copied.id));
      expect(extras.map((e) => `${e.kind}:${e.userId}`).sort()).toEqual([`COMMENTER:${ppl.dean!.userId}`, `MANAGER:${ppl.rm2!.userId}`].sort());
    } finally {
      await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, next.id));
      await db.delete(schema.seasons).where(eq(schema.seasons.id, next.id));
    }
  });

  it("marks come as a note, an X or a line, with a colour; a reviewer's draft can be moved, recoloured and removed, a published one cannot", async () => {
    const id = await makeLetter("7");
    await expect(createComment(ppl.rm!, id, { anchor: anchor(), kind: "NOTE" })).rejects.toThrow(/לכתוב את ההערה/); // a note needs words
    await expect(createComment(ppl.rm!, id, { anchor: anchor(), body: "x", color: "red" })).rejects.toThrow(/הצבע/);
    const x = await createComment(ppl.rm!, id, { anchor: anchor(), kind: "X", color: "#d32f2f" }); // a mark without words
    const line = await createComment(ppl.rm!, id, { anchor: anchor(), kind: "LINE", points: [[0.1, 0.5], [0.6, 0.5]], color: "#1565c0" });
    expect(x).toMatchObject({ kind: "X", body: "", color: "#d32f2f" });
    expect(line).toMatchObject({ kind: "LINE", points: [[0.1, 0.5], [0.6, 0.5]] });
    expect(line.width).toBeCloseTo(0.5);
    expect(line.height).toBeGreaterThan(0);
    await expect(createComment(ppl.rm!, id, { anchor: anchor(), kind: "LINE", points: [[0.1, 0.5], [1.4, 0.5]] })).rejects.toThrow();

    const moved = await updateDraftComment(ppl.rm!, line.id, { points: [[0.2, 0.6], [0.7, 0.62]], color: "#2e7d32" });
    expect(moved).toMatchObject({ color: "#2e7d32", points: [[0.2, 0.6], [0.7, 0.62]] });
    await expect(updateDraftComment(ppl.adv!, line.id, { color: "#000000" })).rejects.toThrow(); // only the author
    await deleteDraftComment(ppl.rm!, x.id);
    await decideLetter(ppl.rm!, id, { seat: "RM", kind: "APPROVED" }); // publishes the line
    await expect(updateDraftComment(ppl.rm!, line.id, { color: "#000000" })).rejects.toThrow(); // published now
    const room = await getLetterRoom(ppl.adv!, id);
    expect(room.comments.map((c) => c.kind)).toEqual(["LINE"]);
  });

  it("a version may be a PDF alone: it is stored, shown, sent to review, and has no Word file", async () => {
    const l = await createLetterRequest(ppl.cm!, { seasonId, campus: camp, faculty: "משפטים", trackName: "מסלול PDF בלבד", trackNumber: "227099", advisorId: ppl.adv!.userId, registrationManagerId: ppl.rm!.userId });
    const v = await uploadVersion(ppl.adv!, l.id, { pdf: await pdf(2), note: "רק PDF" });
    expect(v.docxKey).toBeNull();
    expect(v.pdfKey).toBeTruthy();
    expect(v.pageCount).toBe(2);
    await submitLetter(ppl.adv!, l.id);
    const room = await getLetterRoom(ppl.cm!, l.id);
    expect(room.versions[0]).toMatchObject({ number: 1, hasDocx: false });
    // A Word file may come with a later version; then it is there to download.
    const v2 = await uploadVersion(ppl.cm!, l.id, { docx, pdf: await pdf(2) });
    expect(v2.docxKey).toBeTruthy();
    expect((await getLetterRoom(ppl.cm!, l.id)).versions[0]).toMatchObject({ number: 2, hasDocx: true });
    // A file that is not a Word document is still refused when one is attached.
    await expect(uploadVersion(ppl.cm!, l.id, { docx: new Uint8Array([1, 2, 3]), pdf: await pdf(1) })).rejects.toThrow();
  });

  it("a reminder reaches whoever holds the letter; only the control manager and the VP can send it", async () => {
    const id = await makeLetter("5");
    await expect(remindHolders(ppl.adv!, id)).rejects.toThrow();
    expect(await remindHolders(ppl.vp!, id)).toEqual([ppl.rm!.userId]);
    expect((await getDb().select().from(schema.notifications).where(eq(schema.notifications.userId, ppl.rm!.userId))).some((n) => n.type === "REMINDER")).toBe(true);
  });

  it("reassigning the advisor moves the letter to her list", async () => {
    const id = await makeLetter("6");
    await expect(changeAdvisor(ppl.adv!, id, ppl.adv2!.userId)).rejects.toThrow();
    await changeAdvisor(ppl.cm!, id, ppl.adv2!.userId);
    expect((await listLetters(ppl.adv2!, seasonId)).some((l) => l.id === id)).toBe(true);
    expect((await listLetters(ppl.adv!, seasonId)).some((l) => l.id === id)).toBe(false);
  });
});
