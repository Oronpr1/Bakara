// Importing tracks (דרישות מכתב) from a spreadsheet: track name, track number, faculty, campus,
// control advisor. Pure parsing here; the database lookups are in service.ts.

export interface TrackRow {
  line: number; // 1-based line in the file, header included
  trackName: string;
  trackNumber: string;
  faculty: string;
  campus: string;
  advisor: string; // name or email, as written in the file
}

export type Column = "trackName" | "trackNumber" | "faculty" | "campus" | "advisor";

const HEADERS: Record<Column, string[]> = {
  trackName: ["שם מסלול", "שם המסלול", "מסלול", "track", "track name"],
  trackNumber: ["מספר מסלול", "מס מסלול", "מס' מסלול", "מספר", "קוד מסלול", "track number", "number"],
  faculty: ["פקולטה", "faculty"],
  campus: ["קמפוס", "campus"],
  advisor: ["יועץ בקרה", "יועצת בקרה", "יועץ/ת בקרה", "יועץ", "יועצת", "advisor", "email", "מייל יועץ"],
};

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const norm = (v: unknown) => clean(v).toLowerCase().replace(/["'׳״.]/g, "");

/** Finds which column holds what, from the header row. Null when a needed column is missing. */
export function mapColumns(header: unknown[]): Record<Column, number> | { missing: Column[] } {
  const map: Partial<Record<Column, number>> = {};
  const cells = header.map(norm);
  for (const col of Object.keys(HEADERS) as Column[]) {
    const names = HEADERS[col].map(norm);
    const i = cells.findIndex((c) => names.includes(c));
    if (i >= 0) map[col] = i;
  }
  const missing = (Object.keys(HEADERS) as Column[]).filter((c) => map[c] === undefined);
  return missing.length ? { missing } : (map as Record<Column, number>);
}

export const COLUMN_LABELS: Record<Column, string> = {
  trackName: "שם מסלול",
  trackNumber: "מספר מסלול",
  faculty: "פקולטה",
  campus: "קמפוס",
  advisor: "יועץ בקרה",
};

/** Turns spreadsheet rows (first row = header) into track rows. Blank rows are dropped. */
export function parseTrackRows(rows: unknown[][]): { rows: TrackRow[] } | { error: string } {
  const [header, ...body] = rows;
  if (!header) return { error: "הקובץ ריק" };
  const cols = mapColumns(header);
  if ("missing" in cols)
    return { error: `חסרות עמודות בשורת הכותרת: ${cols.missing.map((c) => COLUMN_LABELS[c]).join(", ")}` };
  const out: TrackRow[] = [];
  body.forEach((r, i) => {
    const row: TrackRow = {
      line: i + 2,
      trackName: clean(r[cols.trackName]),
      trackNumber: clean(r[cols.trackNumber]),
      faculty: clean(r[cols.faculty]),
      campus: clean(r[cols.campus]),
      advisor: clean(r[cols.advisor]),
    };
    if (Object.values({ ...row, line: "" }).every((v) => !v)) return;
    out.push(row);
  });
  if (out.length === 0) return { error: "לא נמצאו שורות מתחת לכותרת" };
  return { rows: out };
}

/** A small CSV reader: quotes, commas or tabs/semicolons, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", "\t", ";"].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) (row.push(cell), (cell = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows;
}
