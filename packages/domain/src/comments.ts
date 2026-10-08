import type { CommentStatus } from "./types";

/** A marked area on one page of one PDF version, in page-relative units (0..1). */
export interface CommentAnchor {
  versionNumber: number;
  page: number; // 1-based
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CommentError extends Error {
  constructor(
    public readonly code: "INVALID_ANCHOR" | "INVALID_STATUS_CHANGE" | "NOTE_REQUIRED" | "VERSION_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "CommentError";
  }
}

export const COMMENT_KINDS = ["NOTE", "X", "LINE"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
export const COMMENT_KIND_LABELS: Record<CommentKind, string> = { NOTE: "פתק", X: "סימון X", LINE: "קו" };

export type CommentPoints = [number, number][];

const inUnit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

const MIN_SIDE = 0.004;

/** A line is two points on the page; its anchor is the box around them (a hair of size, so it is never empty). */
export function lineAnchor(points: CommentPoints, versionNumber: number, page: number): CommentAnchor {
  if (points.length !== 2 || points.some((p) => p.length !== 2 || !inUnit(p[0]) || !inUnit(p[1])))
    throw new CommentError("INVALID_ANCHOR", "הקו חייב להיות בתוך הדף");
  const x = Math.min(points[0]![0], points[1]![0]);
  const y = Math.min(points[0]![1], points[1]![1]);
  const width = Math.max(Math.abs(points[0]![0] - points[1]![0]), MIN_SIDE);
  const height = Math.max(Math.abs(points[0]![1] - points[1]![1]), MIN_SIDE);
  return { versionNumber, page, x: Math.min(x, 1 - width), y: Math.min(y, 1 - height), width, height };
}

export const isColor = (c: string | null | undefined): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

export function validateAnchor(anchor: CommentAnchor, pageCount: number, latestVersion: number): void {
  const { versionNumber, page, x, y, width, height } = anchor;
  const ok =
    Number.isInteger(versionNumber) &&
    versionNumber >= 1 &&
    versionNumber <= latestVersion &&
    Number.isInteger(page) &&
    page >= 1 &&
    page <= pageCount &&
    [x, y, width, height].every(inUnit) &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 + 1e-9 &&
    y + height <= 1 + 1e-9;
  if (!ok) throw new CommentError("INVALID_ANCHOR", "The marked area is outside the page or version");
}

const ALLOWED: Record<CommentStatus, readonly CommentStatus[]> = {
  OPEN: ["RESOLVED_FIXED", "RESOLVED_NO_CHANGE"],
  NEEDS_CLARIFICATION: ["OPEN", "RESOLVED_FIXED", "RESOLVED_NO_CHANGE"], // legacy, unused
  RESOLVED_FIXED: ["OPEN"],
  RESOLVED_NO_CHANGE: ["OPEN"],
};

export interface StatusChange {
  to: CommentStatus;
  /** What was fixed, or why the comment is not accepted. Required for "not accepted". */
  note?: string;
}

/**
 * Validates a comment status change. Who may make it is checked in access.ts
 * (the advisor answers; the author or the control manager can reopen).
 */
export function validateStatusChange(from: CommentStatus, change: StatusChange): void {
  if (!ALLOWED[from].includes(change.to))
    throw new CommentError("INVALID_STATUS_CHANGE", `Cannot move a comment from ${from} to ${change.to}`);
  if (change.to === "RESOLVED_NO_CHANGE" && !change.note?.trim())
    throw new CommentError("NOTE_REQUIRED", "צריך להסביר למה ההערה לא מתקבלת");
}

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  OPEN: "פתוחה",
  NEEDS_CLARIFICATION: "פתוחה",
  RESOLVED_FIXED: "טופלה",
  RESOLVED_NO_CHANGE: "לא מקובלת",
};

export const isOpenComment = (status: CommentStatus) => status === "OPEN" || status === "NEEDS_CLARIFICATION";
