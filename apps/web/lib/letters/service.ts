import { getDb, schema, type Db } from "@al/db";
import {
  abilities,
  canGlobal,
  decide,
  reopen,
  resetApprovals,
  resubmit,
  retract,
  skipAcademic,
  submit,
  type Actor,
  type DecisionKind,
  type FlowView,
  type SeatKey,
} from "@al/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { AppError, forbidden, notFound } from "../errors";
import { audit, notify } from "../notify";
import { getFileStore, sha256 } from "../storage";
import { ensureUnit, resolveDefaults } from "../units/resolve";
import { afterChange } from "./engine";
import { syncLiveFileLock } from "./live-file-lock";
import { loadLetter, type LoadedLetter, type Tx } from "./state";

const { users, seasons, letterRequests, versions, reviews, comments, letterPeople } = schema;

/**
 * Runs one action on one letter in a transaction: loads it locked, hands over what the actor may
 * do, then applies the automatic moves and notifications that follow every change.
 */
async function withLetter<T>(
  db: Db,
  actor: Actor,
  letterId: string,
  fn: (c: { tx: Tx; l: LoadedLetter; before: FlowView; ab: ReturnType<typeof abilities> }) => Promise<T>,
): Promise<{ out: T; view: FlowView }> {
  const result = await db.transaction(async (tx) => {
    const l = await loadLetter(tx, letterId, { lock: true });
    const ab = abilities(actor, l.input);
    if (!ab.view) throw notFound();
    const out = await fn({ tx, l, before: ab.flow, ab });
    const after = await afterChange(tx, letterId, ab.flow, actor.userId);
    return { out, view: after.view, from: ab.flow.phase };
  });
  // After the commit: a slow or failing SharePoint call must not hold or undo the approval.
  await syncLiveFileLock(letterId, result.from, result.view.phase, actor.userId, { db });
  return { out: result.out, view: result.view };
}

/** Checks that every id is an active user holding one of the roles. */
async function assertRole(tx: Tx, ids: string[], ...roles: ("CONTROL_ADVISOR" | "REGISTRATION_MANAGER" | "ACADEMIC_APPROVER")[]) {
  if (ids.length === 0) return;
  const rows = await tx.select({ id: users.id, roles: users.roles }).from(users).where(and(inArray(users.id, ids), eq(users.active, true)));
  const ok = rows.filter((r) => roles.some((role) => r.roles.includes(role)));
  if (ok.length !== new Set(ids).size) throw new AppError("INVALID", "אחד המשתמשים שנבחרו לא מתאים לתפקיד");
}

// ---------------------------------------------------------------- seasons

export interface SeasonInput {
  name: string;
  copyFromSeasonId?: string;
  reminderIntervalDays?: number;
  /** When copying: the start of every track code changes (227… becomes 228…). */
  codeFrom?: string;
  codeTo?: string;
  sequentialReview?: boolean;
  controlReview?: boolean;
  dueDate?: string | null;
}

export async function createSeason(actor: Actor, input: SeasonInput, db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_SEASONS")) throw forbidden();
  const name = input.name.trim();
  if (!name) throw new AppError("INVALID", "צריך לתת שם לעונה");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new AppError("INVALID", "תאריך היעד לא תקין");

  return db.transaction(async (tx) => {
    const source = input.copyFromSeasonId
      ? (await tx.select().from(seasons).where(eq(seasons.id, input.copyFromSeasonId)))[0]
      : undefined;
    const [season] = await tx
      .insert(seasons)
      .values({
        name,
        sourceSeasonId: input.copyFromSeasonId ?? null,
        reminderIntervalDays: input.reminderIntervalDays ?? source?.reminderIntervalDays ?? 3,
        // A copied season keeps the way the previous one worked, unless told otherwise.
        sequentialReview: input.sequentialReview ?? source?.sequentialReview ?? true,
        controlReview: input.controlReview ?? source?.controlReview ?? false,
        dueDate: input.dueDate ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await audit(tx, actor.userId, "SEASON_CREATED", { seasonId: season!.id }, { name, copyFrom: input.copyFromSeasonId });

    if (input.copyFromSeasonId) {
      // "צור על בסיס עונה קודמת": the same tracks, with no versions, comments or decisions. The
      // year changes the start of each track code. The people are today's: the campus + faculty's
      // advisor, unless last season's advisor is still around.
      const { codeFrom, codeTo } = input;
      const renumber = (n: string) => (codeFrom && codeTo !== undefined && n.startsWith(codeFrom) ? codeTo + n.slice(codeFrom.length) : n);
      const old = await tx.select().from(letterRequests).where(eq(letterRequests.seasonId, input.copyFromSeasonId));
      const active = new Map((await tx.select().from(users).where(eq(users.active, true))).map((u) => [u.id, u]));
      for (const l of old) {
        const defaults = await resolveDefaults(tx, l.campus, l.faculty);
        const keep = active.get(l.advisorId)?.roles.some((r) => r === "CONTROL_ADVISOR");
        const advisorId = keep ? l.advisorId : defaults.advisorId;
        if (!advisorId) continue;
        await tx
          .insert(letterRequests)
          .values({
            seasonId: season!.id,
            campus: l.campus,
            faculty: l.faculty,
            trackName: l.trackName,
            trackNumber: renumber(l.trackNumber),
            advisorId,
            registrationManagerId: l.registrationManagerId,
            sourceLetterId: l.id,
            createdBy: actor.userId,
          })
          .onConflictDoNothing();
      }
    }
    return season!;
  });
}

export async function updateSeason(
  actor: Actor,
  seasonId: string,
  change: { reminderIntervalDays?: number; sequentialReview?: boolean; controlReview?: boolean; dueDate?: string | null; name?: string },
  db: Db = getDb(),
) {
  if (!canGlobal(actor, "MANAGE_SEASONS")) throw forbidden();
  const days = change.reminderIntervalDays;
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 60))
    throw new AppError("INVALID", "מספר הימים צריך להיות בין 1 ל-60");
  if (change.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(change.dueDate)) throw new AppError("INVALID", "תאריך היעד לא תקין");
  if (change.name !== undefined && !change.name.trim()) throw new AppError("INVALID", "צריך לתת שם לעונה");
  await db.transaction(async (tx) => {
    const set: Partial<typeof seasons.$inferInsert> = {};
    if (days !== undefined) set.reminderIntervalDays = days;
    if (change.sequentialReview !== undefined) set.sequentialReview = change.sequentialReview;
    if (change.controlReview !== undefined) set.controlReview = change.controlReview;
    if (change.dueDate !== undefined) set.dueDate = change.dueDate || null;
    if (change.name !== undefined) set.name = change.name.trim();
    const updated = await tx.update(seasons).set(set).where(eq(seasons.id, seasonId)).returning({ id: seasons.id });
    if (updated.length === 0) throw notFound();
    await audit(tx, actor.userId, "SEASON_UPDATED", { seasonId }, change);
  });
}

export const setReminderInterval = (actor: Actor, seasonId: string, days: number, db: Db = getDb()) =>
  updateSeason(actor, seasonId, { reminderIntervalDays: days }, db);

// ---------------------------------------------------------------- letter requests

export interface LetterRequestInput {
  seasonId: string;
  campus: string;
  faculty: string;
  trackName: string;
  trackNumber: string;
  /** Default: the advisor of the campus + faculty (set once in "קמפוסים ופקולטות"). */
  advisorId?: string;
  /** Only when this track has its own registration manager; otherwise it comes from the campus + faculty. */
  registrationManagerId?: string;
  dueDate?: string | null; // YYYY-MM-DD
}

export async function createLetterRequest(actor: Actor, input: LetterRequestInput, db: Db = getDb()) {
  if (!canGlobal(actor, "CREATE_LETTER_REQUEST")) throw forbidden();
  const text = [input.campus, input.faculty, input.trackName, input.trackNumber].map((s) => s.trim());
  if (text.some((s) => !s)) throw new AppError("INVALID", "צריך למלא קמפוס, פקולטה, מסלול ומספר מסלול");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new AppError("INVALID", "תאריך היעד לא תקין");
  const [campus, faculty, trackName, trackNumber] = text as [string, string, string, string];
  // Registered even when this attempt is refused below, so the campus + faculty shows up in the
  // screen where its people are set.
  await ensureUnit(db, campus, faculty);

  return db.transaction(async (tx) => {
    const defaults = await resolveDefaults(tx, campus, faculty);
    const advisorId = input.advisorId ?? defaults.advisorId;
    if (!advisorId)
      throw new AppError("INVALID", `לא הוגדרה יועצת בקרה ל${faculty} ב${campus}. מגדירים אותה פעם אחת במסך "קמפוסים ופקולטות".`);
    await assertRole(tx, [advisorId], "CONTROL_ADVISOR");
    if (input.registrationManagerId) await assertRole(tx, [input.registrationManagerId], "REGISTRATION_MANAGER");
    const inserted = await tx
      .insert(letterRequests)
      .values({
        seasonId: input.seasonId,
        campus,
        faculty,
        trackName,
        trackNumber,
        advisorId,
        registrationManagerId: input.registrationManagerId ?? null,
        dueDate: input.dueDate || null,
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    const letter = inserted[0];
    if (!letter) throw new AppError("CONFLICT", "כבר קיימת דרישת מכתב למסלול הזה בקמפוס הזה בעונה הזאת");
    await audit(tx, actor.userId, "LETTER_CREATED", { letterId: letter.id, seasonId: letter.seasonId }, { trackName });
    // A new letter to prepare lands on the advisor's list.
    await notify(tx, [advisorId], "YOUR_TURN", letter.id, actor.userId);
    return letter;
  });
}

export async function changeAdvisor(actor: Actor, letterId: string, advisorId: string, db: Db = getDb()) {
  await withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.reassignAdvisor) throw forbidden();
    await assertRole(tx, [advisorId], "CONTROL_ADVISOR");
    if (advisorId === l.row.advisorId) return;
    await tx.update(letterRequests).set({ advisorId }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "ADVISOR_CHANGED", { letterId, seasonId: l.row.seasonId }, { from: l.row.advisorId, to: advisorId });
    await notify(tx, [advisorId], "YOUR_TURN", letterId, actor.userId);
  });
}

/** This track gets its own registration manager (null: back to the campus + faculty's). */
export async function setLetterRegistrationManager(actor: Actor, letterId: string, userId: string | null, db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  await withLetter(db, actor, letterId, async ({ tx, l }) => {
    if (userId) await assertRole(tx, [userId], "REGISTRATION_MANAGER");
    await tx.update(letterRequests).set({ registrationManagerId: userId }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "REGISTRATION_MANAGER_SET", { letterId, seasonId: l.row.seasonId }, { userId });
  });
}

/**
 * More people on one track, at the control manager's discretion: another advisor (prepares and
 * fixes like the main one) or another manager (reviews in the registration manager's seat).
 */
export async function addLetterPerson(actor: Actor, letterId: string, userId: string, kind: "ADVISOR" | "MANAGER", db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  await withLetter(db, actor, letterId, async ({ tx, l }) => {
    await assertRole(tx, [userId], kind === "ADVISOR" ? "CONTROL_ADVISOR" : "REGISTRATION_MANAGER");
    await tx.insert(letterPeople).values({ letterId, userId, kind, addedBy: actor.userId }).onConflictDoNothing();
    await audit(tx, actor.userId, "PERSON_ADDED", { letterId, seasonId: l.row.seasonId }, { userId, kind });
    await notify(tx, [userId], "YOUR_TURN", letterId, actor.userId);
  });
}

export async function removeLetterPerson(actor: Actor, letterId: string, userId: string, kind: "ADVISOR" | "MANAGER", db: Db = getDb()) {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  await withLetter(db, actor, letterId, async ({ tx, l }) => {
    await tx.delete(letterPeople).where(and(eq(letterPeople.letterId, letterId), eq(letterPeople.userId, userId), eq(letterPeople.kind, kind)));
    await audit(tx, actor.userId, "PERSON_REMOVED", { letterId, seasonId: l.row.seasonId }, { userId, kind });
  });
}

// ---------------------------------------------------------------- versions

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function isDocx(bytes: Uint8Array) {
  // A DOCX is a ZIP: it starts with "PK".
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPdf(bytes: Uint8Array) {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/**
 * A new official version: the PDF the reviewers mark, with the Word file it came from when there
 * is one (the add-in and "edit in Word" send both; a plain upload may be the PDF alone). Allowed to
 * the advisor while she holds the letter (preparing or fixing) and to the control manager at any
 * time before approval.
 */
export async function uploadVersion(
  actor: Actor,
  letterId: string,
  input: {
    docx?: Uint8Array | null;
    pdf: Uint8Array;
    note?: string;
    pdfSource?: "UPLOAD" | "ADDIN" | "GRAPH";
    sharepointCTag?: string;
    textMatch?: number | null;
  },
  db: Db = getDb(),
) {
  const { docx, pdf } = input;
  if ((docx?.byteLength ?? 0) > MAX_FILE_BYTES || pdf.byteLength > MAX_FILE_BYTES) throw new AppError("INVALID", "הקובץ גדול מדי (עד 30MB)");
  if (docx && !isDocx(docx)) throw new AppError("INVALID", "קובץ ה-Word לא תקין. צריך קובץ DOCX");
  if (!isPdf(pdf)) throw new AppError("INVALID", "קובץ ה-PDF לא תקין");

  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    throw new AppError("INVALID", "לא הצלחנו לקרוא את קובץ ה-PDF");
  }

  const { out } = await withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.uploadVersion) throw forbidden();
    const number = l.row.latestVersion + 1;
    const base = `letters/${letterId}/v${number}-${Date.now()}`;
    const store = getFileStore();
    if (docx) await store.put(`${base}.docx`, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await store.put(`${base}.pdf`, pdf, "application/pdf");
    const [version] = await tx
      .insert(versions)
      .values({
        letterId,
        number,
        docxKey: docx ? `${base}.docx` : null,
        docxSha256: docx ? sha256(docx) : null,
        docxSize: docx ? docx.byteLength : null,
        pdfKey: `${base}.pdf`,
        pdfSha256: sha256(pdf),
        pdfSize: pdf.byteLength,
        pageCount,
        textMatch: input.textMatch ?? null,
        pdfSource: input.pdfSource ?? "UPLOAD",
        note: input.note?.trim() || null,
        createdBy: actor.userId,
      })
      .returning();
    await tx
      .update(letterRequests)
      .set({ latestVersion: number, ...(input.sharepointCTag ? { sharepointVersionCTag: input.sharepointCTag } : {}) })
      .where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "VERSION_UPLOADED", { letterId, seasonId: l.row.seasonId }, { number, source: version!.pdfSource });
    if (l.row.phase !== "DRAFT") {
      // Everybody who approved or is waiting hears that there is a new version to look at.
      const decided = l.input.decisions.map((d) => d.userId);
      await notify(tx, [...decided, ...ab.flow.holder.userIds], "NEW_VERSION", letterId, actor.userId, { number });
    }
    return version!;
  });
  return out;
}

// ---------------------------------------------------------------- the flow

const decisionRow = (letterId: string, d: { seat: string; kind: DecisionKind; userId: string; onBehalfOf?: string | null; versionNumber: number; note?: string | null }) => ({
  letterId,
  seat: d.seat,
  kind: d.kind,
  userId: d.userId,
  onBehalfOf: d.onBehalfOf ?? null,
  versionNumber: d.versionNumber,
  note: d.note ?? null,
});

/** The advisor sends a draft to review. */
export async function submitLetter(actor: Actor, letterId: string, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    submit(l.input); // the reason it cannot be sent, in Hebrew
    if (!ab.submit) throw forbidden();
    await tx.update(letterRequests).set({ phase: "REVIEW", advisorHold: false }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "SUBMITTED", { letterId, seasonId: l.row.seasonId }, { version: l.row.latestVersion });
  });
}

/**
 * A reviewer approves or returns the letter. The reviewer's draft comments are published with the
 * decision. "Approve" with comments means "approved, subject to fixes".
 */
export async function decideLetter(
  actor: Actor,
  letterId: string,
  input: { seat: SeatKey; kind: "APPROVED" | "CHANGES"; note?: string },
  db: Db = getDb(),
) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    const mine = ab.decide.find((s) => s.seat === input.seat);
    if (!mine) {
      decide(l.input, { seat: input.seat, kind: input.kind, userId: actor.userId }); // the specific reason, if any
      throw forbidden();
    }
    const published = await tx
      .update(comments)
      .set({ publishedAt: new Date() })
      .where(and(eq(comments.letterId, letterId), eq(comments.authorId, actor.userId), isNull(comments.publishedAt)))
      .returning({ id: comments.id });
    const d = decide(l.input, {
      seat: input.seat,
      kind: input.kind,
      userId: actor.userId,
      onBehalfOf: mine.onBehalfOf,
      note: input.note,
      publishedComments: published.length,
    });
    await tx.insert(reviews).values(decisionRow(letterId, d));
    const needsFixes = d.kind === "CHANGES" || published.length > 0;
    if (needsFixes) await tx.update(letterRequests).set({ advisorHold: true }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, d.kind === "APPROVED" ? "APPROVED" : "RETURNED", { letterId, seasonId: l.row.seasonId }, {
      seat: d.seat,
      version: d.versionNumber,
      comments: published.length,
      onBehalfOf: d.onBehalfOf,
      note: d.note,
    });
    if (needsFixes)
      await notify(tx, [l.row.advisorId], "RETURNED_FOR_FIXES", letterId, actor.userId, { comments: published.length });
    if (d.seat.startsWith("ACADEMIC:")) await notify(tx, [l.row.advisorId], "ACADEMIC_ANSWERED", letterId, actor.userId, { kind: d.kind });
    if (d.onBehalfOf && d.onBehalfOf !== actor.userId) await notify(tx, [d.onBehalfOf], "ACTED_FOR_YOU", letterId, actor.userId, { by: "ורוניקה" });
  });
}

/** The advisor finished the fixes ("שלחתי תיקונים"). */
export async function resubmitLetter(actor: Actor, letterId: string, opts: { resendToAcademic?: boolean } = {}, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    const r = resubmit(l.input, opts);
    if (!ab.resubmit) throw forbidden();
    for (const seat of r.clear)
      await tx.insert(reviews).values(decisionRow(letterId, { seat, kind: "CLEARED", userId: actor.userId, versionNumber: l.row.latestVersion }));
    await tx
      .update(letterRequests)
      .set({ advisorHold: false, ...(r.toPhase ? { phase: r.toPhase } : {}) })
      .where(eq(letterRequests.id, letterId));
    const returners = l.input.decisions.filter((d) => d.kind === "CHANGES").map((d) => d.userId);
    await audit(tx, actor.userId, "RESUBMITTED", { letterId, seasonId: l.row.seasonId }, { version: l.row.latestVersion });
    await notify(tx, returners, "RESUBMITTED", letterId, actor.userId);
  });
}

/** A reviewer takes back their own approval, to look at the letter again. */
export async function retractApproval(actor: Actor, letterId: string, seat: SeatKey, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.retract.includes(seat)) throw forbidden();
    const d = retract(l.input, seat, actor.userId);
    await tx.insert(reviews).values(decisionRow(letterId, d));
    await audit(tx, actor.userId, "APPROVAL_RETRACTED", { letterId, seasonId: l.row.seasonId }, { seat });
  });
}

export async function skipAcademicRound(actor: Actor, letterId: string, note: string | undefined, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.skipAcademic) throw forbidden();
    const r = skipAcademic(l.input);
    await tx.update(letterRequests).set({ phase: r.toPhase, advisorHold: false }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "ACADEMIC_SKIPPED", { letterId, seasonId: l.row.seasonId }, note?.trim() ? { note: note.trim() } : {});
  });
}

/** "Everyone approves again": a substantial change after approvals were given. */
export async function resetLetterApprovals(actor: Actor, letterId: string, note: string | undefined, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.resetApprovals) throw forbidden();
    const r = resetApprovals(l.input, actor.userId);
    for (const d of r.clear) await tx.insert(reviews).values(decisionRow(letterId, d));
    await tx.update(letterRequests).set({ phase: r.toPhase, advisorHold: false }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "APPROVALS_RESET", { letterId, seasonId: l.row.seasonId }, note?.trim() ? { note: note.trim() } : {});
  });
}

export async function reopenLetter(actor: Actor, letterId: string, note: string | undefined, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.reopen) throw forbidden();
    const r = reopen(l.input, actor.userId);
    for (const d of r.clear) await tx.insert(reviews).values(decisionRow(letterId, d));
    await tx.update(letterRequests).set({ phase: r.toPhase, approvedAt: null, inGilboaAt: null }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "REOPENED", { letterId, seasonId: l.row.seasonId }, note?.trim() ? { note: note.trim() } : {});
  });
}

/** The advisor marks the approved letter as loaded into Gilboa. */
export async function markInGilboa(actor: Actor, letterId: string, db: Db = getDb()) {
  return withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.markInGilboa) throw forbidden();
    await tx.update(letterRequests).set({ inGilboaAt: new Date() }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "IN_GILBOA", { letterId, seasonId: l.row.seasonId });
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** "תזכיר": a reminder to whoever holds the letter now. Returns who was reminded. */
export async function remindHolders(actor: Actor, letterId: string, db: Db = getDb()): Promise<string[]> {
  const { out } = await withLetter(db, actor, letterId, async ({ tx, l, ab }) => {
    if (!ab.remind) throw forbidden();
    // Academic approvers have no login (a reminder would link to a page they cannot open).
    const ids = ab.flow.holder.kind === "ACADEMIC" ? [] : [...ab.flow.holder.userIds].filter((id) => id !== actor.userId);
    const days = Math.floor((Date.now() - l.row.holderSince.getTime()) / DAY);
    await notify(tx, ids, "REMINDER", letterId, actor.userId, { days });
    await audit(tx, actor.userId, "REMINDED", { letterId, seasonId: l.row.seasonId }, { to: ids });
    return ids;
  });
  return out;
}

