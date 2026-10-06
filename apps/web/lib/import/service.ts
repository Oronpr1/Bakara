import { getDb, schema, type Db } from "@al/db";
import { canGlobal, type Actor } from "@al/domain";
import { eq } from "drizzle-orm";
import { AppError, forbidden, userMessage } from "../errors";
import { createLetterRequest } from "../letters/service";
import { parseCsv, parseTrackRows, type TrackRow } from "./tracks";

const { users, units, letterRequests } = schema;

export type RowStatus = "OK" | "EXISTS" | "ERROR" | "CREATED";
export interface PlannedRow extends TrackRow {
  status: RowStatus;
  problem?: string;
  advisorId?: string;
  advisorName?: string;
}

export interface ImportReport {
  rows: PlannedRow[];
  counts: { ok: number; exists: number; error: number; created: number };
  /** Campus + faculty pairs that still have no registration manager. */
  unitsWithoutManager: { campus: string; faculty: string }[];
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

/** Checks every row against the people, the units and the season; changes nothing. */
export async function planTrackImport(
  actor: Actor,
  seasonId: string,
  rows: TrackRow[],
  db: Db = getDb(),
): Promise<ImportReport> {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const [people, unitRows, existing] = await Promise.all([
    db.select().from(users).where(eq(users.active, true)),
    db.select().from(units),
    db.select().from(letterRequests).where(eq(letterRequests.seasonId, seasonId)),
  ]);
  const advisors = people.filter((u) => u.roles.includes("CONTROL_ADVISOR"));
  const unitOf = new Map(unitRows.map((u) => [`${u.campus}\u0000${u.faculty}`, u]));
  const exists = new Set(existing.map((l) => key(l.campus, l.trackNumber)));
  const seen = new Set<string>();
  const noManager = new Map<string, { campus: string; faculty: string }>();

  const planned = rows.map((row): PlannedRow => {
    const missing = (["trackName", "trackNumber", "faculty", "campus", "advisor"] as const).filter((c) => !row[c]);
    if (missing.length) return { ...row, status: "ERROR", problem: "חסר מידע בשורה" };
    const k = key(row.campus, row.trackNumber);
    if (seen.has(k)) return { ...row, status: "ERROR", problem: "מספר המסלול מופיע פעמיים בקמפוס בקובץ" };
    seen.add(k);

    const a = row.advisor.trim().toLowerCase();
    const byEmail = advisors.filter((u) => u.email === a);
    const byName = advisors.filter((u) => nameKey(u.name) === nameKey(row.advisor));
    const match = byEmail.length ? byEmail : byName;
    if (match.length === 0)
      return { ...row, status: "ERROR", problem: `אין יועצת בקרה פעילה בשם או במייל "${row.advisor}". מוסיפים אותה במסך "משתמשים"` };
    if (match.length > 1) return { ...row, status: "ERROR", problem: `יותר מיועצת אחת בשם "${row.advisor}". אפשר לכתוב מייל` };
    const advisor = match[0]!;

    if (exists.has(k)) return { ...row, status: "EXISTS", advisorId: advisor.id, advisorName: advisor.name };
    if (!unitOf.get(`${row.campus}\u0000${row.faculty}`)?.registrationManagerId) {
      noManager.set(`${row.campus}\u0000${row.faculty}`, { campus: row.campus, faculty: row.faculty });
      return {
        ...row,
        status: "ERROR",
        problem: `אין מנהל רישום ל${row.faculty} ב${row.campus}. מגדירים אותו ב"קמפוסים ופקולטות" ומייבאים שוב`,
        advisorId: advisor.id,
        advisorName: advisor.name,
      };
    }
    return { ...row, status: "OK", advisorId: advisor.id, advisorName: advisor.name };
  });
  return report(planned, [...noManager.values()]);
}

function report(rows: PlannedRow[], unitsWithoutManager: ImportReport["unitsWithoutManager"]): ImportReport {
  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    counts: { ok: count("OK"), exists: count("EXISTS"), error: count("ERROR"), created: count("CREATED") },
    unitsWithoutManager,
  };
}

/**
 * Creates the letters of every valid row. Campus + faculty pairs new to the system are
 * registered first, so they show up in "קמפוסים ופקולטות" even when their rows cannot be
 * created yet. Importing the same file again only adds what is still missing.
 */
export async function importTracks(
  actor: Actor,
  seasonId: string,
  rows: TrackRow[],
  db: Db = getDb(),
): Promise<ImportReport> {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const pairs = new Map(rows.filter((r) => r.campus && r.faculty).map((r) => [`${r.campus}\u0000${r.faculty}`, r]));
  for (const r of pairs.values()) await db.insert(units).values({ campus: r.campus, faculty: r.faculty }).onConflictDoNothing();

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
        advisorId: row.advisorId!,
      });
      rowsOut.push({ ...row, status: "CREATED" });
    } catch (err) {
      rowsOut.push({ ...row, status: "ERROR", problem: userMessage(err) });
    }
  }
  return report(rowsOut, plan.unitsWithoutManager);
}

