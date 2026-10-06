// The add-in's route handlers against a real PostgreSQL (DATABASE_URL), with the Entra token
// check replaced by a stub. Everything after the token check is the real code path.
import { closeDb, getDb, schema } from "@al/db";
import { flowView, type Actor, type Role } from "@al/domain";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getLetter, OPTIONS as letterOptions } from "@/app/api/addin/letter/route";
import { POST as postVersion } from "@/app/api/addin/letters/[id]/versions/route";
import { GET as getSnapshot } from "@/app/api/addin/comments/[id]/snapshot/route";
import { FakeDocumentHost } from "@/test/fake-document-host";
import { setTokenVerifier, TokenError } from "../auth/entra";
import { setDocumentHost } from "../m365/config";
import { sha256, setFileStore } from "../storage";
import { createComment, setCommentStatus } from "../letters/comments";
import { createLetterRequest, createSeason, decideLetter } from "../letters/service";
import { loadLetter } from "../letters/state";
import { findLetterIdByDocumentUrl } from "./letters";

const tag = `addin-${process.pid}-${Date.now()}`;
const campus = `תל אביב ${tag}`;
const ORIGIN = "https://addin.college.test";
const BASE = "https://app.college.test";
const files = new Map<string, Uint8Array>();
const people: Record<string, Actor & { email: string }> = {};
const userIds: string[] = [];

const storedUrl = `https://college.sharepoint.com/sites/letters/Shared%20Documents/${tag}/123%20-%20%D7%9E%D7%A9%D7%A4%D7%98%D7%99%D7%9D.docx`;
const wordUrl = `https://college.sharepoint.com/sites/letters/Shared Documents/${tag}/123 - משפטים.docx`;

async function makeUser(key: string, roles: Role[]) {
  const email = `${key}-${tag}@example.test`;
  const [u] = await getDb().insert(schema.users).values({ email, name: `משתמש ${key}`, roles }).returning();
  people[key] = { userId: u!.id, roles, email };
  userIds.push(u!.id);
}

/** Bearer tokens are "<user key>.tok.en"; the stub maps them back to the user's email. */
const bearer = (key: string) => `Bearer ${key}.tok.en`;

const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....[Content_Types].xml....word/document.xml")]);
async function pdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function req(path: string, init: { method?: string; who?: string; origin?: string | null; body?: FormData; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.who) headers.set("authorization", bearer(init.who));
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  return new NextRequest(`${BASE}${path}`, { method: init.method ?? "GET", headers, body: init.body });
}

async function uploadForm(opts: { documentUrl?: string; submit?: boolean; note?: string } = {}) {
  const form = new FormData();
  form.set("docx", new Blob([docx]), "letter.docx");
  form.set("pdf", new Blob([new Uint8Array(await pdf())]), "letter.pdf");
  form.set("note", opts.note ?? "");
  form.set("submit", String(opts.submit ?? false));
  form.set("documentUrl", opts.documentUrl ?? wordUrl);
  return form;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!process.env.DATABASE_URL)("Word add-in API", () => {
  let letterId = "";
  let seasonId = "";

  beforeAll(async () => {
    process.env.ADDIN_ORIGIN = ORIGIN;
    setFileStore({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k)! });
    setTokenVerifier(async (token) => {
      const who = Object.values(people).find((p) => token.startsWith(`${p.email.split("-")[0]}.`));
      if (!who) throw new TokenError("unknown");
      return { email: who.email.toUpperCase(), objectId: null, tenantId: "t", name: null };
    });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("ac", ["ACADEMIC_APPROVER"]);
    await makeUser("stranger", ["ACADEMIC_APPROVER"]);

    const season = await createSeason(people.cm!, { name: `עונה ${tag}` });
    seasonId = season.id;
    const letter = await createLetterRequest(people.cm!, {
      seasonId,
      campus,
      faculty: "משפטים",
      trackName: "משפטים",
      trackNumber: "123",
      advisorId: people.adv!.userId,
      registrationManagerId: people.rm!.userId,
    });
    letterId = letter.id;
    await getDb()
      .update(schema.letterRequests)
      .set({ sharepointWebUrl: storedUrl, sharepointItemId: `item-${tag}`, sharepointDriveId: "drive" })
      .where(eq(schema.letterRequests.id, letterId));
  });

  afterAll(async () => {
    setTokenVerifier(undefined);
    setFileStore(undefined);
    const db = getDb();
    if (letterId) {
      await db.delete(schema.auditEvents).where(eq(schema.auditEvents.letterId, letterId));
      await db.delete(schema.letterRequests).where(eq(schema.letterRequests.id, letterId));
    }
    await db.delete(schema.auditEvents).where(eq(schema.auditEvents.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.units).where(eq(schema.units.campus, campus));
    await db.delete(schema.campuses).where(eq(schema.campuses.name, campus));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, userIds));
    await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await closeDb();
  });

  it("finds the open letter by the URL Word reports, with what the pane needs", async () => {
    const res = await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(`${wordUrl}?web=1`)}`, { who: "adv" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const { letter } = await res.json();
    expect(letter).toMatchObject({
      id: letterId,
      trackNumber: "123",
      campus,
      faculty: "משפטים",
      seasonName: `עונה ${tag}`,
      stage: "DRAFT",
      stageLabel: "בהכנה",
      latestVersion: 0,
      openComments: [],
      canUpload: true,
    });
    // The registration manager sees the letter but may not save versions of it.
    const rm = await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(wordUrl)}`, { who: "rm" }));
    expect((await rm.json()).letter).toMatchObject({ id: letterId, canUpload: false, canSubmit: false });
  });

  // באג ב-lib/addin/letters.ts (letterForAddin): canSubmit = abilities().submit, שדורש גרסה קיימת
  // (NO_VERSION). בטיוטה חדשה כפתור "שמור והעבר לבדיקה" מוסתר, אף שהוא עצמו שומר את הגרסה
  // לפני השליחה (ונתיב ההעלאה בודק רק הרשאות). כשיתוקן: להחליף ל-it רגיל.
  it("offers 'save and submit' on a fresh draft, since that button saves the version first", async () => {
    const res = await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(wordUrl)}`, { who: "adv" }));
    expect((await res.json()).letter).toMatchObject({ latestVersion: 0, canSubmit: true });
  });

  it("falls back to the drive item when the URL form differs (Office viewer link)", async () => {
    const viewer = "https://college.sharepoint.com/sites/letters/_layouts/15/Doc.aspx?sourcedoc={0000}&file=x.docx";
    expect(await findLetterIdByDocumentUrl(viewer)).toBeNull();
    const resolve = async () => ({ driveId: "drive", itemId: `item-${tag}` });
    expect(await findLetterIdByDocumentUrl(viewer, { resolve })).toBe(letterId);
    expect(await findLetterIdByDocumentUrl(viewer, { resolve: async () => ({ driveId: "other", itemId: `item-${tag}` }) })).toBeNull();
  });

  it("answers 404 with a Hebrew message for a document that is not a letter", async () => {
    const res = await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(wordUrl.replace("123", "999"))}`, { who: "adv" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/לא מזוהה/);
  });

  it("hides letters the user may not view", async () => {
    const res = await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(wordUrl)}`, { who: "stranger" }));
    expect(res.status).toBe(404);
  });

  it("requires a bearer token and the add-in origin", async () => {
    expect((await getLetter(req(`/api/addin/letter?url=x`))).status).toBe(401);
    const cookieOnly = await getLetter(req(`/api/addin/letter?url=x`, { headers: { cookie: "al_session=abc" } }));
    expect(cookieOnly.status).toBe(401);
    const evil = await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(wordUrl)}`, { who: "adv", origin: "https://evil.test" }));
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers the CORS preflight only for the add-in origin", async () => {
    const ok = letterOptions(req("/api/addin/letter", { method: "OPTIONS" }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(letterOptions(req("/api/addin/letter", { method: "OPTIONS", origin: "https://evil.test" })).status).toBe(403);
  });

  it("refuses an upload whose document is not this letter's file", async () => {
    const form = await uploadForm({ documentUrl: "C:\\Users\\adv\\Desktop\\123 - משפטים.docx" });
    const res = await postVersion(req(`/api/addin/letters/${letterId}/versions`, { method: "POST", who: "adv", body: form }), params(letterId));
    expect(res.status).toBe(409);
    const [l] = await getDb().select().from(schema.letterRequests).where(eq(schema.letterRequests.id, letterId));
    expect(l!.latestVersion).toBe(0);
  });

  it("stores the Word-made DOCX and PDF as a new version, byte for byte", async () => {
    // With Microsoft 365 on, the SharePoint file's content tag is kept, so the letter page
    // does not report the add-in's save as unsaved changes.
    const host = new FakeDocumentHost();
    host.files.set(`item-${tag}`, { path: "x.docx", docx, cTag: 7, readOnly: false });
    setDocumentHost(host);
    const form = await uploadForm({ note: "תיקון שנת לימודים" });
    const res = await postVersion(req(`/api/addin/letters/${letterId}/versions`, { method: "POST", who: "adv", body: form }), params(letterId));
    setDocumentHost(undefined);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ versionNumber: 1, stage: "DRAFT", submitted: false, pageCount: 2 });
    const [v] = await getDb().select().from(schema.versions).where(eq(schema.versions.letterId, letterId));
    expect(v).toMatchObject({ number: 1, pdfSource: "ADDIN", note: "תיקון שנת לימודים", docxSha256: sha256(docx) });
    expect(files.get(v!.docxKey)).toEqual(docx);
    const [l] = await getDb().select().from(schema.letterRequests).where(eq(schema.letterRequests.id, letterId));
    expect(l!.sharepointVersionCTag).toBe(`"c:{item-${tag}},7"`);
  });

  it("does not let someone who may not submit use 'save and submit'", async () => {
    const res = await postVersion(
      req(`/api/addin/letters/${letterId}/versions`, { method: "POST", who: "rm", body: await uploadForm({ submit: true }) }),
      params(letterId),
    );
    expect(res.status).toBe(403);
  });

  it("saves and submits for review in one step", async () => {
    const res = await postVersion(
      req(`/api/addin/letters/${letterId}/versions`, { method: "POST", who: "adv", body: await uploadForm({ submit: true }) }),
      params(letterId),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ versionNumber: 2, stage: "REVIEW", stageLabel: "בבדיקה", submitted: true });
  });

  it("refuses bodies over the size limit before reading them", async () => {
    const res = await postVersion(
      req(`/api/addin/letters/${letterId}/versions`, {
        method: "POST",
        who: "adv",
        body: await uploadForm(),
        headers: { "content-length": String(200 * 1024 * 1024) },
      }),
      params(letterId),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/30MB/);
  });

  it("lists published open comments only, and serves their snapshot to viewers only", async () => {
    const paneOf = async (who: string) =>
      (await (await getLetter(req(`/api/addin/letter?url=${encodeURIComponent(wordUrl)}`, { who }))).json()).letter;
    // The manager's comment is a draft until he decides: the advisor does not see it yet.
    const comment = await createComment(
      people.rm!,
      letterId,
      { anchor: { versionNumber: 2, page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, body: "לתקן את התאריך", snapshotPng: png },
    );
    expect((await paneOf("adv")).openComments).toEqual([]);
    await decideLetter(people.rm!, letterId, { seat: "RM", kind: "CHANGES" });

    const letter = await paneOf("adv");
    expect(letter.openComments).toEqual([
      expect.objectContaining({ id: comment.id, authorName: "משתמש rm", page: 1, versionNumber: 2, status: "OPEN", hasSnapshot: true, body: "לתקן את התאריך" }),
    ]);
    expect(letter).toMatchObject({ stage: "REVIEW", stageLabel: "בתיקון", canUpload: true, canSubmit: true }); // fixing: "save and send the fixes back"

    const snap = await getSnapshot(req(`/api/addin/comments/${comment.id}/snapshot`, { who: "adv" }), params(comment.id));
    expect(snap.status).toBe(200);
    expect(snap.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await snap.arrayBuffer())).toEqual(png);

    const denied = await getSnapshot(req(`/api/addin/comments/${comment.id}/snapshot`, { who: "stranger" }), params(comment.id));
    expect(denied.status).toBe(404);
    const bad = await getSnapshot(req(`/api/addin/comments/not-a-uuid/snapshot`, { who: "adv" }), params("not-a-uuid"));
    expect(bad.status).toBe(404);
  });

  it("'save and submit' while fixing sends the fixes back to the reviewer who returned the letter", async () => {
    const [open] = await getDb().select().from(schema.comments).where(eq(schema.comments.letterId, letterId));
    // Comments still open: the version is saved, the sending is refused with the reason.
    const early = await postVersion(
      req(`/api/addin/letters/${letterId}/versions`, { method: "POST", who: "adv", body: await uploadForm({ submit: true }) }),
      params(letterId),
    );
    expect(early.status).toBe(201);
    expect(await early.json()).toMatchObject({ versionNumber: 3, submitted: false, submitError: expect.stringMatching(/להגיב/) });

    await setCommentStatus(people.adv!, open!.id, { to: "RESOLVED_FIXED", note: "תוקן" });
    const res = await postVersion(
      req(`/api/addin/letters/${letterId}/versions`, { method: "POST", who: "adv", body: await uploadForm({ submit: true, note: "תוקן התאריך" }) }),
      params(letterId),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ versionNumber: 4, stage: "REVIEW", stageLabel: "בבדיקה", submitted: true });
    const { input } = await loadLetter(getDb(), letterId);
    expect(flowView(input).holder.userIds).toEqual([people.rm!.userId]);
  });
});
