// Sample data for trying the system: the business-administration tracks of Kampus Ono (with a
// handful of letters at different stages) and the haredi campuses. Safe to run once; it stops
// if the sample season exists.
//   tsx scripts/seed-demo.ts <tracks.xlsx> <letter1.docx> <letter1.pdf> <letter2.docx> <letter2.pdf>
// The sample people have no password, so nobody can sign in as them.
import { closeDb, getDb, schema } from "@al/db";
import type { Actor, Role } from "@al/domain";
import { and, eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { inviteAcademic } from "../lib/academic/service";
import { importTracks, readTrackFile } from "../lib/import/service";
import { createComment, setCommentStatus } from "../lib/letters/comments";
import { approveLetter, createSeason, performTransition, uploadVersion } from "../lib/letters/service";
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

const oron = await person("oron@ono.ac.il", "אורון", ["CONTROL_MANAGER", "ADMIN", "REGISTRATION_MANAGER"]);
const yossi = await person("yosef.ehr@ono.ac.il", "יוסי ארנפויד", ["VP_REGISTRATION"]);
const advisor = await person("demo-advisor@example.test", "שקד לוגסי (דמו)", ["CONTROL_ADVISOR"]);
// Shuli holds both roles: control advisor of the haredi campuses and registration manager.
const shuli = await person("demo-shuli@example.test", "שולי הלל (דמו)", ["CONTROL_ADVISOR", "REGISTRATION_MANAGER"]);
const academic = await person("demo-academic@example.test", "ראש חוג לדוגמה (דמו)", ["ACADEMIC_APPROVER"]);

const season = await createSeason(oron, { name: SEASON });
const all = await readTrackFile("tracks.xlsx", Buffer.from(readFileSync(xlsx)));
const business = all.filter((r) => r.campus === CAMPUS && r.faculty === FACULTY);
const haredi = all.filter((r) => r.campus === HAREDI);
// Register the campuses + faculties (the first row of each cannot be created yet), then say who
// is responsible for them once.
await importTracks(oron, season.id, [business[0]!, haredi[0]!]);
const unit = (await db.query.units.findFirst({
  where: and(eq(schema.units.campus, CAMPUS), eq(schema.units.faculty, FACULTY)),
}))!;
await setUnitDefaults(oron, unit.id, { registrationManagerId: oron.userId, advisorId: advisor.userId });
const harediCampus = (await db.query.campuses.findFirst({ where: eq(schema.campuses.name, HAREDI) }))!;
await setCampusDefaults(oron, harediCampus.id, { registrationManagerId: shuli.userId, advisorId: shuli.userId });
const report = await importTracks(oron, season.id, [...business, ...haredi]);
console.log(`Imported ${report.counts.created + report.counts.exists} tracks (${report.counts.skipped} placeholder rows skipped, ${report.counts.error} with problems)`);
for (const r of report.rows.filter((x) => x.status === "ERROR")) console.log(`  line ${r.line}: ${r.problem}`);

const byCode = async (code: string) =>
  (await db.select().from(letterRequests).where(eq(letterRequests.seasonId, season.id))).find((l) => l.trackNumber === code)!;
const files = [
  { docx: bytes(docx1), pdf: bytes(pdf1) },
  { docx: bytes(docx2), pdf: bytes(pdf2) },
];
const anchor = { page: 1, x: 0.08, y: 0.2, width: 0.45, height: 0.05 };

// 1. A draft with a first version.
await uploadVersion(advisor, (await byCode("227113701")).id, { ...files[0]!, note: "גרסה ראשונה" });
// 2. Sent to the control manager.
{
  const id = (await byCode("227113801")).id;
  await uploadVersion(advisor, id, { ...files[1]!, note: "גרסה ראשונה" });
  await performTransition(advisor, id, "SUBMIT_FOR_REVIEW");
}
// 3. In the registration round, with an open comment from the VP.
{
  const id = (await byCode("227114401")).id;
  await uploadVersion(advisor, id, { ...files[0]!, note: "גרסה ראשונה" });
  await performTransition(advisor, id, "SUBMIT_FOR_REVIEW");
  await performTransition(oron, id, "INITIAL_APPROVE");
  await createComment(yossi, id, { anchor: { versionNumber: 1, ...anchor }, body: "הימים במכתב לא תקינים, צריך לבדוק מול מערכת השעות" });
  await approveLetter(oron, id);
}
// 4. The registration round is done: waiting for someone to choose an academic approver.
{
  const id = (await byCode("227114301")).id;
  await uploadVersion(advisor, id, { ...files[1]!, note: "גרסה ראשונה" });
  await performTransition(advisor, id, "SUBMIT_FOR_REVIEW");
  await performTransition(oron, id, "INITIAL_APPROVE");
  await approveLetter(oron, id);
  await approveLetter(yossi, id);
}
// 5. Approved by the academic approver: waiting for the final approval.
{
  const id = (await byCode("227114002")).id;
  await uploadVersion(advisor, id, { ...files[0]!, note: "גרסה ראשונה" });
  await performTransition(advisor, id, "SUBMIT_FOR_REVIEW");
  await performTransition(oron, id, "INITIAL_APPROVE");
  await approveLetter(oron, id);
  await approveLetter(yossi, id);
  await inviteAcademic(oron, id, { userId: academic.userId });
  await approveLetter(academic, id);
}
// 6. A whole life: a comment, a fix in version 2, all approvals, approved for distribution.
{
  const id = (await byCode("227113001")).id;
  await uploadVersion(advisor, id, { ...files[0]!, note: "גרסה ראשונה" });
  await performTransition(advisor, id, "SUBMIT_FOR_REVIEW");
  await performTransition(oron, id, "INITIAL_APPROVE");
  const c = await createComment(yossi, id, { anchor: { versionNumber: 1, ...anchor }, body: "תאריך תחילת הלימודים שגוי" });
  await uploadVersion(advisor, id, { ...files[1]!, note: "תוקן תאריך תחילת הלימודים" });
  await setCommentStatus(advisor, c.id, { to: "RESOLVED_FIXED", note: "עודכן ל-8.11", fixedInVersion: 2 });
  await approveLetter(oron, id);
  await approveLetter(yossi, id);
  await inviteAcademic(oron, id, { userId: academic.userId });
  await approveLetter(academic, id);
  await performTransition(yossi, id, "FINAL_APPROVE");
}
const final = await db.select({ stage: letterRequests.stage }).from(letterRequests).where(eq(letterRequests.seasonId, season.id));
const counts = new Map<string, number>();
for (const l of final) counts.set(l.stage, (counts.get(l.stage) ?? 0) + 1);
console.log("Stages:", Object.fromEntries(counts));
await closeDb();
