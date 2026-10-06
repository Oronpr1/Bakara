// Sample data for trying the system: the business-administration tracks of Kampus Ono (with
// letters at every phase of the flow) and the haredi campuses. Safe to run once; it stops if the
// sample season exists. The sample people have no password, so nobody can sign in as them.
//   tsx scripts/seed-demo.ts <tracks.xlsx> <letter1.docx> <letter1.pdf> <letter2.docx> <letter2.pdf>
import { closeDb, getDb, hashPassword, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { and, eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { inviteAcademic } from "../lib/academic/service";
import { importTracks, readTrackFile } from "../lib/import/service";
import { createComment, setCommentStatus } from "../lib/letters/comments";
import {
  createSeason,
  decideLetter,
  markInGilboa,
  resubmitLetter,
  submitLetter,
  uploadVersion,
} from "../lib/letters/service";
import { setCampusDefaults, setUnitDefaults } from "../lib/units/service";

const [xlsx, docx1, pdf1, docx2, pdf2] = process.argv.slice(2);
if (!xlsx || !docx1 || !pdf1 || !docx2 || !pdf2) {
  console.error("Usage: tsx scripts/seed-demo.ts <tracks.xlsx> <letter1.docx> <letter1.pdf> <letter2.docx> <letter2.pdf>");
  process.exit(1);
}
const SEASON = 'דוגמה - תשפ"ז א\'';
const CAMPUS = "קמפוס אונו";
const FACULTY = "מנהל עסקים";
const HAREDI = "קמפוסים חרדיים";
const db = getDb();
const { users, seasons, letterRequests } = schema;
const bytes = (p: string) => new Uint8Array(readFileSync(p));

if (await db.query.seasons.findFirst({ where: eq(seasons.name, SEASON) })) {
  console.log("The sample season already exists; nothing to do.");
  await closeDb();
  process.exit(0);
}

async function person(email: string, name: string, roles: Role[]): Promise<Actor> {
  const [u] = await db
    .insert(users)
    .values({ email, name, roles })
    .onConflictDoUpdate({
      target: users.email,
      // Roles are only ever added to an existing user, never taken away.
      set: { active: true, roles: sql`array(select distinct unnest(${users.roles} || ${sql.raw(`'{${roles.join(",")}}'::role[]`)}))` },
    })
    .returning();
  return { userId: u!.id, roles: u!.roles };
}

const veronica = await person("oron@ono.ac.il", "אורון (בדיקה, גם ורוניקה)", ["CONTROL_MANAGER", "ADMIN", "REGISTRATION_MANAGER"]);
const yossi = await person("yosef.ehr@ono.ac.il", "יוסי ארנפויד", ["VP_REGISTRATION"]);
const shaked = await person("demo-shaked@example.test", "שקד לוגסי (דמו)", ["CONTROL_ADVISOR"]);
const limor = await person("demo-limor@example.test", "לימור כהן חופי (דמו)", ["CONTROL_ADVISOR"]);
const shuli = await person("demo-shuli@example.test", "שולי הלל (דמו)", ["CONTROL_ADVISOR", "REGISTRATION_MANAGER"]);
const head = await person("demo-head@example.test", "פרופ׳ לוי, ראש חוג (דמו)", ["ACADEMIC_APPROVER"]);
void limor;

// For trying it on a development machine only: DEMO_PASSWORD gives every sample person a password.
if (process.env.DEMO_PASSWORD) {
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD);
  for (const p of [veronica, yossi, shaked, limor, shuli, head])
    await db.update(users).set({ passwordHash, passwordSetAt: new Date() }).where(eq(users.id, p.userId));
}

const season = await createSeason(veronica, { name: SEASON });
const all = await readTrackFile("tracks.xlsx", Buffer.from(readFileSync(xlsx)));
const business = all.filter((r) => r.campus === CAMPUS && r.faculty === FACULTY);
const haredi = all.filter((r) => r.campus === HAREDI);
// Register the campuses + faculties, then say who is responsible for them once.
await importTracks(veronica, season.id, [business[0]!, haredi[0]!]);
const unit = (await db.query.units.findFirst({ where: and(eq(schema.units.campus, CAMPUS), eq(schema.units.faculty, FACULTY)) }))!;
await setUnitDefaults(veronica, unit.id, { registrationManagerId: veronica.userId, advisorId: shaked.userId });
const harediCampus = (await db.query.campuses.findFirst({ where: eq(schema.campuses.name, HAREDI) }))!;
await setCampusDefaults(veronica, harediCampus.id, { registrationManagerId: shuli.userId, advisorId: shuli.userId });
const report = await importTracks(veronica, season.id, [...business, ...haredi]);
console.log(`Imported ${report.counts.created + report.counts.exists} tracks (${report.counts.skipped} placeholder rows skipped, ${report.counts.error} with problems)`);
for (const r of report.rows.filter((x) => x.status === "ERROR")) console.log(`  line ${r.line}: ${r.problem}`);

const byCode = async (code: string) =>
  (await db.select().from(letterRequests).where(eq(letterRequests.seasonId, season.id))).find((l) => l.trackNumber === code)!;
const files = [
  { docx: bytes(docx1), pdf: bytes(pdf1) },
  { docx: bytes(docx2), pdf: bytes(pdf2) },
];
const anchor = (v = 1) => ({ versionNumber: v, page: 1, x: 0.08, y: 0.2, width: 0.45, height: 0.05 });
const upload = (id: string, n: 0 | 1, note: string) => uploadVersion(shaked, id, { ...files[n]!, note });

// 1. A draft with a first version (Shaked has not sent it yet).
await upload((await byCode("227113701")).id, 0, "גרסה ראשונה");
// 2. Sent: waiting for Oron, the registration manager.
{
  const id = (await byCode("227113801")).id;
  await upload(id, 1, "גרסה ראשונה");
  await submitLetter(shaked, id);
}
// 3. Oron approved with comments: it is with Shaked to fix.
{
  const id = (await byCode("227114401")).id;
  await upload(id, 0, "גרסה ראשונה");
  await submitLetter(shaked, id);
  await createComment(veronica, id, { anchor: anchor(), body: "הימים במכתב לא תקינים", suggestion: "ימי ב׳ וד׳ במקום א׳ וג׳" });
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
}
// 4. Oron approved: waiting for Yossi.
{
  const id = (await byCode("227114301")).id;
  await upload(id, 1, "גרסה ראשונה");
  await submitLetter(shaked, id);
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
}
// 5. Both approved: ready to be sent to an academic approver.
{
  const id = (await byCode("227114002")).id;
  await upload(id, 0, "גרסה ראשונה");
  await submitLetter(shaked, id);
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "VP", kind: "APPROVED" });
}
// 6. Sent to the academic approver, who has not answered yet.
{
  const id = (await byCode("227113012")).id;
  await upload(id, 1, "גרסה ראשונה");
  await submitLetter(shaked, id);
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "VP", kind: "APPROVED" });
  await inviteAcademic(shaked, id, { userId: head.userId });
}
// 7. The academic approver approved: waiting for the final approval.
{
  const id = (await byCode("227113014")).id;
  await upload(id, 0, "גרסה ראשונה");
  await submitLetter(shaked, id);
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "VP", kind: "APPROVED" });
  await inviteAcademic(shaked, id, { userId: head.userId });
  await decideLetter(head, id, { seat: `ACADEMIC:${head.userId}`, kind: "APPROVED" });
}
// 8. A whole life: comments, a fix in version 2, all approvals, approved and loaded into Gilboa.
{
  const id = (await byCode("227113001")).id;
  await upload(id, 0, "גרסה ראשונה");
  await submitLetter(shaked, id);
  const c = await createComment(veronica, id, { anchor: anchor(), body: "תאריך תחילת הלימודים שגוי", suggestion: "08.11.2026" });
  await decideLetter(veronica, id, { seat: "RM", kind: "CHANGES" });
  await upload(id, 1, "תוקן תאריך תחילת הלימודים");
  await setCommentStatus(shaked, c.id, { to: "RESOLVED_FIXED", note: "עודכן ל-8.11" });
  await resubmitLetter(shaked, id);
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "VP", kind: "APPROVED" });
  await inviteAcademic(shaked, id, { userId: head.userId });
  await decideLetter(head, id, { seat: `ACADEMIC:${head.userId}`, kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "FINAL", kind: "APPROVED" });
  await markInGilboa(shaked, id);
}
// 9. Approved, not yet loaded into Gilboa.
{
  const id = (await byCode("227113006")).id;
  await upload(id, 1, "גרסה ראשונה");
  await submitLetter(shaked, id);
  await decideLetter(veronica, id, { seat: "RM", kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "VP", kind: "APPROVED" });
  await inviteAcademic(shaked, id, { userId: head.userId });
  await decideLetter(head, id, { seat: `ACADEMIC:${head.userId}`, kind: "APPROVED" });
  await decideLetter(yossi, id, { seat: "FINAL", kind: "APPROVED" });
}
const final = await db.select({ phase: letterRequests.phase }).from(letterRequests).where(eq(letterRequests.seasonId, season.id));
const counts = new Map<string, number>();
for (const l of final) counts.set(l.phase, (counts.get(l.phase) ?? 0) + 1);
console.log("Phases:", Object.fromEntries(counts));
await closeDb();
