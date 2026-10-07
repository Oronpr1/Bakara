// Marks on the PDF (note, X, line) with a colour, against a real PostgreSQL (DATABASE_URL):
// what is checked when a mark is made or changed, and who sees it. Complements flow.test.ts.
import { closeDb, getDb, schema } from "@al/db";
import { flowView, type Actor, type Role } from "@al/domain";
import { eq, inArray, or } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setFileStore } from "../storage";
import { createComment, updateDraftComment } from "./comments";
import { getLetterRoom } from "./queries";
import { createLetterRequest, createSeason, decideLetter, submitLetter, uploadVersion } from "./service";
import { loadLetter } from "./state";

const tag = `marks-${process.pid}-${Date.now()}`;
const campus = `קמפוס-${tag}`;
const people: Record<string, Actor> = {};
const ids: string[] = [];
const files = new Map<string, Uint8Array>();
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....[Content_Types].xml....")]);

async function makeUser(key: string, roles: Role[]) {
  const [u] = await getDb().insert(schema.users).values({ email: `${key}-${tag}@example.test`, name: key, roles }).returning();
  people[key] = { userId: u!.id, roles };
  ids.push(u!.id);
}
async function pdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}
const box = (o: Partial<{ page: number; x: number; y: number; width: number; height: number }> = {}) => ({
  versionNumber: 1,
  page: 1,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.05,
  ...o,
});

describe.skipIf(!process.env.DATABASE_URL)("marks on the PDF: note, X and line", () => {
  let seasonId = "";
  let n = 0;

  /** A letter of this test, submitted: the registration manager's turn. */
  async function inReview() {
    const l = await createLetterRequest(people.cm!, {
      seasonId,
      campus,
      faculty: "משפטים",
      trackName: `מסלול ${++n}`,
      trackNumber: `22790000${n}`,
      advisorId: people.adv!.userId,
      registrationManagerId: people.rm!.userId,
    });
    await uploadVersion(people.adv!, l.id, { docx, pdf: await pdf() });
    await submitLetter(people.adv!, l.id);
    return l.id;
  }

  beforeAll(async () => {
    setFileStore({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k)! });
    await makeUser("cm", ["CONTROL_MANAGER"]);
    await makeUser("vp", ["VP_REGISTRATION"]);
    await makeUser("adv", ["CONTROL_ADVISOR"]);
    await makeUser("rm", ["REGISTRATION_MANAGER"]);
    await makeUser("outsider", ["CONTROL_ADVISOR"]);
    seasonId = (await createSeason(people.cm!, { name: `עונה ${tag}` })).id;
  });

  afterAll(async () => {
    setFileStore(undefined);
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

  it("checks the colour: six-digit hex or none", async () => {
    const id = await inReview();
    for (const bad of ["red", "#abc", "#12345g", "rgb(0,0,0)", "#1234567"])
      await expect(createComment(people.rm!, id, { anchor: box(), kind: "X", color: bad })).rejects.toThrow(/הצבע/);
    expect(await createComment(people.rm!, id, { anchor: box(), kind: "X", color: "#ABCDEF" })).toMatchObject({ color: "#ABCDEF" });
    expect(await createComment(people.rm!, id, { anchor: box(), kind: "X" })).toMatchObject({ color: null, body: "" });
  });

  it("a note needs words; an X or a line may carry words too", async () => {
    const id = await inReview();
    await expect(createComment(people.rm!, id, { anchor: box(), body: "   " })).rejects.toThrow(/לכתוב את ההערה/);
    expect(await createComment(people.rm!, id, { anchor: box(), body: " לתקן " })).toMatchObject({ kind: "NOTE", body: "לתקן" });
    expect(await createComment(people.rm!, id, { anchor: box(), kind: "X", body: " למחוק את השורה " })).toMatchObject({ kind: "X", body: "למחוק את השורה" });
    const line = await createComment(people.rm!, id, { anchor: box(), kind: "LINE", points: [[0.2, 0.3], [0.4, 0.3]], body: "להזיז לכאן" });
    expect(line).toMatchObject({ kind: "LINE", body: "להזיז לכאן" });
  });

  it("a line's place is the box around its two points, whatever box is sent; it must stay on the page", async () => {
    const id = await inReview();
    const line = await createComment(people.rm!, id, { anchor: box({ x: 0.9, y: 0.9, width: 0.05, height: 0.05 }), kind: "LINE", points: [[0.6, 0.4], [0.2, 0.7]] });
    expect(line.x).toBeCloseTo(0.2);
    expect(line.y).toBeCloseTo(0.4);
    expect(line.width).toBeCloseTo(0.4);
    expect(line.height).toBeCloseTo(0.3);
    // A line along the page's right edge still has a box inside the page.
    const edge = await createComment(people.rm!, id, { anchor: box(), kind: "LINE", points: [[1, 0.1], [1, 0.5]] });
    expect(edge.x + edge.width).toBeLessThanOrEqual(1);
    expect(edge.width).toBeGreaterThan(0);
    for (const points of [[[0.1, 0.1]], [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]], [[-0.1, 0.1], [0.2, 0.2]]] as [number, number][][])
      await expect(createComment(people.rm!, id, { anchor: box(), kind: "LINE", points })).rejects.toThrow();
    await expect(createComment(people.rm!, id, { anchor: box({ page: 3 }), kind: "LINE", points: [[0.1, 0.1], [0.2, 0.2]] })).rejects.toThrow(); // the PDF has 2 pages
  });

  it("the author moves, resizes and recolours a draft; out-of-page places and other people are refused", async () => {
    const id = await inReview();
    const x = await createComment(people.rm!, id, { anchor: box(), kind: "X", color: "#d32f2f" });
    const moved = await updateDraftComment(people.rm!, x.id, { anchor: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 }, color: null });
    expect(moved).toMatchObject({ page: 1, x: 0.5, y: 0.5, width: 0.2, height: 0.1, color: null });
    expect(await updateDraftComment(people.rm!, x.id, { anchor: { page: 2, x: 0.1, y: 0.1, width: 0.1, height: 0.1 } })).toMatchObject({ page: 2 });
    await expect(updateDraftComment(people.rm!, x.id, { anchor: { x: 0.95, y: 0.5, width: 0.2, height: 0.1 } })).rejects.toThrow();
    await expect(updateDraftComment(people.rm!, x.id, { anchor: { page: 3, x: 0.1, y: 0.1, width: 0.1, height: 0.1 } })).rejects.toThrow();
    await expect(updateDraftComment(people.rm!, x.id, { color: "blue" })).rejects.toThrow(/הצבע/);
    await expect(updateDraftComment(people.cm!, x.id, { color: "#000000" })).rejects.toThrow(/הרשאה/);
    await expect(updateDraftComment(people.outsider!, x.id, { color: "#000000" })).rejects.toThrow(/הרשאה/);

    const note = await createComment(people.rm!, id, { anchor: box(), body: "ניסוח", suggestion: "במקום א׳ כתבו ב׳" });
    await expect(updateDraftComment(people.rm!, note.id, { body: " " })).rejects.toThrow(/לכתוב/);
    expect(await updateDraftComment(people.rm!, note.id, { body: "ניסוח חדש", suggestion: null })).toMatchObject({ body: "ניסוח חדש", suggestion: null });
    // Nothing to change: the draft comes back as it is.
    expect(await updateDraftComment(people.rm!, note.id, {})).toMatchObject({ id: note.id, body: "ניסוח חדש" });
  });

  it("a line moved by its points gets a new box", async () => {
    const id = await inReview();
    const line = await createComment(people.rm!, id, { anchor: box(), kind: "LINE", points: [[0.1, 0.1], [0.3, 0.1]] });
    const moved = await updateDraftComment(people.rm!, line.id, { points: [[0.5, 0.5], [0.5, 0.9]] });
    expect(moved.points).toEqual([[0.5, 0.5], [0.5, 0.9]]);
    expect(moved.x).toBeCloseTo(0.5);
    expect(moved.y).toBeCloseTo(0.5);
    expect(moved.height).toBeCloseTo(0.4);
    await expect(updateDraftComment(people.rm!, line.id, { points: [[0.5, 0.5], [0.5, 1.2]] })).rejects.toThrow();
  });

  // באג ב-lib/letters/comments.ts (updateDraftComment): לקו שנשלח עם anchor בלבד (בלי points),
  // המלבן זז והנקודות נשארות במקום, כך שהקו המצויר (לפי points) כבר לא בתוך המלבן שלו.
  // צריך לדחות anchor בלי points לקו, או להזיז את הנקודות יחד איתו. כשיתוקן: להחליף ל-it רגיל.
  it("a line moved by its box alone keeps its points inside that box", async () => {
    const id = await inReview();
    const line = await createComment(people.rm!, id, { anchor: box(), kind: "LINE", points: [[0.1, 0.1], [0.3, 0.1]] });
    const moved = await updateDraftComment(people.rm!, line.id, { anchor: { x: 0.6, y: 0.6, width: 0.2, height: 0.05 } });
    for (const [px, py] of moved.points as [number, number][]) {
      expect(px).toBeGreaterThanOrEqual(moved.x - 1e-9);
      expect(px).toBeLessThanOrEqual(moved.x + moved.width + 1e-9);
      expect(py).toBeGreaterThanOrEqual(moved.y - 1e-9);
      expect(py).toBeLessThanOrEqual(moved.y + moved.height + 1e-9);
    }
  });

  it("the advisor sees a reviewer's marks only once he decides, with their kind, colour and points", async () => {
    const id = await inReview();
    await createComment(people.rm!, id, { anchor: box(), kind: "X", color: "#2e7d32" });
    await createComment(people.rm!, id, { anchor: box(), kind: "LINE", points: [[0.1, 0.5], [0.6, 0.5]], color: "#1565c0" });
    expect((await getLetterRoom(people.adv!, id)).comments).toEqual([]);
    expect((await getLetterRoom(people.rm!, id)).comments.map((c) => c.isDraft)).toEqual([true, true]);
    await decideLetter(people.rm!, id, { seat: "RM", kind: "CHANGES" });
    const seen = (await getLetterRoom(people.adv!, id)).comments;
    expect(seen).toEqual([
      expect.objectContaining({ kind: "X", color: "#2e7d32", points: null, isDraft: false, status: "OPEN" }),
      expect.objectContaining({ kind: "LINE", color: "#1565c0", points: [[0.1, 0.5], [0.6, 0.5]], isDraft: false }),
    ]);
  });

  it("the advisor does not mark her own letter: she answers in the thread, and the letter stays with the reviewer", async () => {
    const id = await inReview();
    await expect(createComment(people.adv!, id, { anchor: box(), body: "לתשומת לבכם: עודכן תאריך תחילת הלימודים" })).rejects.toThrow(/הרשאה/);
    const { input } = await loadLetter(getDb(), id);
    expect(flowView(input).state).toBe("IN_REVIEW");
  });
});
