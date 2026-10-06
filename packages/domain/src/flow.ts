// The life of one acceptance letter: who holds it right now, what has been decided, and where it
// goes next. Pure functions over plain data, so the server, the tests and the screens agree.
//
// Five phases. In each one exactly one party "holds" the letter:
//   DRAFT     the advisor prepares it
//   REVIEW    the registration manager, then the VP (or both at once, by season setting)
//   ACADEMIC  the advisor sends it to an academic approver, who answers through a personal link
//   FINAL     the VP signs (the control manager can sign in the VP's place)
//   APPROVED  approved for distribution; the advisor marks it as loaded into Gilboa
// "Fixing" is a state inside a phase, not a phase: while a published comment is open (or a reviewer
// returned the letter) the advisor holds it, and nobody decides until she answers every comment.

export const PHASES = ["DRAFT", "REVIEW", "ACADEMIC", "FINAL", "APPROVED"] as const;
export type Phase = (typeof PHASES)[number];

export type SeatKey = "CONTROL" | "RM" | "VP" | "FINAL" | `ACADEMIC:${string}`;
export type SeatRole = "CONTROL" | "RM" | "VP" | "FINAL" | "ACADEMIC";

/** CLEARED cancels the seat's earlier decision (a retracted approval, or a returned letter resubmitted). */
export type DecisionKind = "APPROVED" | "CHANGES" | "CLEARED";

export interface Decision {
  seat: SeatKey;
  kind: DecisionKind;
  /** Who pressed the button. */
  userId: string;
  /** Set when someone acted in another person's place (the control manager for the VP). */
  onBehalfOf?: string | null;
  versionNumber: number;
  note?: string | null;
  at: Date;
}

export interface FlowSettings {
  /** Registration manager first, then the VP. False: both at once. */
  sequential: boolean;
  /** The control manager reviews before the registration manager. */
  controlReview: boolean;
}

export const DEFAULT_SETTINGS: FlowSettings = { sequential: true, controlReview: false };

export interface FlowPeople {
  advisorId: string;
  /** More advisors added to this track by the control manager; they prepare and fix like the main one. */
  extraAdvisorIds: readonly string[];
  /** Who is the registration manager for this letter right now (empty = nobody set). */
  rmIds: readonly string[];
  /** "In this unit only the VP reviews": no registration manager is needed. */
  onlyVp: boolean;
  vpIds: readonly string[];
  controlIds: readonly string[];
}

export interface FlowInput {
  phase: Phase;
  /** Highest version number uploaded so far, 0 when there is none. */
  latestVersion: number;
  settings: FlowSettings;
  people: FlowPeople;
  /** Academic approvers invited to this letter (each has a personal link). */
  academics: readonly string[];
  /** Decisions in chronological order. */
  decisions: readonly Decision[];
  /** Published comments still open. */
  openComments: number;
  /**
   * The advisor is mid-fix: set when a reviewer published comments or returned the letter, cleared
   * when she presses "שלחתי תיקונים". It keeps the letter with her even after every comment is
   * marked fixed, so the next reviewer never sees a letter before the new version is uploaded.
   */
  advisorHold: boolean;
  /** Approved and marked as loaded into Gilboa. */
  inGilboa: boolean;
}

export type SeatStatus = "approved" | "returned" | "pending";
export type Turn = "now" | "later" | "done";

export interface Seat {
  key: SeatKey;
  role: SeatRole;
  holderIds: readonly string[];
  status: SeatStatus;
  turn: Turn;
  /** Approved by being the advisor herself (she is also the registration manager). */
  auto: boolean;
  decision?: Decision;
}

/**
 * What the letter is doing, in the words people use:
 * PREPARING (advisor), IN_REVIEW (reviewers), FIXING (advisor, has comments), READY_FOR_ACADEMIC
 * (advisor sends it), WITH_ACADEMIC, AWAITING_FINAL (VP), APPROVED, LOADING (approved, advisor
 * loads it into Gilboa), BLOCKED (cannot move: nobody to review).
 */
export type FlowState =
  | "PREPARING"
  | "IN_REVIEW"
  | "FIXING"
  | "READY_FOR_ACADEMIC"
  | "WITH_ACADEMIC"
  | "AWAITING_FINAL"
  | "LOADING"
  | "APPROVED"
  | "BLOCKED";

export type HolderKind = "ADVISOR" | "REVIEWERS" | "ACADEMIC" | "SIGNER" | "NONE";

export type Blocker = "NO_VERSION" | "NO_REGISTRATION_MANAGER" | "NO_VP" | "OPEN_COMMENTS";

export interface FlowView {
  phase: Phase;
  state: FlowState;
  holder: { kind: HolderKind; userIds: readonly string[] };
  seats: readonly Seat[];
  /** The advisor has comments to answer, or a reviewer returned the letter. */
  fixing: boolean;
  /** What stops the letter from moving on, when it cannot. */
  blockers: readonly Blocker[];
  /** The phase the letter goes to by itself right now, or null. */
  advanceTo: Phase | null;
}

export class FlowError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PHASE"
      | "NO_VERSION"
      | "NO_REGISTRATION_MANAGER"
      | "NO_VP"
      | "OPEN_COMMENTS"
      | "NOT_YOUR_TURN"
      | "FIXING"
      | "NOTE_REQUIRED"
      | "NO_ACADEMIC"
      | "NOTHING_TO_RETRACT",
    message: string,
  ) {
    super(message);
    this.name = "FlowError";
  }
}

const SEAT_ROLE = (key: SeatKey): SeatRole => (key.startsWith("ACADEMIC:") ? "ACADEMIC" : (key as SeatRole));
export const academicSeat = (userId: string): SeatKey => `ACADEMIC:${userId}`;

function lastDecision(decisions: readonly Decision[], seat: SeatKey): Decision | undefined {
  for (let i = decisions.length - 1; i >= 0; i--) if (decisions[i]!.seat === seat) return decisions[i];
  return undefined;
}

function statusOf(decisions: readonly Decision[], seat: SeatKey): { status: SeatStatus; decision?: Decision } {
  const d = lastDecision(decisions, seat);
  if (!d || d.kind === "CLEARED") return { status: "pending" };
  return { status: d.kind === "APPROVED" ? "approved" : "returned", decision: d };
}

/** The seats of the letter's current phase, in order, with whose turn it is. */
export function seatsOf(input: FlowInput): Seat[] {
  const { phase, people, settings, decisions } = input;
  const keys: { key: SeatKey; holders: readonly string[]; auto?: boolean }[] = [];
  if (phase === "REVIEW") {
    if (settings.controlReview) keys.push({ key: "CONTROL", holders: people.controlIds });
    if (!people.onlyVp && people.rmIds.length > 0) {
      keys.push({ key: "RM", holders: people.rmIds, auto: people.rmIds.includes(people.advisorId) });
    }
    keys.push({ key: "VP", holders: people.vpIds });
  } else if (phase === "ACADEMIC") {
    for (const id of input.academics) keys.push({ key: academicSeat(id), holders: [id] });
  } else if (phase === "FINAL" || phase === "APPROVED") {
    // Once approved, the final seat stays so the screens can say who signed.
    keys.push({ key: "FINAL", holders: people.vpIds });
  }

  const seats: Seat[] = keys.map(({ key, holders, auto }) => {
    const s = auto ? { status: "approved" as const, decision: undefined } : statusOf(decisions, key);
    return { key, role: SEAT_ROLE(key), holderIds: holders, status: s.status, turn: "later", auto: Boolean(auto), decision: s.decision };
  });

  // Whose turn: with a sequence, the first seat that has not approved; otherwise everyone who has not.
  let nowGiven = false;
  for (const seat of seats) {
    if (seat.status === "approved") seat.turn = "done";
    else if (phase !== "REVIEW" || !settings.sequential) seat.turn = "now";
    else if (!nowGiven) {
      seat.turn = "now";
      nowGiven = true;
    } else seat.turn = "later";
  }
  return seats;
}

/** Everything the screens and the rules need to know about where the letter stands. */
export function flowView(input: FlowInput): FlowView {
  const { phase, people } = input;
  const advisor = { kind: "ADVISOR" as const, userIds: [people.advisorId, ...people.extraAdvisorIds] };
  const none = { kind: "NONE" as const, userIds: [] as string[] };
  const seats = seatsOf(input);
  const returned = seats.some((s) => s.status === "returned");
  const base = { phase, seats, advanceTo: null as Phase | null };

  if (phase === "DRAFT") {
    const blockers: Blocker[] = [];
    if (input.latestVersion < 1) blockers.push("NO_VERSION");
    if (!people.onlyVp && people.rmIds.length === 0) blockers.push("NO_REGISTRATION_MANAGER");
    if (people.vpIds.length === 0) blockers.push("NO_VP");
    const stuck = blockers.includes("NO_REGISTRATION_MANAGER") || blockers.includes("NO_VP");
    return { ...base, state: stuck ? "BLOCKED" : "PREPARING", holder: advisor, fixing: false, blockers };
  }

  if (phase === "APPROVED") {
    return {
      ...base,
      state: input.inGilboa ? "APPROVED" : "LOADING",
      holder: input.inGilboa ? none : advisor,
      fixing: false,
      blockers: [],
    };
  }

  // REVIEW, ACADEMIC, FINAL
  const fixing = input.advisorHold || input.openComments > 0 || returned;
  if (fixing) {
    const blockers: Blocker[] = input.openComments > 0 ? ["OPEN_COMMENTS"] : [];
    return { ...base, state: "FIXING", holder: advisor, fixing: true, blockers };
  }

  if (phase === "ACADEMIC" && seats.length === 0)
    return { ...base, state: "READY_FOR_ACADEMIC", holder: advisor, fixing: false, blockers: [] };

  const waiting = seats.filter((s) => s.turn === "now");
  if (waiting.length === 0) {
    // Everyone approved: the letter moves on by itself.
    const advanceTo: Phase = phase === "REVIEW" ? "ACADEMIC" : phase === "ACADEMIC" ? "FINAL" : "APPROVED";
    const state: FlowState = advanceTo === "ACADEMIC" ? "READY_FOR_ACADEMIC" : advanceTo === "FINAL" ? "AWAITING_FINAL" : "LOADING";
    return { ...base, advanceTo, state, holder: advisor, fixing: false, blockers: [] };
  }

  const userIds = [...new Set(waiting.flatMap((s) => s.holderIds))];
  if (phase === "REVIEW") return { ...base, state: "IN_REVIEW", holder: { kind: "REVIEWERS", userIds }, fixing: false, blockers: [] };
  if (phase === "ACADEMIC") return { ...base, state: "WITH_ACADEMIC", holder: { kind: "ACADEMIC", userIds }, fixing: false, blockers: [] };
  return { ...base, state: "AWAITING_FINAL", holder: { kind: "SIGNER", userIds }, fixing: false, blockers: [] };
}

// ---------------------------------------------------------------- transitions

export interface DecideOptions {
  seat: SeatKey;
  kind: "APPROVED" | "CHANGES";
  userId: string;
  onBehalfOf?: string | null;
  note?: string | null;
  /** Comments the reviewer published together with this decision. */
  publishedComments?: number;
}

/**
 * Validates a reviewer's decision and returns what to record. "Approve" with comments means
 * "approved, subject to fixes": the approval stays, the advisor fixes, and the letter moves on
 * without coming back to this reviewer. "Return" needs a reason or a comment.
 */
export function decide(input: FlowInput, opts: DecideOptions, at = new Date()): Decision {
  const view = flowView(input);
  if (view.fixing) throw new FlowError("FIXING", "המכתב אצל היועצת לתיקונים. אפשר להוסיף הערות, ואי אפשר להחליט עד שהיא תסיים");
  const seat = view.seats.find((s) => s.key === opts.seat);
  if (!seat || seat.turn !== "now") throw new FlowError("NOT_YOUR_TURN", "זה עדיין לא תורך, או שכבר החלטת");
  if (opts.kind === "CHANGES" && !opts.note?.trim() && !(opts.publishedComments && opts.publishedComments > 0))
    throw new FlowError("NOTE_REQUIRED", "כדי להחזיר לתיקון צריך לכתוב הערה או לסמן אזור במכתב");
  if (opts.kind === "APPROVED" && input.phase === "FINAL" && input.openComments > 0)
    throw new FlowError("OPEN_COMMENTS", "יש הערות פתוחות. אי אפשר לאשר סופית עד שיטופלו");
  return {
    seat: opts.seat,
    kind: opts.kind,
    userId: opts.userId,
    onBehalfOf: opts.onBehalfOf ?? null,
    versionNumber: input.latestVersion,
    note: opts.note?.trim() || null,
    at,
  };
}

/** A reviewer takes back their own approval, so the letter is theirs to look at again. */
export function retract(input: FlowInput, seat: SeatKey, userId: string, at = new Date()): Decision {
  const s = seatsOf(input).find((x) => x.key === seat);
  if (!s || s.status !== "approved" || s.auto) throw new FlowError("NOTHING_TO_RETRACT", "אין אישור לבטל");
  return { seat, kind: "CLEARED", userId, versionNumber: input.latestVersion, at };
}

export interface SubmitResult {
  toPhase: Phase;
}

/** The advisor sends a draft to review. */
export function submit(input: FlowInput): SubmitResult {
  if (input.phase !== "DRAFT") throw new FlowError("INVALID_PHASE", "המכתב כבר נשלח לבדיקה");
  const view = flowView(input);
  if (view.blockers.includes("NO_VERSION")) throw new FlowError("NO_VERSION", "צריך להעלות גרסה לפני השליחה");
  if (view.blockers.includes("NO_REGISTRATION_MANAGER"))
    throw new FlowError("NO_REGISTRATION_MANAGER", "לא הוגדר מנהל רישום ליחידה. אפשר לפנות לוורוניקה");
  if (view.blockers.includes("NO_VP")) throw new FlowError("NO_VP", 'לא הוגדר סמנכ"ל רישום במערכת. אפשר לפנות לוורוניקה');
  return { toPhase: "REVIEW" };
}

export interface ResubmitResult {
  /** Seats whose "returned" decision is cleared, so they are asked again. */
  clear: SeatKey[];
  /** Where the letter goes: usually the next reviewer; after an academic fix, the final approval. */
  toPhase: Phase | null;
}

/** The advisor finished the fixes ("שלחתי תיקונים"). All comments must be answered first. */
export function resubmit(input: FlowInput, opts: { resendToAcademic?: boolean; version?: number } = {}): ResubmitResult {
  const view = flowView(input);
  if (!view.fixing) throw new FlowError("INVALID_PHASE", "אין תיקונים ממתינים");
  if (input.openComments > 0) throw new FlowError("OPEN_COMMENTS", "צריך להגיב לכל ההערות הפתוחות לפני השליחה");
  const clear = view.seats.filter((s) => s.status === "returned").map((s) => s.key);
  if (input.phase === "ACADEMIC" && !opts.resendToAcademic) return { clear: [], toPhase: "FINAL" };
  return { clear, toPhase: null };
}

/** The control manager or the VP skips the academic approver ("בסמכותם"). */
export function skipAcademic(input: FlowInput): { toPhase: Phase } {
  if (input.phase !== "ACADEMIC") throw new FlowError("INVALID_PHASE", "אפשר לדלג על הגורם האקדמי רק בשלב שלו");
  return { toPhase: "FINAL" };
}

/** "Everyone approves again" (a substantial change): back to review with every decision cleared. */
export function resetApprovals(input: FlowInput, userId: string, at = new Date()): { toPhase: Phase; clear: Decision[] } {
  if (input.phase === "DRAFT" || input.phase === "APPROVED") throw new FlowError("INVALID_PHASE", "אין אישורים לאפס");
  const approved = new Set<SeatKey>();
  for (const d of input.decisions) if (statusOf(input.decisions, d.seat).status !== "pending") approved.add(d.seat);
  return {
    toPhase: "REVIEW",
    clear: [...approved].map((seat) => ({ seat, kind: "CLEARED" as const, userId, versionNumber: input.latestVersion, at })),
  };
}

export function reopen(input: FlowInput, userId: string, at = new Date()): { toPhase: Phase; clear: Decision[] } {
  if (input.phase !== "APPROVED") throw new FlowError("INVALID_PHASE", "אפשר לפתוח מחדש רק מכתב שאושר");
  return { toPhase: "FINAL", clear: [{ seat: "FINAL", kind: "CLEARED", userId, versionNumber: input.latestVersion, at }] };
}

/** True when this approval was given on an older version than the latest one. */
export const changedSince = (seat: Seat, latestVersion: number) =>
  seat.status === "approved" && !seat.auto && (seat.decision?.versionNumber ?? latestVersion) < latestVersion;
