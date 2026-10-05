// The SharePoint working file in the letter flow, against a real PostgreSQL (DATABASE_URL) and
// a fake SharePoint library. What Graph itself does is covered in m365.test.ts.
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { and, eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { FakeDocumentHost } from "@/test/fake-document-host";
import { setDocumentHost } from "../m365/config";
import { emptyLetterDocx } from "../m365/template";
import { setFileStore } from "../storage";
import { currentCTag, liveFileStatus, openInWord, versionFromSharePoint } from "./live-file";
import { createLetterRequest, createSeason, performTransition, uploadVersion } from "./service";
import { loadLetter } from "./state";

const tag = `live-${process.pid}-${Date.now()}`;
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
  const { adv, rm, vp } = people;
  const letter = await createLetterRequest(adv!, {
    seasonId,
    campus: "תל אביב",
    faculty: "משפטים",
    trackName: "משפטים",
    trackNumber: String(++track),
    advisorId: adv!.userId,
    registrationManagerId: rm!.userId,
    vpId: vp!.userId,
    academicIds: [],
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
    const db = getDb();
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, userIds));
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
    expect(decodeURIComponent(r.sharepointWebUrl!)).toContain(`תל אביב/${track} - משפטים.docx`);
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
      { seasonName, campus: "תל אביב", trackNumber: String(track), trackName: "משפטים" },
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
    expect(files.get(v.docxKey)).toEqual(docx("edited in Word"));
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

  async function approve(id: string) {
    const { adv, cm } = people;
    await uploadVersion(adv!, id, { docx: docx("final"), pdf: await pdf() });
    await openInWord(adv!, id);
    while ((await row(id)).stage !== "FINAL_REVIEW") await performTransition(cm!, id, "FORCE_ADVANCE", "בדיקה");
    return performTransition(cm!, id, "FINAL_APPROVE");
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

    expect(await performTransition(people.cm!, id, "REOPEN", "תיקון אחרון")).toBe("FINAL_REVIEW");
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
});
