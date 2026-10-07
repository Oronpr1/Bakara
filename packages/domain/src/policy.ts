// The rules the control manager can change: which roles may do the bigger things. The flow itself
// (who reviews, who signs, who prepares) is fixed by the process; these are the permissions around it.
import type { Actor, Role } from "./types";

export type CapabilityKey =
  | "VIEW_ALL"
  | "MANAGE_SEASONS"
  | "MANAGE_UNITS"
  | "MANAGE_USERS"
  | "CREATE_LETTER_REQUEST"
  | "ACT_FOR_OTHERS"
  | "SKIP_ACADEMIC"
  | "RESET_APPROVALS"
  | "REOPEN"
  | "REMIND"
  | "REASSIGN_ADVISOR"
  | "OVERRIDE_OPEN_COMMENTS"
  | "MANAGE_RULES";

export interface Capability {
  key: CapabilityKey;
  label: string;
  hint: string;
  defaults: readonly Role[];
}

const TOP: readonly Role[] = ["ADMIN", "CONTROL_MANAGER", "VP_REGISTRATION"];

export const CAPABILITIES: readonly Capability[] = [
  { key: "VIEW_ALL", label: "לראות את כל המכתבים", hint: "מגדל הפיקוח המלא, בכל הקמפוסים והפקולטות", defaults: TOP },
  { key: "MANAGE_SEASONS", label: "לפתוח עונות ולשנות הגדרות עונה", hint: "פתיחת עונה, העתקה מעונה קודמת, סדר הבדיקה, תאריך יעד", defaults: TOP },
  { key: "MANAGE_UNITS", label: "להקים מסלולים ולשייך אנשים", hint: "ייבוא מסלולים, יועצת ומנהל רישום לקמפוס, פקולטה ומסלול", defaults: TOP },
  { key: "MANAGE_USERS", label: "להקים משתמשים", hint: "הוספת אנשים, תפקידים וסיסמאות", defaults: ["ADMIN", "CONTROL_MANAGER"] },
  {
    key: "CREATE_LETTER_REQUEST",
    label: "להקים דרישת מכתב",
    hint: "מסלול חדש שצריך מכתב. ורוניקה מקימה מסלולים ומשבצת בהם יועצת ומנהלים",
    defaults: TOP,
  },
  { key: "ACT_FOR_OTHERS", label: "לפעול במקום אחר", hint: 'למשל לחתום במקום הסמנכ"ל, להעלות גרסה במקום היועצת. נרשם "במקום ..."', defaults: ["CONTROL_MANAGER"] },
  { key: "SKIP_ACADEMIC", label: "לדלג על הגורם האקדמי", hint: "בסמכותם, מהסיבות שלהם", defaults: ["CONTROL_MANAGER", "VP_REGISTRATION"] },
  { key: "RESET_APPROVALS", label: 'לבקש מכולם לאשר מחדש', hint: "אחרי שינוי מהותי במכתב", defaults: ["CONTROL_MANAGER", "VP_REGISTRATION"] },
  { key: "REOPEN", label: "לפתוח מחדש מכתב שאושר", hint: "חוזר לאישור סופי", defaults: ["CONTROL_MANAGER", "VP_REGISTRATION"] },
  { key: "REMIND", label: "לשלוח תזכורת למי שמחזיק מכתב", hint: "", defaults: ["CONTROL_MANAGER", "VP_REGISTRATION"] },
  { key: "REASSIGN_ADVISOR", label: "להחליף יועצת במכתב", hint: "", defaults: ["CONTROL_MANAGER"] },
  { key: "OVERRIDE_OPEN_COMMENTS", label: "לאשר סופית למרות הערות פתוחות", hint: "נרשם בנימוק", defaults: ["CONTROL_MANAGER"] },
  { key: "MANAGE_RULES", label: "לקבוע את הכללים האלה", hint: "מנהל המערכת תמיד יכול", defaults: ["ADMIN", "CONTROL_MANAGER"] },
];

export type Policy = Record<CapabilityKey, readonly Role[]>;

export const DEFAULT_POLICY: Policy = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c.defaults])) as Policy;

let current: Policy = DEFAULT_POLICY;

/** Roles that are always allowed, so nobody can lock the system administrator out. */
const ALWAYS: Partial<Record<CapabilityKey, readonly Role[]>> = { MANAGE_RULES: ["ADMIN"], MANAGE_USERS: ["ADMIN"] };

/** Sets the rules in force (from the database). Missing capabilities keep their defaults. */
export function setPolicy(overrides: Partial<Record<CapabilityKey, readonly Role[]>> | null) {
  const next = { ...DEFAULT_POLICY };
  for (const c of CAPABILITIES) {
    const roles = overrides?.[c.key];
    if (roles) next[c.key] = [...new Set([...roles, ...(ALWAYS[c.key] ?? [])])];
  }
  current = next;
}

export const getPolicy = (): Policy => current;

/** Whether any of the actor's roles may do this. */
export const allowed = (actor: Actor, key: CapabilityKey): boolean => actor.roles.some((r) => current[key].includes(r));
