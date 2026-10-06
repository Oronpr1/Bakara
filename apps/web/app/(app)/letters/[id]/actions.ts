"use server";

import { ACTIONS, COMMENT_STATUSES } from "@al/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { userMessage } from "@/lib/errors";
import { inviteAcademic, reissueLink } from "@/lib/academic/service";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { createComment, replyToComment, setCommentStatus } from "@/lib/letters/comments";
import { openInWord, versionFromSharePoint } from "@/lib/letters/live-file";
import {
  addAcademicApprover,
  approveLetter,
  changeAdvisor,
  performTransition,
  removeApprover,
  replaceApprover,
  uploadVersion,
} from "@/lib/letters/service";

const letterId = z.uuid();
const pick = (what: string) => z.uuid({ message: `צריך לבחור ${what}` });
const reason = z.string().trim().max(2000).optional();
/**
 * Revalidating from a server function refreshes the current page in the same response and
 * marks every other visited page (season lists, home) for a refresh on the next visit.
 */
const paths = (d: { letterId: string }) => [`/letters/${d.letterId}`];

export async function transitionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, action: z.enum(ACTIONS), reason }),
    formObject(form),
    (actor, d) => performTransition(actor, d.letterId, d.action, d.reason),
    paths,
  );
}

export async function approveAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId }), formObject(form), (actor, d) => approveLetter(actor, d.letterId), paths);
}

const MAX_BYTES = 30 * 1024 * 1024;
const file = (what: string) =>
  z
    .instanceof(File, { message: `צריך לבחור קובץ ${what}` })
    .refine((f) => f.size > 0, { message: `צריך לבחור קובץ ${what}` })
    .refine((f) => f.size <= MAX_BYTES, { message: `קובץ ה-${what} גדול מדי (עד 30MB)` });

export async function uploadVersionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, docx: file("Word"), pdf: file("PDF"), note: z.string().trim().max(2000).optional() }),
    formObject(form),
    async (actor, d) =>
      uploadVersion(actor, d.letterId, {
        docx: new Uint8Array(await d.docx.arrayBuffer()),
        pdf: new Uint8Array(await d.pdf.arrayBuffer()),
        note: d.note,
      }),
    paths,
    "הגרסה הועלתה",
  );
}

/** Creates the SharePoint working file the first time; the page then links to Word with it. */
export async function openInWordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId }),
    formObject(form),
    (actor, d) => openInWord(actor, d.letterId),
    paths,
    "הקובץ נוצר ב-SharePoint. אפשר לפתוח אותו ב-Word.",
  );
}

export async function versionFromSharePointAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, note: z.string().trim().max(2000).optional() }),
    formObject(form),
    (actor, d) => versionFromSharePoint(actor, d.letterId, d.note),
    paths,
    "הגרסה נוצרה מקובץ ה-Word",
  );
}

export async function replaceApproverAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, slot: z.enum(["REGISTRATION_MANAGER", "VP_REGISTRATION"]), userId: pick("מחליף") }),
    formObject(form),
    (actor, d) => replaceApprover(actor, d.letterId, d.slot, d.userId),
    paths,
    "נשמר",
  );
}

export async function addAcademicAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, userId: pick("גורם אקדמי") }),
    formObject(form),
    (actor, d) => addAcademicApprover(actor, d.letterId, d.userId),
    paths,
    "נוסף",
  );
}

export async function removeApproverAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      letterId,
      userId: z.uuid(),
      slot: z.enum(["REGISTRATION_MANAGER", "VP_REGISTRATION", "ACADEMIC"]),
      reason: z.string({ message: "צריך לכתוב סיבה" }).trim().min(1, { message: "צריך לכתוב סיבה" }).max(2000),
    }),
    formObject(form),
    (actor, d) => removeApprover(actor, d.letterId, d.userId, d.slot, d.reason),
    paths,
  );
}

export async function changeAdvisorAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, advisorId: pick("יועצת") }),
    formObject(form),
    (actor, d) => changeAdvisor(actor, d.letterId, d.advisorId),
    paths,
    "היועצת הוחלפה",
  );
}

const unit = z.coerce.number().min(0).max(1);

/** A new comment on a marked area. The snapshot PNG is cut in the browser from the rendered page. */
export async function createCommentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      letterId,
      versionNumber: z.coerce.number().int().min(1),
      page: z.coerce.number().int().min(1),
      x: unit,
      y: unit,
      width: unit,
      height: unit,
      body: z.string({ message: "צריך לכתוב את ההערה" }).trim().min(1, { message: "צריך לכתוב את ההערה" }).max(4000),
      snapshot: z.instanceof(File).optional(),
    }),
    formObject(form),
    async (actor, d) =>
      createComment(actor, d.letterId, {
        anchor: { versionNumber: d.versionNumber, page: d.page, x: d.x, y: d.y, width: d.width, height: d.height },
        body: d.body,
        snapshotPng: d.snapshot && d.snapshot.size > 0 ? new Uint8Array(await d.snapshot.arrayBuffer()) : undefined,
      }),
    paths,
    "ההערה נוספה",
  );
}

export async function replyAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      letterId,
      commentId: z.uuid(),
      body: z.string({ message: "צריך לכתוב תגובה" }).trim().min(1, { message: "צריך לכתוב תגובה" }).max(4000),
    }),
    formObject(form),
    (actor, d) => replyToComment(actor, d.commentId, d.body),
    paths,
  );
}

export async function commentStatusAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      letterId,
      commentId: z.uuid(),
      to: z.enum(COMMENT_STATUSES, { message: "צריך לבחור סטטוס" }),
      note: z.string().trim().max(4000).optional(),
      fixedInVersion: z.coerce.number().int().optional(),
    }),
    formObject(form),
    (actor, d) => setCommentStatus(actor, d.commentId, { to: d.to, note: d.note, fixedInVersion: d.fixedInVersion }),
    paths,
  );
}

// ---------------------------------------------------------------- academic approver by personal link

export type InviteResult =
  | { ok: true; url: string; emailed: boolean; userName: string; expiresAt: string }
  | { error: string }
  | null;

const inviteSchema = z.object({
  letterId,
  userId: z.uuid().optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
});

export async function inviteAcademicAction(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const actor = actorOf(await requireUser());
  const parsed = inviteSchema.safeParse(formObject(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "הטופס לא מולא כראוי" };
  const d = parsed.data;
  try {
    const issued = d.userId
      ? await inviteAcademic(actor, d.letterId, { userId: d.userId })
      : await inviteAcademic(actor, d.letterId, { name: d.name ?? "", email: d.email ?? "" });
    revalidatePath(`/letters/${d.letterId}`);
    return { ok: true, url: issued.url, emailed: issued.emailed, userName: issued.userName, expiresAt: issued.expiresAt.toISOString() };
  } catch (err) {
    return { error: userMessage(err) };
  }
}

export async function reissueLinkAction(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const actor = actorOf(await requireUser());
  const parsed = z.object({ letterId, userId: z.uuid() }).safeParse(formObject(form));
  if (!parsed.success) return { error: "הטופס לא מולא כראוי" };
  try {
    const issued = await reissueLink(actor, parsed.data.letterId, parsed.data.userId);
    return { ok: true, url: issued.url, emailed: issued.emailed, userName: issued.userName, expiresAt: issued.expiresAt.toISOString() };
  } catch (err) {
    return { error: userMessage(err) };
  }
}
