// End-to-end walk through one letter's life against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setFileStore } from "../storage";
import { createComment, replyToComment, setCommentStatus } from "./comments";
import {
  approveLetter,
  createLetterRequest,
  createSeason,
  performTransition,
  removeApprover,
  uploadVersion,
} from "./service";

const tag = `flow-${process.pid}-${Date.now()}`;
const files = new Map<string, Uint8Array>();
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

const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....[Content_Types].xml....")]);
async function pdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

async function stageOf(letterId: string) {
  const [l] = await getDb().select().from(schema.letterRequests).where(eq(schema.letterRequests.id, letterId));
  return l!.stage;
}

describe.skipIf(!process.env.DATABASE_URL)("a letter from upload to approved for distribution", () => {
  let seasonId = "";
  let letterId = "";

  beforeAll(async () => {
    setFileStore({
      put: async (k, b) => void files.set(k, b),
      get: async (k) => files.get(k)!,
    });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("ac1", ["ACADEMIC_APPROVER"]);
    await makeUser("ac2", ["ACADEMIC_APPROVER"]);
  });

  afterAll(async () => {
    const db = getDb();
    if (letterId) await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.createdBy, people.cm!.userId));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await closeDb();
  });

  it("runs the whole process with the agreed rules", async () => {
    const { cm, vp, adv, rm, ac1, ac2 } = people as Record<string, Actor>;
    seasonId = (await createSeason(cm!, { name: `תשפ"ז א' ${tag}` })).id;

    await expect(
      createLetterRequest(ac1!, {
        seasonId,
        campus: "x",
        faculty: "x",
        trackName: "x",
        trackNumber: "1",
        advisorId: adv!.userId,
        registrationManagerId: rm!.userId,
        vpId: vp!.userId,
        academicIds: [],
      }),
    ).rejects.toThrow(/הרשאה/);

    const letter = await createLetterRequest(adv!, {
      seasonId,
      campus: "קריית אונו",
      faculty: "משפטים",
      trackName: "משפטים",
      trackNumber: "101",
      advisorId: adv!.userId,
      registrationManagerId: rm!.userId,
      vpId: vp!.userId,
      academicIds: [ac1!.userId, ac2!.userId],
    });
    letterId = letter.id;

    await expect(performTransition(adv!, letterId, "SUBMIT_FOR_REVIEW")).rejects.toThrow();
    await expect(uploadVersion(rm!, letterId, { docx, pdf: await pdf() })).rejects.toThrow(/הרשאה/);
    await uploadVersion(adv!, letterId, { docx, pdf: await pdf() });
    expect(await performTransition(adv!, letterId, "SUBMIT_FOR_REVIEW")).toBe("INITIAL_REVIEW");
    expect(await performTransition(cm!, letterId, "INITIAL_APPROVE")).toBe("REGISTRATION_ROUND");

    // VP comments instead of approving; the advisor answers without a change.
    const c = await createComment(vp!, letterId, {
      anchor: { versionNumber: 1, page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      body: "הימים במכתב לא תקינים",
    });
    await replyToComment(rm!, c.id, "מסכים עם הסמנכ\"ל");
    await approveLetter(rm!, letterId);
    await approveLetter(vp!, letterId);
    expect(await stageOf(letterId)).toBe("REGISTRATION_ROUND"); // the open comment holds the round

    await expect(setCommentStatus(vp!, c.id, { to: "RESOLVED_NO_CHANGE", note: "x" })).rejects.toThrow(/הרשאה/);
    await setCommentStatus(adv!, c.id, { to: "RESOLVED_NO_CHANGE", note: "הימים כן תקינים" });
    expect(await stageOf(letterId)).toBe("ACADEMIC_ROUND");

    // A new version keeps earlier approvals; every remaining academic must approve.
    // The control manager removes one academic; the other's approval then completes the round
    // (and notifies the control manager, who is not the actor this time).
    await uploadVersion(adv!, letterId, { docx, pdf: await pdf(3), note: "עדכון תאריכים" });
    await expect(removeApprover(adv!, letterId, ac2!.userId, "ACADEMIC", "לא נדרש")).rejects.toThrow(/הרשאה/);
    await removeApprover(cm!, letterId, ac2!.userId, "ACADEMIC", "לא נדרש");
    expect(await stageOf(letterId)).toBe("ACADEMIC_ROUND");
    await approveLetter(ac1!, letterId);
    expect(await stageOf(letterId)).toBe("FINAL_REVIEW");

    expect(await performTransition(cm!, letterId, "FINAL_APPROVE")).toBe("APPROVED");
    await expect(uploadVersion(adv!, letterId, { docx, pdf: await pdf() })).rejects.toThrow(/הרשאה/);

    const notes = await getDb()
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.letterId, letterId));
    const types = new Set(notes.map((n) => n.type));
    for (const t of ["SUBMITTED_FOR_REVIEW", "AWAITING_YOUR_APPROVAL", "NEW_COMMENT", "COMMENT_STATUS", "NEW_VERSION", "READY_FOR_FINAL", "APPROVED_FOR_DISTRIBUTION"])
      expect(types).toContain(t);
    expect(files.size).toBe(4); // two frozen DOCX + PDF pairs
  });

  it("copies tracks into a new season (new code year, current people), without versions", async () => {
    const copy = await createSeason(people.cm!, {
      name: `תשפ"ח א' ${tag}`,
      copyFromSeasonId: seasonId,
      codeFrom: "10",
      codeTo: "20",
    });
    const letters = await getDb()
      .select()
      .from(schema.letterRequests)
      .where(eq(schema.letterRequests.seasonId, copy.id));
    expect(letters).toHaveLength(1);
    expect(letters[0]!.stage).toBe("DRAFT");
    expect(letters[0]!.latestVersion).toBe(0);
    expect(letters[0]!.trackNumber).toBe("201"); // 101 -> 201
    const assigned = await getDb()
      .select()
      .from(schema.approverAssignments)
      .where(eq(schema.approverAssignments.letterId, letters[0]!.id));
    // The academic approver is chosen again each season; the registration manager carries over here
    // because no campus or faculty default is set for this test's campus.
    expect(new Set(assigned.map((a) => a.slot))).toEqual(new Set(["REGISTRATION_MANAGER", "VP_REGISTRATION"]));
    expect(assigned.find((a) => a.slot === "REGISTRATION_MANAGER")?.userId).toBe(people.rm!.userId);
    expect(assigned.some((a) => a.slot === "VP_REGISTRATION" && a.userId === people.vp!.userId)).toBe(true);
    await getDb().delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, copy.id));
  });
});
