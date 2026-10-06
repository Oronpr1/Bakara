// "כללים": what each role may do, written out for people. This is documentation, read-only: the
// rules themselves live in the core (packages/domain/src/access.ts: canGlobal, abilities; and
// flow.ts: who holds the letter, whose turn it is). When a rule there changes, change this table;
// rules-doc.test.ts checks the system-wide rows against canGlobal so the two cannot drift apart.
import type { GlobalAction, Role } from "@al/domain";

/** The columns, in the order people think of them. */
export const RULE_ROLES: readonly { role: Role; label: string }[] = [
  { role: "ADMIN", label: "מנהל מערכת" },
  { role: "CONTROL_MANAGER", label: "ורוניקה (מנהלת בקרה)" },
  { role: "VP_REGISTRATION", label: 'סמנכ"ל רישום' },
  { role: "CONTROL_ADVISOR", label: "יועצת בקרה" },
  { role: "REGISTRATION_MANAGER", label: "מנהל רישום" },
  { role: "ACADEMIC_APPROVER", label: "גורם אקדמי" },
];

/** yes: always (within what they see) · partial: only in some cases, see the note · no. */
export type RuleLevel = "yes" | "partial" | "no";
export interface RuleCell {
  level: RuleLevel;
  note?: string;
}

export interface RuleRow {
  id: string;
  label: string;
  /** One line of what it means, for whoever reads the table. */
  hint?: string;
  /** Where the rule lives in the core (for developers; not shown). */
  source: string;
  /** For system-wide rows: the core action the row mirrors, so a test can compare them. */
  global?: GlobalAction;
  cells: Record<Role, RuleCell>;
}

export interface RuleGroup {
  title: string;
  rows: RuleRow[];
}

const Y: RuleCell = { level: "yes" };
const N: RuleCell = { level: "no" };
const P = (note: string): RuleCell => ({ level: "partial", note });

/** Builds a row; roles left out cannot do it. */
const row = (
  id: string,
  label: string,
  source: string,
  cells: Partial<Record<Role, RuleCell>>,
  extra: { hint?: string; global?: GlobalAction } = {},
): RuleRow => ({
  id,
  label,
  source,
  ...extra,
  cells: {
    ADMIN: cells.ADMIN ?? N,
    CONTROL_MANAGER: cells.CONTROL_MANAGER ?? N,
    VP_REGISTRATION: cells.VP_REGISTRATION ?? N,
    CONTROL_ADVISOR: cells.CONTROL_ADVISOR ?? N,
    REGISTRATION_MANAGER: cells.REGISTRATION_MANAGER ?? N,
    ACADEMIC_APPROVER: cells.ACADEMIC_APPROVER ?? N,
  },
});

const MY_TRACKS = "רק במסלולים שלה";
const MY_UNIT = "רק במסלולים של היחידה שלו";
const MY_LETTER = "רק במכתב שנשלח אליו בקישור";

export const RULE_GROUPS: readonly RuleGroup[] = [
  {
    title: "צפייה",
    rows: [
      row(
        "view-all",
        "לראות את כל המכתבים",
        "access.ts canGlobal VIEW_ALL_LETTERS; abilities.view",
        {
          ADMIN: Y,
          CONTROL_MANAGER: Y,
          VP_REGISTRATION: Y,
          CONTROL_ADVISOR: P("רק המסלולים שלה"),
          REGISTRATION_MANAGER: P("רק המסלולים של היחידה שלו"),
          ACADEMIC_APPROVER: P(MY_LETTER),
        },
        { hint: "כולל מגדל הפיקוח ורשימת כל המכתבים בעונה", global: "VIEW_ALL_LETTERS" },
      ),
      row(
        "comment",
        "להעיר על המכתב",
        "access.ts abilities.comment",
        {
          ADMIN: Y,
          CONTROL_MANAGER: Y,
          VP_REGISTRATION: Y,
          CONTROL_ADVISOR: P(MY_TRACKS),
          REGISTRATION_MANAGER: P(MY_UNIT),
          ACADEMIC_APPROVER: P(MY_LETTER),
        },
        { hint: "בזמן הבדיקה, האישור האקדמי והאישור הסופי (לא בהכנה ולא אחרי האישור)" },
      ),
    ],
  },
  {
    title: "הכנת המכתב",
    rows: [
      row(
        "create-letter",
        "להקים דרישת מכתב (מסלול אחד)",
        "access.ts canGlobal CREATE_LETTER_REQUEST",
        { CONTROL_MANAGER: Y, VP_REGISTRATION: Y, CONTROL_ADVISOR: Y, REGISTRATION_MANAGER: Y },
        { global: "CREATE_LETTER_REQUEST" },
      ),
      row("upload", "להעלות גרסה (Word ו-PDF)", "access.ts abilities.uploadVersion", {
        CONTROL_MANAGER: P("בכל עת, עד שהמכתב מאושר"),
        CONTROL_ADVISOR: P("כשהמכתב אצלה: בהכנה או בתיקון"),
      }),
      row("submit", "לשלוח לבדיקה", "access.ts abilities.submit; flow.ts submit", {
        CONTROL_MANAGER: Y,
        CONTROL_ADVISOR: P(MY_TRACKS),
      }, { hint: "רק כשיש גרסה, וכשהוגדרו מנהל רישום (או \"רק סמנכ\"ל\") וסמנכ\"ל" }),
      row("handle-comments", "לסמן הערה כ\"תוקן\" או \"לא מקובל\"", "access.ts abilities.handleComments", {
        CONTROL_MANAGER: Y,
        CONTROL_ADVISOR: P(MY_TRACKS),
      }),
      row("resubmit", "\"שלחתי תיקונים\"", "access.ts abilities.resubmit; flow.ts resubmit", {
        CONTROL_MANAGER: Y,
        CONTROL_ADVISOR: P(MY_TRACKS),
      }, { hint: "רק אחרי שכל ההערות הפתוחות קיבלו תשובה" }),
    ],
  },
  {
    title: "בדיקה ואישור",
    rows: [
      row("decide", "לאשר או להחזיר לתיקון", "access.ts abilities.decide; flow.ts seatsOf, decide", {
        CONTROL_MANAGER: P("במקום מנהל הרישום או הסמנכ\"ל (נרשם \"במקום\"), ובתור הבקרה אם העונה מוגדרת כך"),
        VP_REGISTRATION: P("כשמגיע תורו"),
        REGISTRATION_MANAGER: P(`כשמגיע תורו, ${MY_UNIT}`),
        ACADEMIC_APPROVER: P(MY_LETTER),
      }, { hint: "רק כשהמכתב לא בתיקון אצל היועצת" }),
      row("retract", "לבטל את האישור שלי", "access.ts abilities.retract; flow.ts retract", {
        CONTROL_MANAGER: P("אישור שנתנה בעצמה"),
        VP_REGISTRATION: P("אישור שנתן בעצמו"),
        REGISTRATION_MANAGER: P("אישור שנתן בעצמו"),
        ACADEMIC_APPROVER: P("אישור שנתן בעצמו"),
      }),
      row("send-academic", "לשלוח לגורם אקדמי", "access.ts abilities.sendToAcademic", {
        CONTROL_MANAGER: Y,
        VP_REGISTRATION: Y,
        CONTROL_ADVISOR: P(MY_TRACKS),
        REGISTRATION_MANAGER: P(MY_UNIT),
      }, { hint: "אחרי שכל הבודקים אישרו" }),
      row("skip-academic", "לדלג על הגורם האקדמי", "access.ts abilities.skipAcademic; flow.ts skipAcademic", {
        CONTROL_MANAGER: Y,
        VP_REGISTRATION: Y,
      }),
      row("final", "אישור סופי", "access.ts abilities.decide (FINAL); flow.ts decide", {
        CONTROL_MANAGER: P("במקום הסמנכ\"ל (נרשם \"במקום\", והוא מקבל הודעה)"),
        VP_REGISTRATION: Y,
      }, { hint: "רק כשאין הערות פתוחות" }),
      row("reset", "\"אשרו מחדש\" (כל הבודקים מאשרים שוב)", "access.ts abilities.resetApprovals; flow.ts resetApprovals", {
        CONTROL_MANAGER: Y,
        VP_REGISTRATION: Y,
      }),
      row("remind", "לשלוח תזכורת למי שהמכתב אצלו", "access.ts abilities.remind", {
        CONTROL_MANAGER: Y,
        VP_REGISTRATION: Y,
      }),
    ],
  },
  {
    title: "אחרי האישור",
    rows: [
      row("gilboa", "לסמן \"הועלה לגלבוע\"", "access.ts abilities.markInGilboa", {
        CONTROL_MANAGER: Y,
        CONTROL_ADVISOR: P(MY_TRACKS),
      }),
      row("reopen", "לפתוח מחדש מכתב מאושר", "access.ts abilities.reopen; flow.ts reopen", {
        CONTROL_MANAGER: Y,
        VP_REGISTRATION: Y,
      }),
    ],
  },
  {
    title: "ניהול",
    rows: [
      row(
        "seasons",
        "לפתוח עונה ולשנות את הגדרותיה",
        "access.ts canGlobal MANAGE_SEASONS",
        { ADMIN: Y, CONTROL_MANAGER: Y, VP_REGISTRATION: Y },
        { global: "MANAGE_SEASONS" },
      ),
      row(
        "units",
        "להקים מסלולים מקובץ, לשייך מנהל רישום ואנשים נוספים, קמפוסים ופקולטות",
        "access.ts canGlobal MANAGE_UNITS",
        { ADMIN: Y, CONTROL_MANAGER: Y, VP_REGISTRATION: Y },
        { global: "MANAGE_UNITS" },
      ),
      row("advisor", "להחליף יועצת במסלול", "access.ts abilities.reassignAdvisor", { CONTROL_MANAGER: Y }),
      row(
        "users",
        "לנהל משתמשים (הוספה, תפקידים, סיסמה, השבתה)",
        "access.ts canGlobal MANAGE_USERS",
        { ADMIN: Y, CONTROL_MANAGER: Y },
        { global: "MANAGE_USERS" },
      ),
      row(
        "rules",
        "לראות את מסך הכללים",
        "access.ts canGlobal MANAGE_RULES",
        { ADMIN: Y, CONTROL_MANAGER: Y },
        { global: "MANAGE_RULES" },
      ),
    ],
  },
];
