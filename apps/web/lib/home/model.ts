// The home screen's view of the letters: which groups ("לטיפול", "ממתין לבדיקה שלך"…) each person
// sees, how the list is filtered and sorted, and the tower's lists. Plain functions over the ready
// summaries from lib/letters/queries.ts: no flow rules here, only grouping of what the core decided.
import { PHASES, type FlowState, type HolderKind, type Phase, type Role } from "@al/domain";
import type { HolderLine, LetterSummary } from "../letters/queries";

/** One letter on the home screen: the shared summary plus who manages it and what the actor may do in bulk. */
export interface HomeLetter extends LetterSummary {
  /** Registration manager(s) of the letter right now (the unit's, the track's own, or added ones). */
  rmIds: string[];
  rmNames: string[];
  /** Every advisor of the track: the main one and any added by the control manager. */
  advisorIds: string[];
  /** The actor may send a reminder about this letter ("תזכיר"). */
  canRemind: boolean;
  /** The actor may give the final approval right now (in their own name or in the VP's place). */
  canFinal: boolean;
  /** When the final approval would be in someone else's place: their name. */
  finalOnBehalfOf: string | null;
  /** Comments the actor wrote and has not published yet (they publish with a decision). */
  myDrafts: number;
}

/** Which parts of the home screen a person gets. A person can hold several (שולי: advisor + registration manager). */
export interface Persona {
  control: boolean;
  vp: boolean;
  rm: boolean;
  advisor: boolean;
}

export function personaOf(roles: readonly Role[], userId: string, letters: readonly HomeLetter[]): Persona {
  const control = roles.includes("CONTROL_MANAGER") || roles.includes("ADMIN");
  return {
    control,
    vp: roles.includes("VP_REGISTRATION"),
    rm: roles.includes("REGISTRATION_MANAGER") || letters.some((l) => l.rmIds.includes(userId)),
    advisor: roles.includes("CONTROL_ADVISOR") || letters.some((l) => l.advisorIds.includes(userId)),
  };
}

// ---------------------------------------------------------------- groups (the tiles filter by them)

export const GROUPS = [
  "all",
  "mine",
  "todo",
  "review",
  "final",
  "others",
  "done",
  ...PHASES,
  "fixing",
  "overdue",
  "blocked",
  "link",
  "gilboa",
  "notstarted",
] as const;
export type Group = (typeof GROUPS)[number];

const REVIEWING: HolderKind[] = ["REVIEWERS", "ACADEMIC", "SIGNER"];

/** What each group holds. `me` is the signed-in person. */
export function inGroup(l: HomeLetter, g: Group, me: string): boolean {
  switch (g) {
    case "all":
      return true;
    case "mine":
      return l.mine;
    case "todo":
      return l.mine && l.holderKind === "ADVISOR";
    case "review":
      return l.mine && l.holderKind === "REVIEWERS";
    case "final":
      return l.mine && l.holderKind === "SIGNER";
    case "others":
      return l.advisorIds.includes(me) && REVIEWING.includes(l.holderKind);
    case "done":
      return l.advisorIds.includes(me) && l.state === "APPROVED";
    case "fixing":
      return l.state === "FIXING";
    case "overdue":
      return l.overdue;
    case "blocked":
      return l.state === "BLOCKED";
    case "link":
      return l.academicLinkProblem !== null;
    case "gilboa":
      return l.state === "LOADING";
    case "notstarted":
      return l.phase === "DRAFT" && l.latestVersion === 0;
    default:
      return l.phase === g;
  }
}

/** The name of each group, as a heading over the list. */
export const GROUP_TITLES: Record<Group, string> = {
  all: "כל המכתבים",
  mine: "ממתין לך",
  todo: "לטיפול שלך",
  review: "ממתין לבדיקה שלך",
  final: "ממתין לאישור הסופי שלך",
  others: "בבדיקה אצל אחרים",
  done: "מאושרים",
  DRAFT: "בהכנה",
  REVIEW: "בבדיקה",
  ACADEMIC: "אצל גורם אקדמי",
  FINAL: "ממתינים לאישור סופי",
  APPROVED: "מאושרים להפצה",
  fixing: "בתיקון אצל היועצות",
  overdue: "באיחור",
  blocked: "חסר בעל תפקיד",
  link: "קישור אקדמי שפג או לא נפתח",
  gilboa: "מאושרים שטרם עלו לגלבוע",
  notstarted: "לא התחילו (אין גרסה)",
};

/** The personal tiles at the top of the screen, in order, for this person. */
export function personalGroups(p: Persona): Group[] {
  const out: Group[] = [];
  if (p.advisor) out.push("todo");
  if (p.rm || p.vp) out.push("review");
  if (p.vp) out.push("final");
  if (p.advisor) out.push("others", "done");
  // The control manager's own queue shows only when something waits for her personally.
  if (p.control && out.length === 0) out.push("mine");
  return out;
}

/** The list the screen opens on, when the address does not say. */
export function defaultGroup(p: Persona): Group {
  if (p.control) return "all";
  // What waits for this person: one kind of wait opens on its own tile ("לטיפול שלך" for an
  // advisor); several kinds (the VP reviews and signs) open on everything that waits, together.
  const waiting = personalGroups(p).filter((g) => g === "todo" || g === "review" || g === "final");
  return waiting.length === 1 ? waiting[0]! : waiting.length > 1 ? "mine" : "all";
}

// ---------------------------------------------------------------- filters (kept in the address)

export const SORTS = ["wait", "track", "code"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = {
  wait: "זמן המתנה",
  track: "שם מסלול",
  code: "קוד מסלול",
};

export interface Filters {
  g?: Group;
  campus?: string;
  faculty?: string;
  q?: string;
  advisor?: string;
  rm?: string;
  holder?: string;
  sort?: Sort;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 200) : undefined;
};
const isUuid = (s: string | undefined) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);

/** Reads the filters from the address. Anything unknown is ignored, never an error. */
export function parseFilters(params: Params): Filters {
  const g = one(params.g);
  const sort = one(params.sort);
  return {
    g: (GROUPS as readonly string[]).includes(g ?? "") ? (g as Group) : undefined,
    campus: one(params.campus),
    faculty: one(params.faculty),
    q: one(params.q),
    advisor: isUuid(one(params.advisor)),
    rm: isUuid(one(params.rm)),
    holder: isUuid(one(params.holder)),
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as Sort) : undefined,
  };
}

/** The filters as an address query (without the empty ones), for links and the export. */
export function filterQuery(f: Filters, change: Partial<Filters> = {}): string {
  const merged = { ...f, ...change };
  const q = new URLSearchParams();
  for (const key of ["g", "holder", "campus", "faculty", "advisor", "rm", "q", "sort"] as const) {
    const v = merged[key];
    if (v) q.set(key, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * Text for search: lower case, single spaces, and without the quote marks that Hebrew names are
 * written with in many ways (נדל"ן, נדל״ן, נדלן).
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'׳״`]/g, "")
    .replace(/[\s\-–־_.]+/g, " ")
    .trim();
}

export function matchesSearch(l: Pick<LetterSummary, "trackName" | "trackNumber">, q: string): boolean {
  const words = normalize(q).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalize(`${l.trackName} ${l.trackNumber}`);
  return words.every((w) => hay.includes(w));
}

/** The filters other than the group: campus, faculty, search, advisor, registration manager, holder. */
export function applyFilters(items: readonly HomeLetter[], f: Filters, me: string, group: Group): HomeLetter[] {
  return items.filter(
    (l) =>
      inGroup(l, group, me) &&
      (!f.campus || l.campus === f.campus) &&
      (!f.faculty || l.faculty === f.faculty) &&
      (!f.advisor || l.advisorIds.includes(f.advisor)) &&
      (!f.rm || l.rmIds.includes(f.rm)) &&
      (!f.holder || l.holderIds.includes(f.holder)) &&
      (!f.q || matchesSearch(l, f.q)),
  );
}

const he = new Intl.Collator("he", { numeric: true, sensitivity: "base" });

/**
 * For equal waits: letters someone has to act on before letters that are just in progress
 * (being fixed, stuck, ready to send… before "being prepared"), finished ones last.
 */
const STATE_ORDER: FlowState[] = ["FIXING", "BLOCKED", "READY_FOR_ACADEMIC", "AWAITING_FINAL", "IN_REVIEW", "WITH_ACADEMIC", "LOADING", "PREPARING", "APPROVED"];

export function sortItems(items: HomeLetter[], sort: Sort = "wait"): HomeLetter[] {
  const byTrack = (a: HomeLetter, b: HomeLetter) => he.compare(a.trackName, b.trackName) || he.compare(a.trackNumber, b.trackNumber);
  if (sort === "track") return items.sort(byTrack);
  if (sort === "code") return items.sort((a, b) => he.compare(a.trackNumber, b.trackNumber));
  // Longest wait first; finished letters (no wait) at the end.
  return items.sort(
    (a, b) =>
      (b.waitingDays ?? -1) - (a.waitingDays ?? -1) ||
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      b.latestVersion - a.latestVersion ||
      byTrack(a, b),
  );
}

/** True when anything besides the group narrows the list. */
export const hasNarrowing = (f: Filters) => Boolean(f.campus || f.faculty || f.q || f.advisor || f.rm || f.holder);

// ---------------------------------------------------------------- options for the filter bar

export interface Option {
  value: string;
  label: string;
}

const sortedOptions = (pairs: Iterable<[string, string]>): Option[] =>
  [...new Map(pairs)].map(([value, label]) => ({ value, label })).sort((a, b) => he.compare(a.label, b.label));

export function filterOptions(items: readonly HomeLetter[]) {
  return {
    campuses: sortedOptions(items.map((l) => [l.campus, l.campus])),
    faculties: sortedOptions(items.map((l) => [l.faculty, l.faculty])),
    advisors: sortedOptions(items.map((l) => [l.advisorId, l.advisorName])),
    managers: sortedOptions(items.flatMap((l) => l.rmIds.map((id, i): [string, string] => [id, l.rmNames[i] ?? "—"]))),
  };
}

// ---------------------------------------------------------------- counts for the dashboard

export function countBy<T extends string>(items: readonly HomeLetter[], key: (l: HomeLetter) => T): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const l of items) {
    const k = key(l);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function phaseCounts(items: readonly HomeLetter[]): Record<Phase, number> {
  const out = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>;
  for (const l of items) out[l.phase]++;
  return out;
}

/** Longest wait among the letters, or null when none is waiting. */
export function oldestWait(items: readonly HomeLetter[]): number | null {
  const days = items.map((l) => l.waitingDays).filter((d): d is number => d !== null);
  return days.length ? Math.max(...days) : null;
}

/** How many letters of each state, for a short breakdown ("2 בתיקון · 1 בהכנה"). */
export function stateBreakdown(items: readonly HomeLetter[]): [FlowState, number][] {
  return Object.entries(countBy(items, (l) => l.state)) as [FlowState, number][];
}

/** Every person who holds letters, with the letters and a breakdown by state; longest wait first. */
export interface HolderRow {
  userId: string;
  name: string;
  count: number;
  oldestDays: number;
  states: [FlowState, number][];
  /** Letters about which the actor may send a reminder. */
  remindable: number;
}

/** The tower's holder lines (already in order), with what the screen adds: states and reminders. */
export function holderRows(holders: readonly HolderLine[], items: readonly HomeLetter[]): HolderRow[] {
  const byId = new Map(items.map((l) => [l.id, l]));
  return holders.map((h) => {
    const letters = h.letterIds.map((id) => byId.get(id)).filter((l): l is HomeLetter => Boolean(l));
    return {
      userId: h.userId,
      name: h.name,
      count: h.count,
      oldestDays: h.oldestDays,
      states: stateBreakdown(letters),
      remindable: letters.filter((l) => l.canRemind).length,
    };
  });
}

/** Letters the actor may approve finally in one go: their turn, nothing open, no unpublished comments of theirs. */
export const finalEligible = (l: Pick<HomeLetter, "canFinal" | "openComments" | "myDrafts">) => l.canFinal && l.openComments === 0 && l.myDrafts === 0;
