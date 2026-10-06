// The filtered letter list as a CSV that Excel opens correctly in Hebrew (UTF-8 with a BOM).
import { STATE_LABELS } from "@al/domain";
import { formatDate } from "../format";
import type { HomeLetter } from "./model";

const HEADERS = [
  "מסלול",
  "קוד מסלול",
  "קמפוס",
  "פקולטה",
  "יועצת",
  "מנהל רישום",
  "מצב",
  "אצל",
  "ימי המתנה",
  "הערות פתוחות",
  "גרסה אחרונה",
  "תאריך יעד",
  "באיחור",
  "הועלה לגלבוע",
];

/** A cell, quoted when needed; text that a spreadsheet would run as a formula is made plain text. */
export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function lettersCsv(items: HomeLetter[]): string {
  const rows = items.map((l) => [
    l.trackName,
    l.trackNumber,
    l.campus,
    l.faculty,
    l.advisorName,
    l.rmNames.join(", "),
    STATE_LABELS[l.state],
    l.holderNames.join(", "),
    l.waitingDays,
    l.openComments,
    l.latestVersion || "",
    l.dueDate ? formatDate(l.dueDate) : "",
    l.overdue ? "כן" : "",
    l.inGilboa ? "כן" : "",
  ]);
  return `﻿${[HEADERS, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
