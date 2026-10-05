import type { ApproverSlot, Role, Stage } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "מנהל מערכת",
  CONTROL_MANAGER: "מנהלת מחלקת בקרה",
  VP_REGISTRATION: 'סמנכ"ל רישום',
  CONTROL_ADVISOR: "יועצת בקרה",
  REGISTRATION_MANAGER: "מנהל רישום",
  ACADEMIC_APPROVER: "גורם אקדמי",
};

export const STAGE_LABELS: Record<Stage, string> = {
  DRAFT: "בהכנה",
  INITIAL_REVIEW: "בדיקה ראשונית",
  REGISTRATION_ROUND: "סבב רישום",
  ACADEMIC_ROUND: "סבב אקדמי",
  FINAL_REVIEW: "אישור סופי",
  APPROVED: "מאושר להפצה",
};

export const SLOT_LABELS: Record<ApproverSlot, string> = {
  REGISTRATION_MANAGER: "מנהל רישום",
  VP_REGISTRATION: 'סמנכ"ל רישום',
  ACADEMIC: "גורם אקדמי",
};
