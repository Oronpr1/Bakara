import { getDb, schema, type Db } from "@al/db";
import { canGlobal, type Actor } from "@al/domain";
import { eq } from "drizzle-orm";
import { AppError, forbidden, userMessage } from "../errors";
import { createLetterRequest } from "../letters/service";
import { parseCsv, parseTrackRows, type TrackRow } from "./tracks";

const { users, letterRequests } = schema;

export type RowStatus = "OK" | "EXISTS" | "ERROR" | "CREATED" | "SKIPPED";
export interface PlannedRow extends TrackRow {
  status: RowStatus;
  problem?: string;
  advisorId?: string;
  advisorName?: string;
  managerId?: string;
  managerName?: string;
}

export interface ImportReport {
  rows: PlannedRow[];
  counts: { ok: number; exists: number; error: number; created: number; skipped: number };
  /** Tracks created (or to be created) with no advisor or no registration manager yet: the control manager assigns them next. */
  unassigned: { noAdvisor: number; noManager: number };
}

const key = (campus: string, number: string) => `${campus}\u0000${number}`;
const nameKey = (s: string) => s.replace(/["'׳״.]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Reads a .xlsx or .csv upload into rows of text. */
export async function readTrackFile(name: string, bytes: Buffer) {
  let table: unknown[][];
  if (/\.csv$|\.txt$/i.test(name)) table = parseCsv(bytes.toString("utf8"));
  else if (/\.xlsx$/i.test(name)) {
    const { readSheet } = await import("read-excel-file/node");
    table = (await readSheet(bytes)) as unknown[][];
  } else throw new AppError("INVALID", "אפשר להעלות קובץ Excel (xlsx) או CSV");
  const parsed = parseTrackRows(table);
  if ("error" in parsed) throw new AppError("INVALID", parsed.error);
  return parsed.rows;
}

/** Checks every row against the people and the season; changes nothing. */
export async function planTrackImport(
  actor: Actor,
  seasonId: string,
  rows: TrackRow[],
  db: Db = getDb(),
): Promise<ImportReport> {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const [people, existing] = await Promise.all([
    db.select().from(users).where(eq(users.active, true)),
    db.select().from(letterRequests).where(eq(letterRequests.seasonId, seasonId)),
  ]);
  const advisors = people.filter((u) => u.roles.includes("CONTROL_ADVISOR"));
  const managers = people.filter((u) => u.roles.includes("REGISTRATION_MANAGER"));
  const exists = new Set(existing.map((l) => key(l.campus, l.trackNumber)));
  const seen = new Set<string>();

  /** Finds the one person a name or email in the file means: a message when there is none or several. */
  const find = (pool: typeof people, written: string, what: string): { person?: (typeof people)[number]; problem?: string } => {
    if (!written) return {};
    const email = written.trim().toLowerCase();
    const byEmail = pool.filter((u) => u.email === email);
    const byName = pool.filter((u) => nameKey(u.name) === nameKey(written));
    const match = byEmail.length ? byEmail : byName;
    if (match.length === 0) return { problem: `אין ${what} פעיל/ה בשם או במייל "${written}". מוסיפים אותו במסך "אנשים"` };
    if (match.length > 1) return { problem: `יותר מ${what} אחד בשם "${written}". אפשר לכתוב מייל` };
    return { person: match[0] };
  };

  const planned = rows.map((row): PlannedRow => {
    // Placeholders in the registration report ("ללא ממ"ה", code "-") are not tracks.
    if (row.trackNumber === "-" || /ללא\s*ממ"?ה/.test(row.trackName))
      return { ...row, status: "SKIPPED", problem: "לא מסלול (שורת מקום)" };
    if (!row.faculty) return { ...row, status: "ERROR", problem: "חסרה פקולטה" };
    if (!row.campus || !row.trackName) return { ...row, status: "ERROR", problem: "חסר מידע בשורה" };
    if (!/^\d{4,}$/.test(row.trackNumber)) return { ...row, status: "ERROR", problem: `קוד מסלול לא תקין: "${row.trackNumber}"` };
    const k = key(row.campus, row.trackNumber);
    if (seen.has(k)) return { ...row, status: "ERROR", problem: "קוד המסלול מופיע פעמיים בקמפוס בקובץ" };
    seen.add(k);

    const adv = find(advisors, row.advisor, "יועץ בקרה");
    if (adv.problem) return { ...row, status: "ERROR", problem: adv.problem };
    const mgr = find(managers, row.manager, "מנהל רישום");
    if (mgr.problem) return { ...row, status: "ERROR", problem: mgr.problem };
    const who = {
      advisorId: adv.person?.id,
      advisorName: adv.person?.name,
      managerId: mgr.person?.id,
      managerName: mgr.person?.name,
    };
    // A track with nobody assigned is still created: it shows red until the control manager
    // assigns an advisor and a manager, and cannot be sent to review before that.
    return exists.has(k) ? { ...row, status: "EXISTS", ...who } : { ...row, status: "OK", ...who };
  });
  return report(planned);
}

function report(rows: PlannedRow[]): ImportReport {
  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const made = rows.filter((r) => r.status === "OK" || r.status === "CREATED");
  return {
    rows,
    counts: { ok: count("OK"), exists: count("EXISTS"), error: count("ERROR"), created: count("CREATED"), skipped: count("SKIPPED") },
    unassigned: { noAdvisor: made.filter((r) => !r.advisorId).length, noManager: made.filter((r) => !r.managerId).length },
  };
}

/** Creates the letters of every valid row. Importing the same file again only adds what is still missing. */
export async function importTracks(
  actor: Actor,
  seasonId: string,
  rows: TrackRow[],
  db: Db = getDb(),
): Promise<ImportReport> {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const plan = await planTrackImport(actor, seasonId, rows, db);
  const rowsOut: PlannedRow[] = [];
  for (const row of plan.rows) {
    if (row.status !== "OK") {
      rowsOut.push(row);
      continue;
    }
    try {
      await createLetterRequest(actor, {
        seasonId,
        campus: row.campus,
        faculty: row.faculty,
        trackName: row.trackName,
        trackNumber: row.trackNumber,
        advisorId: row.advisorId,
        registrationManagerId: row.managerId,
      });
      rowsOut.push({ ...row, status: "CREATED" });
    } catch (err) {
      rowsOut.push({ ...row, status: "ERROR", problem: userMessage(err) });
    }
  }
  return report(rowsOut);
}

