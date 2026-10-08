import type { Blocker, FlowState, Phase, SeatRole } from "./flow";
import type { Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "מנהל מערכת",
  CONTROL_MANAGER: "מנהלת מחלקת בקרה",
  VP_REGISTRATION: 'סמנכ"ל רישום',
  CONTROL_ADVISOR: "יועצת בקרה",
  REGISTRATION_MANAGER: "מנהל רישום",
  ACADEMIC_APPROVER: "גורם אקדמי",
};

export const PHASE_LABELS: Record<Phase, string> = {
  DRAFT: "בהכנה",
  REVIEW: "בבדיקה",
  ACADEMIC: "גורם אקדמי",
  FINAL: "אישור סופי",
  APPROVED: "מאושר להפצה",
};

/** The one-line status people read ("בתיקון", "אצל גורם אקדמי"…). */
export const STATE_LABELS: Record<FlowState, string> = {
  PREPARING: "בהכנה",
  IN_REVIEW: "בבדיקה",
  FIXING: "בתיקון",
  READY_FOR_ACADEMIC: "מוכן לגורם אקדמי",
  WITH_ACADEMIC: "אצל גורם אקדמי",
  AWAITING_FINAL: "ממתין לאישור סופי",
  LOADING: "מאושר, ממתין להעלאה לגלבוע",
  APPROVED: "הסתיים",
  BLOCKED: "תקוע: חסר בעל תפקיד",
};

/** Colour families, the same on every screen: grey prepare, blue review, violet academic, amber final, green done, red stuck. */
export type Tone = "prep" | "review" | "acad" | "final" | "good" | "bad" | "warn";
export const STATE_TONES: Record<FlowState, Tone> = {
  PREPARING: "prep",
  IN_REVIEW: "review",
  FIXING: "warn",
  READY_FOR_ACADEMIC: "acad",
  WITH_ACADEMIC: "acad",
  AWAITING_FINAL: "final",
  LOADING: "good",
  APPROVED: "good",
  BLOCKED: "bad",
};

export const SEAT_LABELS: Record<SeatRole, string> = {
  CONTROL: "ורוניקה (בקרה)",
  RM: "מנהל רישום",
  VP: 'סמנכ"ל רישום',
  FINAL: "אישור סופי",
  ACADEMIC: "גורם אקדמי",
};

export const BLOCKER_LABELS: Record<Blocker, string> = {
  NO_VERSION: "צריך להעלות גרסה",
  NO_ADVISOR: "לא שויכה יועצת למסלול",
  NO_REGISTRATION_MANAGER: "לא שויך מנהל רישום למסלול",
  NO_VP: 'לא הוגדר סמנכ"ל רישום',
  OPEN_COMMENTS: "יש הערות פתוחות",
};
