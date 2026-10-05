import type { CommentStatus } from "./types.js";

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
  OPEN: ["NEEDS_CLARIFICATION", "RESOLVED_FIXED", "RESOLVED_NO_CHANGE"],
  NEEDS_CLARIFICATION: ["OPEN", "RESOLVED_FIXED", "RESOLVED_NO_CHANGE"],
  RESOLVED_FIXED: ["OPEN"],
  RESOLVED_NO_CHANGE: ["OPEN"],
};

export interface StatusChange {
  to: CommentStatus;
  /** What was fixed, why no change is needed, or what needs clarifying. */
  note?: string;
  /** Required for RESOLVED_FIXED: the version that carries the fix. */
  fixedInVersion?: number;
}

/**
 * Validates a comment status change. Who may make it is checked by
 * canOnLetter(..., "SET_COMMENT_STATUS"); this checks the change itself.
 */
export function validateStatusChange(
  from: CommentStatus,
  change: StatusChange,
  opts: { commentVersion: number; latestVersion: number },
): void {
  if (!ALLOWED[from].includes(change.to))
    throw new CommentError("INVALID_STATUS_CHANGE", `Cannot move a comment from ${from} to ${change.to}`);
  const note = change.note?.trim();
  if ((change.to === "RESOLVED_NO_CHANGE" || change.to === "NEEDS_CLARIFICATION") && !note)
    throw new CommentError("NOTE_REQUIRED", "Explain the answer in a note");
  if (change.to === "RESOLVED_FIXED") {
    const v = change.fixedInVersion;
    if (v === undefined || !Number.isInteger(v) || v < opts.commentVersion || v > opts.latestVersion)
      throw new CommentError("VERSION_REQUIRED", "Choose the version that carries the fix");
  }
}

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  OPEN: "פתוחה",
  NEEDS_CLARIFICATION: "ממתינה להבהרה",
  RESOLVED_FIXED: "טופלה",
  RESOLVED_NO_CHANGE: "נענתה ללא שינוי",
};
