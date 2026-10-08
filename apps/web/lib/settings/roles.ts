// How the roles are explained to the person who sets people up. Words only; what each role may do
// is in the core (and written out in rules-doc.ts).
import { ROLE_LABELS, type Role } from "@al/domain";

/** The order roles are listed in, most used first. */
export const ROLE_ORDER: readonly Role[] = [
  "CONTROL_ADVISOR",
  "REGISTRATION_MANAGER",
  "VP_REGISTRATION",
  "ACADEMIC_APPROVER",
  "CONTROL_MANAGER",
  "ADMIN",
];

export const ROLE_HINTS: Record<Role, string> = {
  CONTROL_ADVISOR: "מכינה את המכתבים של המסלולים שלה, מעלה גרסאות, מטפלת בהערות ושולחת לגורם האקדמי.",
  REGISTRATION_MANAGER: "בודק ומאשר את המכתבים של הקמפוס או הפקולטה שלו, לפני הסמנכ\"ל.",
  VP_REGISTRATION: "בודק כל מכתב אחרי מנהל הרישום, וחותם את האישור הסופי.",
  ACADEMIC_APPROVER: "ראש חוג או גורם אקדמי: מקבל קישור אישי למכתב, מעיר ומאשר. לא צריך להיכנס עם סיסמה.",
  CONTROL_MANAGER: "רואה הכול, מקימה עונות ומסלולים, משייכת אנשים, ויכולה לפעול במקום כל אחד.",
  ADMIN: "מנהל את המערכת: משתמשים וכללים. לא משתתף בבדיקת המכתבים.",
};

/** Plural names for the filter chips. */
export const ROLE_PLURALS: Record<Role, string> = {
  CONTROL_ADVISOR: "יועצות בקרה",
  REGISTRATION_MANAGER: "מנהלי רישום",
  VP_REGISTRATION: 'סמנכ"ל',
  ACADEMIC_APPROVER: "גורמים אקדמיים",
  CONTROL_MANAGER: "מנהלת בקרה",
  ADMIN: "מנהלי מערכת",
};

export const roleOptions = () => ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r], hint: ROLE_HINTS[r] }));
