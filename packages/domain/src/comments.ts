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

const inUnit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

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
