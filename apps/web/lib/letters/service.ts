import { getDb, schema, type Db } from "@al/db";
import {
  activeApprovers,
  activeSlotsOf,
  autoAdvance,
  canGlobal,
  canOnLetter,
  hasApproved,
  roundOfSlot,
  stageIndex,
  transition,
  type Actor,
  type ApproverSlot,
  type LetterAction,
  type LetterState,
  type Role,
  type Stage,
  type TransitionAction,
} from "@al/domain";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { AppError, forbidden } from "../errors";
import { audit, notify } from "../notify";
import { getFileStore, sha256 } from "../storage";
import { loadLetter, type LetterRow, type Tx } from "./state";

const { users, seasons, letterRequests, approverAssignments, approvals, versions } = schema;

function ensure(actor: Actor, action: LetterAction, state: LetterState) {
  if (!canOnLetter(actor, action, state)) throw forbidden();
}

async function usersWithRole(tx: Tx, role: "CONTROL_MANAGER" | "VP_REGISTRATION"): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), sql`${role} = any(${users.roles})`));
  return rows.map((r) => r.id);
}

/** Checks that every id is an active user holding the role. */
async function assertRole(tx: Tx, ids: string[], role: Role) {
  if (ids.length === 0) return;
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.active, true), sql`${role} = any(${users.roles})`));
  if (rows.length !== new Set(ids).size) throw new AppError("INVALID", "אחד המשתמשים שנבחרו לא מתאים לתפקיד");
}

/**
 * Moves the letter to `stage`, then lets finished rounds advance on their own, and tells the
 * people who now have something to do.
 */
async function setStage(tx: Tx, row: LetterRow, state: LetterState, stage: Stage, actorId: string) {
  const settled = autoAdvance({ ...state, stage }) ?? stage;
  if (settled === row.stage) return settled;

  await tx
    .update(letterRequests)
    .set({
      stage: settled,
      stageChangedAt: new Date(),
      approvedAt: settled === "APPROVED" ? new Date() : null,
    })
    .where(eq(letterRequests.id, row.id));
  await audit(tx, actorId, "STAGE_CHANGED", { letterId: row.id, seasonId: row.seasonId }, { from: row.stage, to: settled });

  const after = { ...state, stage: settled };
  switch (settled) {
    case "INITIAL_REVIEW":
      await notify(tx, await usersWithRole(tx, "CONTROL_MANAGER"), "SUBMITTED_FOR_REVIEW", row.id, actorId);
      break;
    case "DRAFT":
      await notify(tx, [row.advisorId], "RETURNED_FOR_CHANGES", row.id, actorId);
      break;
    case "REGISTRATION_ROUND":
    case "ACADEMIC_ROUND": {
      const waiting = activeApprovers(after).filter(
        (a) => roundOfSlot(a.slot) === settled && !hasApproved(after, a.userId, a.slot),
      );
      await notify(tx, waiting.map((a) => a.userId), "AWAITING_YOUR_APPROVAL", row.id, actorId);
      break;
    }
    case "FINAL_REVIEW":
      await notify(tx, await usersWithRole(tx, "CONTROL_MANAGER"), "READY_FOR_FINAL", row.id, actorId);
      break;
    case "APPROVED":
      await notify(
        tx,
        [row.advisorId, ...activeApprovers(after).map((a) => a.userId)],
        "APPROVED_FOR_DISTRIBUTION",
        row.id,
        actorId,
      );
      break;
  }
  return settled;
}

/** Re-checks whether a round finished after approvals, comment changes, or removals. */
export async function settleLetter(tx: Tx, letterId: string, actorId: string) {
  const { row, state } = await loadLetter(tx, letterId, { lock: true });
  return setStage(tx, row, state, state.stage, actorId);
}

// ---------------------------------------------------------------- seasons

export async function createSeason(
  actor: Actor,
  input: { name: string; copyFromSeasonId?: string; reminderIntervalDays?: number },
  db: Db = getDb(),
) {
  if (!canGlobal(actor, "MANAGE_SEASONS")) throw forbidden();
  const name = input.name.trim();
  if (!name) throw new AppError("INVALID", "צריך לתת שם לעונה");

  return db.transaction(async (tx) => {
    const [season] = await tx
      .insert(seasons)
      .values({
        name,
        sourceSeasonId: input.copyFromSeasonId ?? null,
        reminderIntervalDays: input.reminderIntervalDays ?? 3,
        createdBy: actor.userId,
      })
      .returning();
    await audit(tx, actor.userId, "SEASON_CREATED", { seasonId: season!.id }, { name, copyFrom: input.copyFromSeasonId });

    if (input.copyFromSeasonId) {
      // "צור על בסיס עונה קודמת": same tracks and assignments, no versions, comments or approvals.
      const source = await tx.select().from(letterRequests).where(eq(letterRequests.seasonId, input.copyFromSeasonId));
      for (const l of source) {
        const [copy] = await tx
          .insert(letterRequests)
          .values({
            seasonId: season!.id,
            campus: l.campus,
            faculty: l.faculty,
            trackName: l.trackName,
            trackNumber: l.trackNumber,
            advisorId: l.advisorId,
            createdBy: actor.userId,
          })
          .returning({ id: letterRequests.id });
        const assigned = await tx
          .select()
          .from(approverAssignments)
          .where(and(eq(approverAssignments.letterId, l.id), isNull(approverAssignments.removedAt)));
        if (assigned.length)
          await tx.insert(approverAssignments).values(
            assigned.map((a) => ({ letterId: copy!.id, userId: a.userId, slot: a.slot, assignedBy: actor.userId })),
          );
      }
    }
    return season!;
  });
}

export async function setReminderInterval(actor: Actor, seasonId: string, days: number, db: Db = getDb()) {
  if (!canGlobal(actor, "SET_REMINDER_INTERVAL")) throw forbidden();
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new AppError("INVALID", "מספר הימים צריך להיות בין 1 ל-60");
  await db.transaction(async (tx) => {
    await tx.update(seasons).set({ reminderIntervalDays: days }).where(eq(seasons.id, seasonId));
    await audit(tx, actor.userId, "REMINDER_INTERVAL_SET", { seasonId }, { days });
  });
}

// ---------------------------------------------------------------- letter requests

export interface LetterRequestInput {
  seasonId: string;
  campus: string;
  faculty: string;
  trackName: string;
  trackNumber: string;
  advisorId: string;
  registrationManagerId: string;
  vpId: string;
  academicIds: string[];
  dueDate?: string | null; // YYYY-MM-DD
}

export async function createLetterRequest(actor: Actor, input: LetterRequestInput, db: Db = getDb()) {
  if (!canGlobal(actor, "CREATE_LETTER_REQUEST")) throw forbidden();
  const text = [input.campus, input.faculty, input.trackName, input.trackNumber].map((s) => s.trim());
  if (text.some((s) => !s)) throw new AppError("INVALID", "צריך למלא קמפוס, פקולטה, מסלול ומספר מסלול");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new AppError("INVALID", "תאריך היעד לא תקין");

  return db.transaction(async (tx) => {
    await assertRole(tx, [input.advisorId], "CONTROL_ADVISOR");
    await assertRole(tx, [input.registrationManagerId], "REGISTRATION_MANAGER");
    await assertRole(tx, [input.vpId], "VP_REGISTRATION");
    await assertRole(tx, input.academicIds, "ACADEMIC_APPROVER");

    const [campus, faculty, trackName, trackNumber] = text as [string, string, string, string];
    const inserted = await tx
      .insert(letterRequests)
      .values({
        seasonId: input.seasonId,
        campus,
        faculty,
        trackName,
        trackNumber,
        advisorId: input.advisorId,
        dueDate: input.dueDate || null,
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    const letter = inserted[0];
    if (!letter) throw new AppError("CONFLICT", "כבר קיימת דרישת מכתב למסלול הזה בקמפוס הזה בעונה הזאת");

    const slots: { userId: string; slot: ApproverSlot }[] = [
      { userId: input.registrationManagerId, slot: "REGISTRATION_MANAGER" },
      { userId: input.vpId, slot: "VP_REGISTRATION" },
      ...[...new Set(input.academicIds)].map((userId) => ({ userId, slot: "ACADEMIC" as const })),
    ];
    await tx
      .insert(approverAssignments)
      .values(slots.map((s) => ({ letterId: letter.id, ...s, assignedBy: actor.userId })));
    await audit(tx, actor.userId, "LETTER_CREATED", { letterId: letter.id, seasonId: letter.seasonId }, { trackName });
    return letter;
  });
}

/** Replaces the approver in a slot (registration manager or VP), keeping history. */
export async function replaceApprover(
  actor: Actor,
  letterId: string,
  slot: "REGISTRATION_MANAGER" | "VP_REGISTRATION",
  userId: string,
  db: Db = getDb(),
) {
  await db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    ensure(actor, slot === "REGISTRATION_MANAGER" ? "SET_REGISTRATION_MANAGER" : "REMOVE_APPROVER", state);
    await assertRole(tx, [userId], slot === "REGISTRATION_MANAGER" ? "REGISTRATION_MANAGER" : "VP_REGISTRATION");
    const current = activeApprovers(state, [slot]);
    if (current.length === 1 && current[0]!.userId === userId) return;

    await tx
      .update(approverAssignments)
      .set({ removedAt: new Date(), removedBy: actor.userId, removedReason: "הוחלף" })
      .where(
        and(
          eq(approverAssignments.letterId, letterId),
          eq(approverAssignments.slot, slot),
          isNull(approverAssignments.removedAt),
        ),
      );
    await tx.insert(approverAssignments).values({ letterId, userId, slot, assignedBy: actor.userId });
    await audit(tx, actor.userId, "APPROVER_REPLACED", { letterId, seasonId: row.seasonId }, { slot, userId });
    if (row.stage === roundOfSlot(slot)) await notify(tx, [userId], "AWAITING_YOUR_APPROVAL", letterId, actor.userId);
  });
}

export async function addAcademicApprover(actor: Actor, letterId: string, userId: string, db: Db = getDb()) {
  await db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    ensure(actor, "SET_ACADEMIC_APPROVERS", state);
    await assertRole(tx, [userId], "ACADEMIC_APPROVER");
    if (activeApprovers(state, ["ACADEMIC"]).some((a) => a.userId === userId)) return;
    await tx.insert(approverAssignments).values({ letterId, userId, slot: "ACADEMIC", assignedBy: actor.userId });
    await audit(tx, actor.userId, "APPROVER_ADDED", { letterId, seasonId: row.seasonId }, { slot: "ACADEMIC", userId });
    if (row.stage === "ACADEMIC_ROUND") await notify(tx, [userId], "AWAITING_YOUR_APPROVAL", letterId, actor.userId);
  });
}

/** מנהלת הבקרה / הסמנכ"ל מסירים מאשר מהתהליך. The round may then complete on its own. */
export async function removeApprover(
  actor: Actor,
  letterId: string,
  userId: string,
  slot: ApproverSlot,
  reason: string,
  db: Db = getDb(),
) {
  await db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    // Before the academic round, the advisor may still edit the academic list she set up.
    const allowed =
      canOnLetter(actor, "REMOVE_APPROVER", state) ||
      (slot === "ACADEMIC" && canOnLetter(actor, "SET_ACADEMIC_APPROVERS", state));
    if (!allowed) throw forbidden();
    const updated = await tx
      .update(approverAssignments)
      .set({ removedAt: new Date(), removedBy: actor.userId, removedReason: reason.trim() || null })
      .where(
        and(
          eq(approverAssignments.letterId, letterId),
          eq(approverAssignments.userId, userId),
          eq(approverAssignments.slot, slot),
          isNull(approverAssignments.removedAt),
        ),
      )
      .returning({ id: approverAssignments.id });
    if (updated.length === 0) return;
    await audit(tx, actor.userId, "APPROVER_REMOVED", { letterId, seasonId: row.seasonId }, { slot, userId, reason });
    await settleLetter(tx, letterId, actor.userId);
  });
}

export async function changeAdvisor(actor: Actor, letterId: string, advisorId: string, db: Db = getDb()) {
  await db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    ensure(actor, "CHANGE_ADVISOR", state);
    await assertRole(tx, [advisorId], "CONTROL_ADVISOR");
    await tx.update(letterRequests).set({ advisorId }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "ADVISOR_CHANGED", { letterId, seasonId: row.seasonId }, { from: row.advisorId, to: advisorId });
  });
}

// ---------------------------------------------------------------- versions

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function isDocx(bytes: Uint8Array) {
  // A DOCX is a ZIP package; the content-types part name appears in its local headers.
  return bytes[0] === 0x50 && bytes[1] === 0x4b && Buffer.from(bytes.subarray(0, 4096)).includes("[Content_Types].xml");
}

function isPdf(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 1024)).includes("%PDF-");
}

/**
 * Stores a new official version: the exact DOCX and its review PDF, frozen with their hashes.
 * Comments and approvals are kept; the people on the letter are told a new version exists.
 */
export async function uploadVersion(
  actor: Actor,
  letterId: string,
  input: { docx: Uint8Array; pdf: Uint8Array; note?: string; pdfSource?: "UPLOAD" | "ADDIN" | "GRAPH" },
  db: Db = getDb(),
) {
  const { docx, pdf } = input;
  if (docx.byteLength > MAX_FILE_BYTES || pdf.byteLength > MAX_FILE_BYTES)
    throw new AppError("INVALID", "הקובץ גדול מדי (עד 30MB)");
  if (!isDocx(docx)) throw new AppError("INVALID", "קובץ ה-Word לא תקין. צריך קובץ DOCX");
  if (!isPdf(pdf)) throw new AppError("INVALID", "קובץ ה-PDF לא תקין");

  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    throw new AppError("INVALID", "לא הצלחנו לקרוא את קובץ ה-PDF");
  }

  return db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    ensure(actor, "UPLOAD_VERSION", state);
    const number = row.latestVersion + 1;
    const base = `letters/${letterId}/v${number}-${Date.now()}`;
    const store = getFileStore();
    await store.put(`${base}.docx`, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await store.put(`${base}.pdf`, pdf, "application/pdf");

    const [version] = await tx
      .insert(versions)
      .values({
        letterId,
        number,
        docxKey: `${base}.docx`,
        docxSha256: sha256(docx),
        docxSize: docx.byteLength,
        pdfKey: `${base}.pdf`,
        pdfSha256: sha256(pdf),
        pdfSize: pdf.byteLength,
        pageCount,
        pdfSource: input.pdfSource ?? "UPLOAD",
        note: input.note?.trim() || null,
        createdBy: actor.userId,
      })
      .returning();
    await tx.update(letterRequests).set({ latestVersion: number }).where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "VERSION_UPLOADED", { letterId, seasonId: row.seasonId }, { number });
    if (row.stage !== "DRAFT")
      await notify(
        tx,
        [row.advisorId, ...activeApprovers(state).map((a) => a.userId)],
        "NEW_VERSION",
        letterId,
        actor.userId,
        { number },
      );
    return version!;
  });
}

// ---------------------------------------------------------------- workflow actions

export async function performTransition(
  actor: Actor,
  letterId: string,
  action: TransitionAction,
  reason?: string,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    ensure(actor, action, state);
    const target = transition(state, action, { reason });
    if (reason) await audit(tx, actor.userId, action, { letterId, seasonId: row.seasonId }, { reason });
    return setStage(tx, row, state, target, actor.userId);
  });
}

/** Records the actor's approval for every slot they may approve now. */
export async function approveLetter(actor: Actor, letterId: string, db: Db = getDb()) {
  return db.transaction(async (tx) => {
    const { row, state } = await loadLetter(tx, letterId, { lock: true });
    ensure(actor, "APPROVE", state);
    const slots = activeSlotsOf(actor, state).filter(
      (slot) => stageIndex(state.stage) >= stageIndex(roundOfSlot(slot)) && !hasApproved(state, actor.userId, slot),
    );
    await tx
      .insert(approvals)
      .values(slots.map((slot) => ({ letterId, userId: actor.userId, slot, versionNumber: row.latestVersion })))
      .onConflictDoNothing();
    await audit(tx, actor.userId, "APPROVED", { letterId, seasonId: row.seasonId }, { slots, version: row.latestVersion });
    const after: LetterState = {
      ...state,
      approvals: [
        ...state.approvals,
        ...slots.map((slot) => ({ userId: actor.userId, slot, versionNumber: row.latestVersion, at: new Date() })),
      ],
    };
    return setStage(tx, row, after, state.stage, actor.userId);
  });
}
