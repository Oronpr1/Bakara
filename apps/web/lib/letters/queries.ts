// Read side for the screens. Mutations live in service.ts / comments.ts; nothing here writes.
// Every function returns plain, ready-to-render data ("view models"): the screens do no rules.
import { getDb, schema, type Db } from "@al/db";
import {
  abilities,
  canGlobal,
  changedSince,
  flowView,
  PHASES,
  SEAT_LABELS,
  type Abilities,
  type Actor,
  type FlowState,
  type HolderKind,
  type Phase,
  type Role,
  type SeatKey,
  type SeatRole,
  type SeatStatus,
  type Turn,
} from "@al/domain";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound } from "../errors";
import { loadLetter, loadLetters, type LetterRow, type LoadedLetter } from "./state";

const { users, seasons, letterRequests, comments, commentReplies, versions, auditEvents, academicLinks, letterAcademics, letterPeople } = schema;

export type SeasonRow = typeof seasons.$inferSelect;
export interface UserOption {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  active: boolean;
}

export async function listUsers(db: Db = getDb()): Promise<UserOption[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, roles: users.roles, active: users.active })
    .from(users)
    .orderBy(asc(users.name));
}

export const usersWithRole = (all: UserOption[], role: Role) => all.filter((u) => u.active && u.roles.includes(role));

// ---------------------------------------------------------------- seasons

export async function listSeasons(db: Db = getDb()) {
  const [rows, counts] = await Promise.all([
    db.select().from(seasons).orderBy(desc(seasons.createdAt)),
    db
      .select({ seasonId: letterRequests.seasonId, n: sql<number>`count(*)::int` })
      .from(letterRequests)
      .groupBy(letterRequests.seasonId),
  ]);
  const bySeason = new Map(counts.map((c) => [c.seasonId, c.n]));
  return rows.map((s) => ({ ...s, letterCount: bySeason.get(s.id) ?? 0 }));
}

export async function getSeason(seasonId: string, db: Db = getDb()) {
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season) throw notFound();
  return season;
}

export const canSeeAllLetters = (actor: Actor) => canGlobal(actor, "VIEW_ALL_LETTERS");

// ---------------------------------------------------------------- letter lists

const DAY = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);

/** One letter as a row on a list or card: what it is, where it stands, who holds it, for how long. */
export interface LetterSummary {
  id: string;
  seasonId: string;
  campus: string;
  faculty: string;
  trackName: string;
  trackNumber: string;
  /** Null until the control manager assigns an advisor to the track. */
  advisorId: string | null;
  advisorName: string;
  phase: Phase;
  state: FlowState;
  holderKind: HolderKind;
  holderIds: string[];
  holderNames: string[];
  /** Whole days the current holder has had the letter; null once approved and loaded. */
  waitingDays: number | null;
  openComments: number;
  latestVersion: number;
  dueDate: string | null;
  overdue: boolean;
  inGilboa: boolean;
  blockers: string[];
  /** The actor is one of the people the letter waits for. */
  mine: boolean;
  /** The academic link expired or was never opened, while the letter waits for the academic approver. */
  academicLinkProblem: "expired" | "unopened" | null;
}

export function toSummary(l: LoadedLetter, actor: Actor, names: Map<string, string>, links: Map<string, { expired: boolean; opened: boolean }> = new Map()): LetterSummary {
  const view = flowView(l.input);
  const holderIds = [...view.holder.userIds];
  const waiting = view.state === "APPROVED" ? null : Math.floor((Date.now() - l.row.holderSince.getTime()) / DAY);
  const due = l.row.dueDate ?? l.season.dueDate ?? null;
  let linkProblem: LetterSummary["academicLinkProblem"] = null;
  if (view.state === "WITH_ACADEMIC") {
    for (const id of holderIds) {
      const link = links.get(`${l.row.id}:${id}`);
      if (!link || link.expired) linkProblem = "expired";
      else if (!link.opened && (waiting ?? 0) >= 3) linkProblem ??= "unopened";
    }
  }
  return {
    id: l.row.id,
    seasonId: l.row.seasonId,
    campus: l.row.campus,
    faculty: l.row.faculty,
    trackName: l.row.trackName,
    trackNumber: l.row.trackNumber,
    advisorId: l.row.advisorId,
    advisorName: l.row.advisorId ? (names.get(l.row.advisorId) ?? "—") : "לא שויכה יועצת",
    phase: view.phase,
    state: view.state,
    holderKind: view.holder.kind,
    holderIds,
    holderNames: holderIds.map((id) => names.get(id) ?? "—"),
    waitingDays: waiting,
    openComments: l.input.openComments,
    latestVersion: l.row.latestVersion,
    dueDate: due,
    overdue: Boolean(due && due < today() && l.row.phase !== "APPROVED"),
    inGilboa: Boolean(l.row.inGilboaAt),
    blockers: [...view.blockers],
    mine: holderIds.includes(actor.userId),
    academicLinkProblem: linkProblem,
  };
}

async function academicLinkStates(db: Db, letterIds: string[]) {
  const map = new Map<string, { expired: boolean; opened: boolean }>();
  if (letterIds.length === 0) return map;
  const rows = await db
    .select()
    .from(academicLinks)
    .where(and(inArray(academicLinks.letterId, letterIds), isNull(academicLinks.revokedAt)));
  const now = Date.now();
  for (const r of rows) {
    const key = `${r.letterId}:${r.userId}`;
    const prev = map.get(key);
    const live = r.expiresAt.getTime() > now;
    map.set(key, { expired: prev ? prev.expired && !live : !live, opened: (prev?.opened ?? false) || Boolean(r.lastUsedAt) });
  }
  return map;
}

/** Every letter of the season that the actor may see, as summaries, in track order. */
export async function listLetters(actor: Actor, seasonId: string, db: Db = getDb()): Promise<LetterSummary[]> {
  const rows = await db
    .select()
    .from(letterRequests)
    .where(eq(letterRequests.seasonId, seasonId))
    .orderBy(asc(letterRequests.campus), asc(letterRequests.faculty), asc(letterRequests.trackName));
  const [loaded, people, links] = await Promise.all([loadLetters(db, rows), listUsers(db), academicLinkStates(db, rows.map((r) => r.id))]);
  const names = new Map(people.map((u) => [u.id, u.name]));
  return loaded.filter((l) => abilities(actor, l.input).view).map((l) => toSummary(l, actor, names, links));
}

// ---------------------------------------------------------------- the control tower

export interface HolderLine {
  /** The person holding letters ("יוסי", "שקד", "פרופ' לוי"). */
  userId: string;
  name: string;
  kind: HolderKind;
  count: number;
  oldestDays: number;
  letterIds: string[];
}

export interface Tower {
  total: number;
  byPhase: Record<Phase, number>;
  approved: number;
  inGilboa: number;
  /** Who holds how many letters, longest wait first. */
  holders: HolderLine[];
  /** Draft letters with no version yet, per advisor: "didn't start". */
  notStarted: { advisorId: string | null; name: string; count: number }[];
  /** Letters that cannot move: nobody set to review. */
  blocked: LetterSummary[];
  overdue: number;
  academicLinkProblems: LetterSummary[];
}

export function buildTower(items: LetterSummary[]): Tower {
  const byPhase = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>;
  const holders = new Map<string, HolderLine>();
  const notStarted = new Map<string, { advisorId: string | null; name: string; count: number }>();
  for (const l of items) {
    byPhase[l.phase]++;
    if (l.phase === "DRAFT" && l.latestVersion === 0) {
      const key = l.advisorId ?? "none";
      const s = notStarted.get(key) ?? { advisorId: l.advisorId, name: l.advisorName, count: 0 };
      s.count++;
      notStarted.set(key, s);
    }
    if (l.holderKind === "NONE" || l.waitingDays === null) continue;
    l.holderIds.forEach((id, i) => {
      const h = holders.get(id) ?? { userId: id, name: l.holderNames[i] ?? "—", kind: l.holderKind, count: 0, oldestDays: 0, letterIds: [] };
      h.count++;
      h.oldestDays = Math.max(h.oldestDays, l.waitingDays ?? 0);
      h.letterIds.push(l.id);
      holders.set(id, h);
    });
  }
  return {
    total: items.length,
    byPhase,
    approved: byPhase.APPROVED,
    inGilboa: items.filter((l) => l.inGilboa).length,
    holders: [...holders.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.count - a.count),
    notStarted: [...notStarted.values()].sort((a, b) => b.count - a.count),
    blocked: items.filter((l) => l.state === "BLOCKED"),
    overdue: items.filter((l) => l.overdue).length,
    academicLinkProblems: items.filter((l) => l.academicLinkProblem),
  };
}

export interface Home {
  season: SeasonRow;
  /** Letters waiting for this person. */
  mine: LetterSummary[];
  all: LetterSummary[];
  /** Only for people who see everything (control manager, VP). */
  tower: Tower | null;
}

export async function getHome(actor: Actor, seasonId: string, db: Db = getDb()): Promise<Home> {
  const [season, all] = await Promise.all([getSeason(seasonId, db), listLetters(actor, seasonId, db)]);
  const mine = all.filter((l) => l.mine).sort((a, b) => (b.waitingDays ?? 0) - (a.waitingDays ?? 0));
  return { season, mine, all, tower: canSeeAllLetters(actor) ? buildTower(all) : null };
}

// ---------------------------------------------------------------- one letter: the review room

export interface RoomSeat {
  key: SeatKey;
  role: SeatRole;
  label: string;
  holderNames: string[];
  status: SeatStatus;
  turn: Turn;
  auto: boolean;
  decidedByName: string | null;
  onBehalfOfName: string | null;
  decidedVersion: number | null;
  decidedAt: Date | null;
  note: string | null;
  /** Approved on an older version than the latest. */
  changedSince: boolean;
}

export interface RoomComment {
  id: string;
  versionNumber: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** NOTE (text), X (a cross over text) or LINE (two points). */
  kind: "NOTE" | "X" | "LINE";
  color: string | null;
  points: [number, number][] | null;
  body: string;
  suggestion: string | null;
  status: "OPEN" | "RESOLVED_FIXED" | "RESOLVED_NO_CHANGE";
  statusNote: string | null;
  authorId: string;
  authorName: string;
  /** A draft: only its author sees it, until they approve or return the letter. */
  isDraft: boolean;
  hasSnapshot: boolean;
  createdAt: Date;
  replies: { id: string; authorName: string; body: string; createdAt: Date }[];
}

export interface RoomVersion {
  id: string;
  number: number;
  note: string | null;
  createdByName: string;
  createdAt: Date;
  pageCount: number;
  /** A Word file came with this version (a PDF alone is allowed). */
  hasDocx: boolean;
  textMatch: number | null;
  pdfSource: string;
}

export interface RoomEvent {
  id: number;
  at: Date;
  type: string;
  actorName: string | null;
  data: Record<string, unknown>;
}

export interface RoomAcademic {
  userId: string;
  name: string;
  email: string;
  link: "none" | "active" | "expired";
  lastOpenedAt: Date | null;
  decision: "APPROVED" | "CHANGES" | null;
}

export interface LetterRoom {
  row: LetterRow;
  season: SeasonRow;
  can: Abilities;
  summary: LetterSummary;
  seats: RoomSeat[];
  versions: RoomVersion[];
  comments: RoomComment[];
  history: RoomEvent[];
  academics: RoomAcademic[];
  /** For reassigning the advisor (only when the actor may). */
  advisors: { id: string; name: string }[];
  /** More people the control manager added to this track. */
  extraPeople: { userId: string; name: string; kind: "ADVISOR" | "MANAGER" | "COMMENTER" }[];
  /** Everyone who can be added to a track (only when the actor may manage people). */
  addable: { advisors: { id: string; name: string }[]; managers: { id: string; name: string }[]; commenters: { id: string; name: string }[] };
  /** Who the registration manager(s) of this letter are right now. */
  managerNames: string[];
  /** Last season's approved file for this track: the starting point for this year's letter. */
  starter: { versionId: string; number: number; seasonName: string } | null;
  /** The advisor has fixed comments but has not uploaded a version since the letter was returned. */
  noNewVersionSinceReturn: boolean;
  names: Record<string, string>;
}

export async function getLetterRoom(actor: Actor, letterId: string, db: Db = getDb()): Promise<LetterRoom> {
  const l = await loadLetter(db, letterId).catch(() => null);
  if (!l) throw notFound();
  const can = abilities(actor, l.input);
  // Hide the letter's existence from people who may not see it.
  if (!can.view) throw notFound();

  const [people, extraRows, versionRows, commentRows, replyRows, history, academicRows, linkRows, starterRows] = await Promise.all([
    listUsers(db),
    db.select().from(letterPeople).where(eq(letterPeople.letterId, letterId)),
    db.select().from(versions).where(eq(versions.letterId, letterId)).orderBy(desc(versions.number)),
    db.select().from(comments).where(eq(comments.letterId, letterId)).orderBy(asc(comments.createdAt)),
    db
      .select({ reply: commentReplies })
      .from(commentReplies)
      .innerJoin(comments, eq(comments.id, commentReplies.commentId))
      .where(eq(comments.letterId, letterId))
      .orderBy(asc(commentReplies.createdAt)),
    db.select().from(auditEvents).where(eq(auditEvents.letterId, letterId)).orderBy(desc(auditEvents.at)).limit(300),
    db.select().from(letterAcademics).where(and(eq(letterAcademics.letterId, letterId), isNull(letterAcademics.removedAt))),
    db.select().from(academicLinks).where(and(eq(academicLinks.letterId, letterId), isNull(academicLinks.revokedAt))),
    l.row.sourceLetterId
      ? db
          .select({ id: versions.id, number: versions.number, seasonName: seasons.name })
          .from(versions)
          .innerJoin(letterRequests, eq(letterRequests.id, versions.letterId))
          .innerJoin(seasons, eq(seasons.id, letterRequests.seasonId))
          .where(eq(versions.letterId, l.row.sourceLetterId))
          .orderBy(desc(versions.number))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const names = new Map(people.map((u) => [u.id, u.name]));
  const nameOf = (id: string | null | undefined) => (id ? names.get(id) ?? "—" : null);
  const links = await academicLinkStates(db, [letterId]);
  const summary = toSummary(l, actor, names, links);

  const replies = new Map<string, RoomComment["replies"]>();
  for (const { reply } of replyRows)
    replies.set(reply.commentId, [...(replies.get(reply.commentId) ?? []), { id: reply.id, authorName: nameOf(reply.authorId) ?? "—", body: reply.body, createdAt: reply.createdAt }]);

  // An academic approver is outside the internal review: they see their own marks, not the staff's
  // exchange (what was "not accepted" and why stays between the staff).
  const academicOnly = actor.roles.length > 0 && actor.roles.every((r) => r === "ACADEMIC_APPROVER");
  const visibleComments: RoomComment[] = commentRows
    .filter((c) => (academicOnly ? c.authorId === actor.userId : c.publishedAt || c.authorId === actor.userId))
    .map((c) => ({
      id: c.id,
      versionNumber: c.versionNumber,
      page: c.page,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      kind: c.kind,
      color: c.color,
      points: c.points ?? null,
      body: c.body,
      suggestion: c.suggestion,
      status: c.status === "NEEDS_CLARIFICATION" ? "OPEN" : c.status,
      statusNote: c.statusNote,
      authorId: c.authorId,
      authorName: nameOf(c.authorId) ?? "—",
      isDraft: !c.publishedAt,
      hasSnapshot: Boolean(c.snapshotKey),
      createdAt: c.createdAt,
      replies: replies.get(c.id) ?? [],
    }));

  const seats: RoomSeat[] = can.flow.seats.map((s) => ({
    key: s.key,
    role: s.role,
    label: s.role === "ACADEMIC" ? nameOf(s.holderIds[0]) ?? SEAT_LABELS.ACADEMIC : SEAT_LABELS[s.role],
    holderNames: s.holderIds.map((id) => nameOf(id) ?? "—"),
    status: s.status,
    turn: s.turn,
    auto: s.auto,
    decidedByName: nameOf(s.decision?.userId),
    onBehalfOfName: nameOf(s.decision?.onBehalfOf),
    decidedVersion: s.decision?.versionNumber ?? null,
    decidedAt: s.decision?.at ?? null,
    note: s.decision?.note ?? null,
    changedSince: changedSince(s, l.row.latestVersion),
  }));

  const academics: RoomAcademic[] = academicRows.map((a) => {
    const mine = linkRows.filter((k) => k.userId === a.userId);
    const live = mine.some((k) => k.expiresAt.getTime() > Date.now());
    const user = people.find((u) => u.id === a.userId);
    const seat = l.input.decisions.filter((d) => d.seat === `ACADEMIC:${a.userId}`).at(-1);
    return {
      userId: a.userId,
      name: user?.name ?? "—",
      email: user?.email ?? "",
      link: mine.length === 0 ? "none" : live ? "active" : "expired",
      lastOpenedAt: mine.map((k) => k.lastUsedAt).filter(Boolean).sort().at(-1) ?? null,
      decision: seat && seat.kind !== "CLEARED" ? (seat.kind as "APPROVED" | "CHANGES") : null,
    };
  });

  const lastReturn = [...l.input.decisions].reverse().find((d) => d.kind === "CHANGES");
  return {
    row: l.row,
    season: l.season,
    can,
    summary,
    seats,
    versions: versionRows.map((v) => ({
      id: v.id,
      number: v.number,
      note: v.note,
      createdByName: nameOf(v.createdBy) ?? "—",
      createdAt: v.createdAt,
      pageCount: v.pageCount,
      hasDocx: Boolean(v.docxKey),
      textMatch: v.textMatch,
      pdfSource: v.pdfSource,
    })),
    comments: visibleComments,
    history: history.map((h) => ({ id: h.id, at: h.at, type: h.type, actorName: nameOf(h.actorId), data: (h.data ?? {}) as Record<string, unknown> })),
    academics,
    advisors: can.reassignAdvisor ? usersWithRole(people, "CONTROL_ADVISOR").map((u) => ({ id: u.id, name: u.name })) : [],
    extraPeople: extraRows.map((e) => ({ userId: e.userId, name: nameOf(e.userId) ?? "—", kind: e.kind })),
    addable: canGlobal(actor, "MANAGE_UNITS")
      ? {
          advisors: usersWithRole(people, "CONTROL_ADVISOR").map((u) => ({ id: u.id, name: u.name })),
          managers: usersWithRole(people, "REGISTRATION_MANAGER").map((u) => ({ id: u.id, name: u.name })),
          commenters: people.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })),
        }
      : { advisors: [], managers: [], commenters: [] },
    managerNames: l.input.people.rmIds.map((id) => nameOf(id) ?? "—"),
    starter: starterRows[0] ? { versionId: starterRows[0].id, number: starterRows[0].number, seasonName: starterRows[0].seasonName } : null,
    noNewVersionSinceReturn: Boolean(lastReturn && lastReturn.versionNumber >= l.row.latestVersion && can.flow.fixing),
    names: Object.fromEntries(names),
  };
}

/** Loads what a download needs and checks the actor may see the letter. */
export async function letterForFile(actor: Actor, letterId: string, db: Db = getDb()) {
  const l = await loadLetter(db, letterId).catch(() => null);
  if (!l || !abilities(actor, l.input).view) throw notFound();
  return l.row;
}
