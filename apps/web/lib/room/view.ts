// Display helpers for the review room: words and small view shapes. No rules live here: what a
// person may do always comes from `room.can` (packages/domain abilities); this file only turns
// data into Hebrew sentences and picks which of the allowed actions to put forward.
import type { Abilities, Blocker, FlowState, Phase, SeatKey } from "@al/domain";
import type { LetterRoom, RoomAcademic, RoomComment, RoomEvent, RoomSeat, RoomVersion } from "@/lib/letters/queries";

/** Everything the room's client components need, as plain serialisable data. */
export interface RoomProps {
  id: string;
  me: { id: string; name: string };
  trackName: string;
  trackNumber: string;
  campus: string;
  faculty: string;
  seasonId: string;
  seasonName: string;
  phase: Phase;
  state: FlowState;
  latestVersion: number;
  holderNames: string[];
  waitingDays: number | null;
  openComments: number;
  blockers: Blocker[];
  advisorName: string;
  managerNames: string[];
  inGilboaAt: Date | null;
  can: Abilities;
  seats: RoomSeat[];
  comments: RoomComment[];
  versions: RoomVersion[];
  history: RoomEvent[];
  academics: RoomAcademic[];
  advisors: { id: string; name: string }[];
  extraPeople: LetterRoom["extraPeople"];
  addable: LetterRoom["addable"];
  starter: LetterRoom["starter"];
  noNewVersionSinceReturn: boolean;
  names: Record<string, string>;
  advisorId: string | null;
}

export function toRoomProps(room: LetterRoom, me: { id: string; name: string }): RoomProps {
  const { row, season, summary } = room;
  return {
    id: row.id,
    me,
    trackName: row.trackName,
    trackNumber: row.trackNumber,
    campus: row.campus,
    faculty: row.faculty,
    seasonId: season.id,
    seasonName: season.name,
    phase: summary.phase,
    state: summary.state,
    latestVersion: row.latestVersion,
    holderNames: summary.holderNames,
    waitingDays: summary.waitingDays,
    openComments: summary.openComments,
    blockers: summary.blockers as Blocker[],
    advisorName: summary.advisorName,
    managerNames: room.managerNames,
    inGilboaAt: row.inGilboaAt ?? null,
    can: room.can,
    seats: room.seats,
    comments: room.comments,
    versions: room.versions,
    history: room.history,
    academics: room.academics,
    advisors: room.advisors,
    extraPeople: room.extraPeople,
    addable: room.addable,
    starter: room.starter,
    noNewVersionSinceReturn: room.noNewVersionSinceReturn,
    names: room.names,
    advisorId: row.advisorId,
  };
}

/** "יוסי ארנפויד" → "יוסי"; "פרופ׳ לוי, ראש חוג (דמו)" → "פרופ׳ לוי". For short sentences. */
export function shortName(name: string | null | undefined): string {
  if (!name) return "—";
  const clean = name.replace(/\s*\([^)]*\)\s*/g, " ").split(",")[0]!.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  if (/^(פרופ|ד"?ר|דוקטור|פרופסור)/.test(words[0]!) && words[1]) return `${words[0]} ${words[1]}`;
  return words[0]!;
}

/** "יוסי", "יוסי ואורון", "יוסי, אורון ושקד". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ו${names.at(-1)}`;
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** The five steps, in the short words of the step bar. */
export const STEP_LABELS: Record<Phase, string> = {
  DRAFT: "הכנה",
  REVIEW: "בדיקה",
  ACADEMIC: "אקדמי",
  FINAL: "סופי",
  APPROVED: "מאושר",
};

/** What each blocker means and what to do about it, in plain words. */
export const BLOCKER_HELP: Record<Blocker, { title: string; todo: string }> = {
  NO_VERSION: { title: "עדיין לא הועלתה גרסה", todo: "מעלים את ה-PDF של המכתב בלשונית \"גרסאות\", ואז שולחים." },
  NO_ADVISOR: { title: "עוד לא שויכה יועצת למסלול", todo: "ורוניקה משבצת יועצת בהגדרות, במסך \"מסלולים והקצאות\"." },
  NO_REGISTRATION_MANAGER: {
    title: "עוד לא שויך מנהל רישום למסלול",
    todo: "ורוניקה משבצת מנהל רישום בהגדרות, במסך \"מסלולים והקצאות\".",
  },
  NO_VP: { title: 'לא הוגדר סמנכ"ל רישום במערכת', todo: "ורוניקה מגדירה אותו במסך \"משתמשים\"." },
  OPEN_COMMENTS: { title: "יש הערות פתוחות", todo: "לכל הערה מסמנים \"תוקן\" או \"לא מקובל\" עם הסבר." },
};

/** The seat as people say it: "מנהל רישום", "סמנכ\"ל רישום", "אישור סופי", or the academic's name. */
export function seatTitle(seat: Pick<RoomSeat, "role" | "label">): string {
  return seat.label;
}

/** The label of the decide button for a seat. */
export function approveLabel(key: SeatKey): string {
  return key === "FINAL" ? "אשר סופית" : "אשר";
}

export function returnLabel(key: SeatKey): string {
  return key.startsWith("ACADEMIC:") ? "בקש תיקון" : "החזר לתיקון";
}

/** "הצעה לנוסח" is stored as one text; the room writes it in this shape and reads it back. */
export function composeSuggestion(from: string | undefined, to: string | undefined): string | undefined {
  const a = from?.trim();
  const b = to?.trim();
  if (!a && !b) return undefined;
  if (a && b) return `במקום: ${a}\nכתבו: ${b}`;
  if (b) return `כתבו: ${b}`;
  return `במקום: ${a}\nכתבו: `;
}

export function parseSuggestion(text: string | null): { from: string | null; to: string | null; raw: string | null } {
  if (!text) return { from: null, to: null, raw: null };
  const m = /^(?:במקום: ([\s\S]*?)\n)?כתבו: ([\s\S]*)$/.exec(text);
  if (!m) return { from: null, to: null, raw: text };
  return { from: m[1]?.trim() || null, to: m[2]?.trim() || null, raw: null };
}

const dayMs = 24 * 60 * 60 * 1000;

/** "היום", "אתמול", "לפני 3 ימים", or a date. */
export function relativeDay(d: Date, now = Date.now()): string {
  const days = Math.floor((now - new Date(d).getTime()) / dayMs);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 14) return `לפני ${days} ימים`;
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" }).format(d);
}

const SEAT_WORDS: Record<string, string> = { CONTROL: "בבדיקת בקרה", RM: "כמנהל רישום", VP: 'כסמנכ"ל', FINAL: "סופי" };
const PHASE_WORDS: Record<string, string> = {
  DRAFT: "הכנה",
  REVIEW: "בדיקה",
  ACADEMIC: "גורם אקדמי",
  FINAL: "אישור סופי",
  APPROVED: "מאושר להפצה",
};

/**
 * One event of the letter's history as "who · what", in neutral nouns (no he/she guessing), or
 * null for events that are noise on this screen (a reviewer's private draft comment, for example).
 */
export function eventText(
  e: RoomEvent,
  names: Record<string, string>,
): { who: string; text: string; detail?: string; tone?: "good" | "bad" | "acad" | "muted" } | null {
  const who = e.actorName ? shortName(e.actorName) : "המערכת";
  const d = e.data;
  const nameOf = (id: unknown) => (typeof id === "string" ? shortName(names[id]) : "—");
  const note = typeof d.note === "string" && d.note ? d.note : undefined;
  const behalf = d.onBehalfOf ? ` (במקום ${nameOf(d.onBehalfOf)})` : "";
  const seat = typeof d.seat === "string" ? d.seat : "";
  const seatWord = seat.startsWith("ACADEMIC:") ? " כגורם אקדמי" : SEAT_WORDS[seat] ? ` ${SEAT_WORDS[seat]}` : "";
  const r = (text: string, tone?: "good" | "bad" | "acad" | "muted", detail?: string) => ({ who: `${who}${behalf}`, text, tone, detail });
  switch (e.type) {
    case "LETTER_CREATED":
      return r("פתיחת דרישת המכתב", "muted");
    case "VERSION_UPLOADED":
      return r(`העלאת גרסה ${d.number ?? ""}`.trim());
    case "SUBMITTED":
      return r(`שליחה לבדיקה · גרסה ${d.version ?? "?"}`);
    case "APPROVED": {
      const n = Number(d.comments ?? 0);
      return r(`אישור${seatWord} · גרסה ${d.version ?? "?"}${n > 0 ? ` · עם ${plural(n, "הערה אחת", "הערות")}` : ""}`, "good", note);
    }
    case "RETURNED": {
      const n = Number(d.comments ?? 0);
      return r(`החזרה לתיקון${seatWord} · גרסה ${d.version ?? "?"}${n > 0 ? ` · ${plural(n, "הערה אחת", "הערות")}` : ""}`, "bad", note);
    }
    case "RESUBMITTED":
      return r(`"שלחתי תיקונים" · גרסה ${d.version ?? "?"}`);
    case "APPROVAL_RETRACTED":
      return r(`ביטול האישור${seatWord}`);
    case "ACADEMIC_SKIPPED":
      return r("דילוג על הגורם האקדמי", undefined, note);
    case "APPROVALS_RESET":
      return r("בקשה שכולם יאשרו מחדש", undefined, note);
    case "REOPENED":
      return r("פתיחה מחדש של המכתב", undefined, note);
    case "IN_GILBOA":
      return r("סימון \"הועלה לגלבוע\"", "good");
    case "REMINDED": {
      const to = Array.isArray(d.to) ? d.to.map(nameOf) : [];
      return r(`תזכורת${to.length ? ` ל${joinNames(to)}` : ""}`, "muted");
    }
    case "COMMENT_CREATED":
      return d.draft ? null : r("הערה חדשה", "muted");
    case "COMMENT_STATUS": {
      const what = d.to === "RESOLVED_FIXED" ? "הערה סומנה \"תוקן\"" : d.to === "RESOLVED_NO_CHANGE" ? "הערה סומנה \"לא מקובל\"" : "הערה נפתחה מחדש";
      return r(what, "muted", note);
    }
    case "ADVISOR_CHANGED":
      return r(`החלפת יועצת: ${nameOf(d.from)} ← ${nameOf(d.to)}`);
    case "REGISTRATION_MANAGER_SET":
      return r(d.userId ? `מנהל רישום למסלול: ${nameOf(d.userId)}` : "מנהל הרישום חזר לברירת המחדל");
    case "PERSON_ADDED":
      return r(`צירוף ${nameOf(d.userId)} למסלול (${d.kind === "ADVISOR" ? "יועצת" : "מנהל"})`);
    case "PERSON_REMOVED":
      return r(`הסרת ${nameOf(d.userId)} מהמסלול`);
    case "ACADEMIC_ADDED":
      return r(`שליחה לגורם אקדמי: ${nameOf(d.userId)}`, "acad");
    case "ACADEMIC_REMOVED":
      return r(`הסרת הגורם האקדמי ${nameOf(d.userId)}`, "acad");
    case "ACADEMIC_LINK_ISSUED":
      return r(`קישור אישי חדש ל${nameOf(d.userId)}`, "muted");
    case "ACADEMIC_LINK_OPENED":
      return r("פתיחת הקישור האישי", "acad");
    case "PHASE_CHANGED":
      return { who: "המערכת", text: `המכתב עבר לשלב: ${PHASE_WORDS[String(d.to)] ?? String(d.to)}`, tone: "muted" };
    case "SHAREPOINT_FILE_CREATED":
      return r("יצירת קובץ עבודה ב-Word", "muted");
    default:
      return null;
  }
}

/** Comments the person wrote and has not published yet (they go out with the decision). */
export const myDrafts = (comments: readonly RoomComment[], meId: string) => comments.filter((c) => c.isDraft && c.authorId === meId);

export const isOpen = (c: Pick<RoomComment, "status">) => c.status === "OPEN";
