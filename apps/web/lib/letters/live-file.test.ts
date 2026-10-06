// The SharePoint working file in the letter flow, against a real PostgreSQL (DATABASE_URL) and
// a fake SharePoint library. What Graph itself does is covered in m365.test.ts.
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { and, eq, inArray, or } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { FakeDocumentHost } from "@/test/fake-document-host";
import { setDocumentHost } from "../m365/config";
import { emptyLetterDocx } from "../m365/template";
import { setFileStore } from "../storage";
import { currentCTag, liveFileStatus, openInWord, versionFromSharePoint } from "./live-file";
import { syncLiveFileLock } from "./live-file-lock";
import { createLetterRequest, createSeason, decideLetter, reopenLetter, skipAcademicRound, submitLetter, uploadVersion } from "./service";
import { loadLetter } from "./state";

const tag = `live-${process.pid}-${Date.now()}`;
const campus = `תל אביב ${tag}`;
const files = new Map<string, Uint8Array>();
const people: Record<string, Actor> = {};
const userIds: string[] = [];
let seasonId = "";
let seasonName = "";
let track = 0;

async function makeUser(key: string, roles: Role[]) {
  const [u] = await getDb()
    .insert(schema.users)
    .values({ email: `${key}-${tag}@example.test`, name: key, roles })
    .returning();
  people[key] = { userId: u!.id, roles };
  userIds.push(u!.id);
}

const docx = (text: string) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from(`..[Content_Types].xml..${text}`)]);
async function pdf() {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

async function newLetter() {
  const { adv, rm } = people;
  const letter = await createLetterRequest(adv!, {
    seasonId,
    campus,
    faculty: "משפטים",
    trackName: "משפטים",
    trackNumber: String(++track),
    advisorId: adv!.userId,
    registrationManagerId: rm!.userId,
  });
  return letter.id;
}

const row = async (id: string) => (await loadLetter(getDb(), id)).row;
const auditTypes = async (id: string) =>
  (await getDb().select().from(schema.auditEvents).where(eq(schema.auditEvents.letterId, id))).map((e) => e.type);

describe.skipIf(!process.env.DATABASE_URL)("SharePoint working file", () => {
  let host: FakeDocumentHost;

  beforeAll(async () => {
    setFileStore({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k)! });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    seasonName = `תשפ"ז ${tag}`;
    seasonId = (await createSeason(people.cm!, { name: seasonName })).id;
  });

  afterEach(() => setDocumentHost(undefined));

  afterAll(async () => {
    setFileStore(undefined);
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
          inArray(schema.auditEvents.actorId, userIds),
          eq(schema.auditEvents.seasonId, seasonId),
          ...(letters.length ? [inArray(schema.auditEvents.letterId, letters.map((l) => l.id))] : []),
        ),
      );
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await closeDb();
  });

  function useHost(locks = true) {
    host = new FakeDocumentHost(locks);
    setDocumentHost(host);
    return host;
  }

  it("is off without Microsoft 365: nothing to show, nothing to create", async () => {
    setDocumentHost(null);
    const id = await newLetter();
    await expect(openInWord(people.adv!, id)).rejects.toThrow(/Microsoft 365/);
    expect(await liveFileStatus(await row(id))).toBeNull();
    expect(await currentCTag(id)).toBeUndefined();
  });

  it("creates the file from an empty page when there is no version yet, once", async () => {
    useHost();
    const id = await newLetter();
    await expect(openInWord(people.rm!, id)).rejects.toThrow(/הרשאה/);

    const first = await openInWord(people.adv!, id);
    expect(first.created).toBe(true);
    const r = await row(id);
    expect(first.url).toBe(`ms-word:ofe|u|${r.sharepointWebUrl}`);
    expect(decodeURIComponent(r.sharepointWebUrl!)).toContain(`${campus}/${track} - משפטים.docx`);
    expect(host.files.get(r.sharepointItemId!)!.docx).toEqual(emptyLetterDocx());

    expect(await openInWord(people.cm!, id)).toEqual({ url: first.url, created: false });
    expect(host.files.size).toBe(1);
    expect(await auditTypes(id)).toContain("SHAREPOINT_FILE_CREATED");
  });

  it("creates the file from the latest version, with no changes pending", async () => {
    useHost();
    const id = await newLetter();
    await uploadVersion(people.adv!, id, { docx: docx("v1"), pdf: await pdf() });
    await uploadVersion(people.adv!, id, { docx: docx("v2"), pdf: await pdf() });
    await openInWord(people.adv!, id);
    const r = await row(id);
    expect(host.files.get(r.sharepointItemId!)!.docx).toEqual(docx("v2"));
    expect(await liveFileStatus(r)).toMatchObject({ changed: false, lastModifiedBy: "advisor@college.ac.il" });
  });

  it("links a file already at the letter's path instead of failing", async () => {
    useHost();
    const id = await newLetter();
    const itemId = host.seed(
      { seasonName, campus, trackNumber: String(track), trackName: "משפטים" },
      docx("left over"),
    );
    expect((await openInWord(people.adv!, id)).created).toBe(true);
    const r = await row(id);
    expect(r.sharepointItemId).toBe(itemId);
    expect((await liveFileStatus(r))!.changed).toBe(true); // unknown content: offer a version
  });

  it("turns the saved Word file into an official version with Microsoft's PDF", async () => {
    useHost();
    const id = await newLetter();
    await uploadVersion(people.adv!, id, { docx: docx("v1"), pdf: await pdf() });
    await openInWord(people.adv!, id);
    const itemId = (await row(id)).sharepointItemId!;

    await expect(versionFromSharePoint(people.adv!, id, undefined)).rejects.toThrow(/אין שינויים/);
    host.save(itemId, docx("edited in Word"));
    expect((await liveFileStatus(await row(id)))!.changed).toBe(true);

    await expect(versionFromSharePoint(people.rm!, id, undefined)).rejects.toThrow(/הרשאה/);
    const v = await versionFromSharePoint(people.adv!, id, "תיקון שכר לימוד");
    expect(v).toMatchObject({ number: 2, pdfSource: "GRAPH", note: "תיקון שכר לימוד", pageCount: 1 });
    expect(files.get(v.docxKey!)).toEqual(docx("edited in Word"));
    expect((await liveFileStatus(await row(id)))!.changed).toBe(false);
    await expect(versionFromSharePoint(people.adv!, id, undefined)).rejects.toThrow(/אין שינויים/);
  });

  it("refuses a version when the file is saved while it is being read", async () => {
    useHost();
    const id = await newLetter();
    await openInWord(people.adv!, id);
    const itemId = (await row(id)).sharepointItemId!;
    host.save(itemId, docx("first"));
    host.duringConvert = () => host.save(itemId, docx("second"));
    await expect(versionFromSharePoint(people.adv!, id, undefined)).rejects.toThrow(/השתנה בזמן/);
    expect((await row(id)).latestVersion).toBe(0);
  });

  it("explains a missing file instead of failing silently", async () => {
    useHost();
    const id = await newLetter();
    await openInWord(people.adv!, id);
    host.files.clear();
    await expect(liveFileStatus(await row(id))).rejects.toThrow(/לא נמצא ב-SharePoint/);
  });

  it("reads the content tag for versions saved by the add-in", async () => {
    useHost();
    const id = await newLetter();
    expect(await currentCTag(id)).toBeUndefined(); // no file yet
    await openInWord(people.adv!, id);
    const r = await row(id);
    host.save(r.sharepointItemId!, docx("from the add-in"));
    const cTag = await currentCTag(id);
    await uploadVersion(people.adv!, id, { docx: docx("from the add-in"), pdf: await pdf(), pdfSource: "ADDIN", sharepointCTag: cTag });
    expect((await liveFileStatus(await row(id)))!.changed).toBe(false);
  });

  /** Takes a letter the whole way: prepared, reviewed, academic step skipped, signed. Returns its phase. */
  async function approve(id: string) {
    const { adv, cm, rm, vp } = people;
    await uploadVersion(adv!, id, { docx: docx("final"), pdf: await pdf() });
    await openInWord(adv!, id);
    await submitLetter(adv!, id);
    await decideLetter(rm!, id, { seat: "RM", kind: "APPROVED" });
    await decideLetter(vp!, id, { seat: "VP", kind: "APPROVED" });
    expect((await row(id)).phase).toBe("ACADEMIC");
    await skipAcademicRound(cm!, id, "בדיקה");
    // Nothing is locked on the way: only reaching APPROVED locks the file.
    expect(host.lockCalls).toEqual([]);
    await decideLetter(vp!, id, { seat: "FINAL", kind: "APPROVED" });
    return (await row(id)).phase;
  }

  it("locks the file at final approval and unlocks it on reopen", async () => {
    useHost();
    const id = await newLetter();
    expect(await approve(id)).toBe("APPROVED");
    const itemId = (await row(id)).sharepointItemId!;
    expect(host.lockCalls).toEqual([true]);
    expect(host.files.get(itemId)!.readOnly).toBe(true);
    // No more editing from the app: "Edit in Word" is hidden because versions cannot be added.
    await expect(openInWord(people.adv!, id)).rejects.toThrow(/הרשאה/);
    await expect(versionFromSharePoint(people.cm!, id, undefined)).rejects.toThrow(/הרשאה/);

    await reopenLetter(people.cm!, id, "תיקון אחרון");
    expect((await row(id)).phase).toBe("FINAL");
    expect(host.lockCalls).toEqual([true, false]);
    expect(host.files.get(itemId)!.readOnly).toBe(false);
    const types = await auditTypes(id);
    expect(types).toContain("SHAREPOINT_FILE_LOCKED");
    expect(types).toContain("SHAREPOINT_FILE_UNLOCKED");
  });

  it("approves even when the file cannot be locked, and records why", async () => {
    useHost();
    host.lockError = new Error("423 Locked: the file is open");
    const id = await newLetter();
    expect(await approve(id)).toBe("APPROVED");
    const [failed] = await getDb()
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.letterId, id), eq(schema.auditEvents.type, "SHAREPOINT_LOCK_FAILED")));
    expect(failed!.data).toMatchObject({ readOnly: true, error: "423 Locked: the file is open" });
  });

  it("only hides editing when the host does not lock files", async () => {
    useHost(false);
    const id = await newLetter();
    expect(await approve(id)).toBe("APPROVED");
    expect(host.lockCalls).toEqual([]);
    expect(await auditTypes(id)).not.toContain("SHAREPOINT_FILE_LOCKED");
  });
  it("locks only on the way into APPROVED and unlocks only on the way out", async () => {
    const h = useHost();
    const id = await newLetter();
    await openInWord(people.adv!, id);
    const itemId = (await row(id)).sharepointItemId!;
    const actor = people.cm!.userId;
    const moves = [
      ["DRAFT", "REVIEW"],
      ["REVIEW", "ACADEMIC"],
      ["ACADEMIC", "FINAL"],
      ["FINAL", "FINAL"],
      ["APPROVED", "APPROVED"],
    ] as const;
    for (const [from, to] of moves) await syncLiveFileLock(id, from, to, actor, { host: h });
    expect(h.lockCalls).toEqual([]);
    await syncLiveFileLock(id, "FINAL", "APPROVED", actor, { host: h });
    expect(h.files.get(itemId)!.readOnly).toBe(true);
    await syncLiveFileLock(id, "APPROVED", "REVIEW", actor, { host: h }); // reopened and sent back to review
    expect(h.lockCalls).toEqual([true, false]);
    expect(h.files.get(itemId)!.readOnly).toBe(false);
  });

  it("does nothing without Microsoft 365 or without a working file", async () => {
    const h = useHost();
    const id = await newLetter(); // no SharePoint file yet
    await syncLiveFileLock(id, "FINAL", "APPROVED", people.cm!.userId, { host: h });
    await syncLiveFileLock(id, "FINAL", "APPROVED", people.cm!.userId, { host: null });
    expect(h.lockCalls).toEqual([]);
    expect(await auditTypes(id)).not.toContain("SHAREPOINT_FILE_LOCKED");
  });
});
