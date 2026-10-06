"use server";

// Thin wrappers around the letter services for the review room. Every rule (who may, when) is
// checked by the services; these only read the form, call, and refresh the pages that show it.
import type { SeatKey } from "@al/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inviteAcademic, reissueLink, removeAcademic } from "@/lib/academic/service";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError, userMessage } from "@/lib/errors";
import * as commentsService from "@/lib/letters/comments";
import { createComment, deleteDraftComment, replyToComment, setCommentStatus } from "@/lib/letters/comments";
import { openInWord, versionFromSharePoint } from "@/lib/letters/live-file";
import { listUsers } from "@/lib/letters/queries";
import {
  addLetterPerson,
  changeAdvisor,
  decideLetter,
  markInGilboa,
  remindHolders,
  removeLetterPerson,
  reopenLetter,
  resetLetterApprovals,
  resubmitLetter,
  retractApproval,
  skipAcademicRound,
  submitLetter,
  uploadVersion,
} from "@/lib/letters/service";
import { composeSuggestion, joinNames, shortName } from "@/lib/room/view";

const letterId = z.uuid();
const note = z.string().trim().max(2000).optional();
const seat = z
  .string()
  .regex(/^(CONTROL|RM|VP|FINAL|ACADEMIC:[0-9a-f-]{36})$/, { message: "לא ברור על איזה תפקיד ההחלטה" })
  .transform((s) => s as SeatKey);
const pick = (what: string) => z.uuid({ message: `צריך לבחור ${what}` });

/**
 * The room itself, the academic's clean page, and the lists that show the letter's state.
 * Revalidating from a server function refreshes the current page in the same response.
 */
const paths = (d: { letterId: string }) => [`/letters/${d.letterId}`, `/a/letter/${d.letterId}`, "/", "/season"];

// ---------------------------------------------------------------- decisions and the flow

export async function decideAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, seat, kind: z.enum(["APPROVED", "CHANGES"]), note }),
    formObject(form),
    (actor, d) => decideLetter(actor, d.letterId, { seat: d.seat, kind: d.kind, note: d.note }),
    paths,
  );
}

export async function submitAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId }), formObject(form), (actor, d) => submitLetter(actor, d.letterId), paths, "נשלח לבדיקה");
}

export async function resubmitAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, resendToAcademic: z.literal("on").optional() }),
    formObject(form),
    (actor, d) => resubmitLetter(actor, d.letterId, { resendToAcademic: d.resendToAcademic === "on" }),
    paths,
    "התיקונים נשלחו",
  );
}

export async function retractAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId, seat }), formObject(form), (actor, d) => retractApproval(actor, d.letterId, d.seat), paths, "האישור שלך בוטל");
}

export async function skipAcademicAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId, note }), formObject(form), (actor, d) => skipAcademicRound(actor, d.letterId, d.note), paths, "דילגנו על הגורם האקדמי");
}

export async function resetApprovalsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, note }),
    formObject(form),
    (actor, d) => resetLetterApprovals(actor, d.letterId, d.note),
    paths,
    "המכתב חזר לבדיקה. כולם יתבקשו לאשר מחדש",
  );
}

export async function reopenAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId, note }), formObject(form), (actor, d) => reopenLetter(actor, d.letterId, d.note), paths, "המכתב נפתח מחדש לאישור סופי");
}

export async function markInGilboaAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId }), formObject(form), (actor, d) => markInGilboa(actor, d.letterId), paths, "סומן: הועלה לגלבוע");
}

export async function remindAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let who: string[] = [];
  const result = await runAction(
    z.object({ letterId }),
    formObject(form),
    async (actor, d) => {
      const ids = await remindHolders(actor, d.letterId);
      const people = new Map((await listUsers()).map((u) => [u.id, u.name]));
      who = ids.map((id) => shortName(people.get(id)));
    },
    paths,
  );
  if (result && "ok" in result) return { ok: true, message: who.length ? `נשלחה תזכורת ל${joinNames(who)}` : "אין למי לשלוח תזכורת" };
  return result;
}

// ---------------------------------------------------------------- people on the track

export async function changeAdvisorAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId, advisorId: pick("יועצת") }), formObject(form), (actor, d) => changeAdvisor(actor, d.letterId, d.advisorId), paths, "היועצת הוחלפה");
}

const kind = z.enum(["ADVISOR", "MANAGER"]);

export async function addPersonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, userId: pick("אדם"), kind }),
    formObject(form),
    (actor, d) => addLetterPerson(actor, d.letterId, d.userId, d.kind),
    paths,
    "נוסף למסלול",
  );
}

export async function removePersonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, userId: z.uuid(), kind }),
    formObject(form),
    (actor, d) => removeLetterPerson(actor, d.letterId, d.userId, d.kind),
    paths,
    "הוסר מהמסלול",
  );
}

// ---------------------------------------------------------------- versions

const MAX_BYTES = 30 * 1024 * 1024;
const file = (what: string) =>
  z
    .instanceof(File, { message: `צריך לבחור קובץ ${what}` })
    .refine((f) => f.size > 0, { message: `צריך לבחור קובץ ${what}` })
    .refine((f) => f.size <= MAX_BYTES, { message: `קובץ ה-${what} גדול מדי (עד 30MB)` });

export async function uploadVersionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, docx: file("Word"), pdf: file("PDF"), note }),
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

/** "ערוך ב-Word": creates the SharePoint working file the first time. Only with Microsoft 365. */
export async function openInWordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId }), formObject(form), (actor, d) => openInWord(actor, d.letterId), paths, "הקובץ נוצר. אפשר לפתוח אותו ב-Word.");
}

export async function versionFromSharePointAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, note }),
    formObject(form),
    (actor, d) => versionFromSharePoint(actor, d.letterId, d.note),
    paths,
    "הגרסה נוצרה מקובץ ה-Word",
  );
}

// ---------------------------------------------------------------- comments

const unit = z.coerce.number().min(0).max(1);
const text = (msg: string) => z.string({ message: msg }).trim().min(1, { message: msg }).max(4000);

/** The kinds of marks on the page: a note (text), an X, or a line. An X or a line with no text is a mark only. */
const MARK_KINDS = ["NOTE", "X", "LINE"] as const;
type MarkKind = (typeof MARK_KINDS)[number];
type MarkPoint = { x: number; y: number };
/** What the comments service takes beyond the anchor and text (kind, colour, the line's points). */
type MarkExtras = { kind?: MarkKind; color?: string; points?: MarkPoint[] };

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: "צבע לא תקין" })
  .optional();
const pointList = z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).max(500);
/** A line's points arrive from the form as JSON text. */
const pointsJson = z
  .string()
  .max(20000)
  .optional()
  .transform((s, ctx) => {
    if (!s) return undefined;
    const parsed = pointList.safeParse((() => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })());
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "הקו שסומן לא תקין" });
      return z.NEVER;
    }
    return parsed.data;
  });

/** A new comment on a marked area. The snapshot PNG is cut in the browser from the rendered page. */
export async function createCommentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z
      .object({
        letterId,
        versionNumber: z.coerce.number().int().min(1),
        page: z.coerce.number().int().min(1),
        x: unit,
        y: unit,
        width: unit,
        height: unit,
        kind: z.enum(MARK_KINDS).optional(),
        color,
        points: pointsJson,
        body: z.string().trim().max(4000).optional(),
        from: z.string().max(1500).optional(),
        to: z.string().max(1500).optional(),
        snapshot: z.instanceof(File).optional(),
      })
      // A note needs its text; an X or a line may stand alone.
      .refine((d) => d.kind === "X" || d.kind === "LINE" || Boolean(d.body), { message: "צריך לכתוב את ההערה", path: ["body"] }),
    formObject(form),
    async (actor, d) => {
      // Built as a variable so the extra fields pass through whether or not the service declares them yet.
      const input: Parameters<typeof createComment>[2] & MarkExtras = {
        anchor: { versionNumber: d.versionNumber, page: d.page, x: d.x, y: d.y, width: d.width, height: d.height },
        body: d.body ?? "",
        suggestion: composeSuggestion(d.from, d.to),
        snapshotPng: d.snapshot && d.snapshot.size > 0 ? new Uint8Array(await d.snapshot.arrayBuffer()) : undefined,
        kind: d.kind,
        color: d.color,
        points: d.points,
      };
      return createComment(actor, d.letterId, input);
    },
    paths,
    "ההערה נשמרה",
  );
}

export interface DraftPatch {
  anchor?: { versionNumber: number; page: number; x: number; y: number; width: number; height: number };
  color?: string;
  points?: MarkPoint[];
  body?: string;
  suggestion?: string;
}

const draftPatch = z.object({
  letterId,
  commentId: z.uuid(),
  patch: z
    .object({
      anchor: z
        .object({
          versionNumber: z.number().int().min(1),
          page: z.number().int().min(1),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().min(0).max(1),
          height: z.number().min(0).max(1),
        })
        .optional(),
      color,
      points: pointList.optional(),
      body: z.string().trim().max(4000).optional(),
      suggestion: z.string().trim().max(3100).optional(),
    })
    .strict(),
});

/**
 * Edits one of my draft marks (move it, change its colour or line, its text). Called by the viewer
 * with plain data, not from a form; the comments service's `updateDraftComment` checks it is mine.
 */
export async function updateDraftAction(input: { letterId: string; commentId: string; patch: DraftPatch }): Promise<ActionResult> {
  return runAction(
    draftPatch,
    input,
    async (actor, d) => {
      // Looked up by name so this file builds before the service gains the function.
      const update = (commentsService as unknown as Record<string, unknown>).updateDraftComment as
        | ((actor: unknown, commentId: string, patch: DraftPatch) => Promise<unknown>)
        | undefined;
      if (typeof update !== "function") throw new AppError("INVALID", "עריכת טיוטה עוד לא זמינה");
      await update(actor, d.commentId, d.patch);
    },
    paths,
  );
}

export async function deleteDraftAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId, commentId: z.uuid() }), formObject(form), (actor, d) => deleteDraftComment(actor, d.commentId), paths, "הטיוטה נמחקה");
}

export async function replyAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, commentId: z.uuid(), body: text("צריך לכתוב תגובה") }),
    formObject(form),
    (actor, d) => replyToComment(actor, d.commentId, d.body),
    paths,
  );
}

export async function commentStatusAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId, commentId: z.uuid(), to: z.enum(["OPEN", "RESOLVED_FIXED", "RESOLVED_NO_CHANGE"]), note: z.string().trim().max(4000).optional() }),
    formObject(form),
    (actor, d) => setCommentStatus(actor, d.commentId, { to: d.to, note: d.note }),
    paths,
  );
}

// ---------------------------------------------------------------- academic approver by personal link

export type InviteResult =
  | { ok: true; url: string; emailed: boolean; userName: string; expiresAt: string; trackName: string }
  | { error: string }
  | null;

const inviteSchema = z.object({
  letterId,
  trackName: z.string().max(300).optional(),
  userId: z.uuid().optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
});

export async function inviteAcademicAction(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const actor = actorOf(await requireUser());
  const parsed = inviteSchema.safeParse(formObject(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "הטופס לא מולא כראוי" };
  const d = parsed.data;
  if (!d.userId && !(d.name && d.email)) return { error: "צריך לבחור גורם מהרשימה, או לכתוב שם ומייל" };
  try {
    const issued = d.userId
      ? await inviteAcademic(actor, d.letterId, { userId: d.userId })
      : await inviteAcademic(actor, d.letterId, { name: d.name ?? "", email: d.email ?? "" });
    for (const p of paths(d)) revalidatePath(p);
    return { ok: true, url: issued.url, emailed: issued.emailed, userName: issued.userName, expiresAt: issued.expiresAt.toISOString(), trackName: d.trackName ?? "" };
  } catch (err) {
    return { error: userMessage(err) };
  }
}

export async function reissueLinkAction(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const actor = actorOf(await requireUser());
  const parsed = z.object({ letterId, userId: z.uuid(), trackName: z.string().max(300).optional() }).safeParse(formObject(form));
  if (!parsed.success) return { error: "הטופס לא מולא כראוי" };
  try {
    const issued = await reissueLink(actor, parsed.data.letterId, parsed.data.userId);
    for (const p of paths(parsed.data)) revalidatePath(p);
    return {
      ok: true,
      url: issued.url,
      emailed: issued.emailed,
      userName: issued.userName,
      expiresAt: issued.expiresAt.toISOString(),
      trackName: parsed.data.trackName ?? "",
    };
  } catch (err) {
    return { error: userMessage(err) };
  }
}

export async function removeAcademicAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(z.object({ letterId, userId: z.uuid() }), formObject(form), (actor, d) => removeAcademic(actor, d.letterId, d.userId), paths, "הגורם האקדמי הוסר");
}
