"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { userMessage } from "@/lib/errors";
import { importTracks, planTrackImport, readTrackFile, type ImportReport } from "@/lib/import/service";
import { createLetterRequest, removeLetterPerson } from "@/lib/letters/service";
import { BULK_MODES, bulkAssign } from "@/lib/settings/assign";

const PATHS = ["/settings/tracks", "/settings/people", "/"];
const revalidateAll = () => PATHS.forEach((p) => revalidatePath(p));

const text = (what: string) =>
  z.string({ message: `צריך למלא ${what}` }).trim().min(1, { message: `צריך למלא ${what}` }).max(200, { message: `${what}: ארוך מדי` });

/** One letter request (one track) in the season. */
export async function createTrackAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      seasonId: z.uuid({ message: "העונה לא נמצאה" }),
      trackName: text("שם מסלול"),
      trackNumber: text("קוד מסלול").regex(/^\d{4,12}$/, { message: "קוד המסלול צריך להיות ספרות בלבד, לפחות 4 (למשל 227113701)" }),
      campus: text("קמפוס"),
      faculty: text("פקולטה"),
      advisorId: z.uuid().optional(),
      registrationManagerId: z.uuid().optional(),
      dueDate: z.iso.date({ message: "תאריך היעד לא תקין" }).optional(),
    }),
    formObject(form),
    (actor, d) => createLetterRequest(actor, d),
    PATHS,
    "המסלול נוסף. מי ששובץ בו רואה אותו ברשימה שלו.",
  );
}

export type ImportState = { error?: string; mode?: "preview" | "import"; report?: ImportReport; fileName?: string } | null;

const MAX_BYTES = 2 * 1024 * 1024;

/** Tracks from a spreadsheet: first a preview that changes nothing, then the import. */
export async function importTracksAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const actor = actorOf(await requireUser());
  const seasonId = z.uuid().safeParse(form.get("seasonId"));
  const file = form.get("file");
  const mode = form.get("intent") === "import" ? "import" : "preview";
  if (!seasonId.success) return { error: "העונה לא נמצאה" };
  if (!(file instanceof File) || file.size === 0) return { error: "צריך לבחור קובץ" };
  if (file.size > MAX_BYTES) return { error: "הקובץ גדול מדי (עד 2MB)" };
  try {
    const rows = await readTrackFile(file.name, Buffer.from(await file.arrayBuffer()));
    if (mode === "preview") return { mode, report: await planTrackImport(actor, seasonId.data, rows), fileName: file.name };
    const report = await importTracks(actor, seasonId.data, rows);
    revalidateAll();
    return { mode, report, fileName: file.name };
  } catch (err) {
    return { error: userMessage(err) };
  }
}

export type BulkState =
  | { error: string }
  | { ok: true; message: string; failed: { track: string; message: string }[]; at: number }
  | null;

/** One assignment on every chosen track (advisor, registration manager, or one more person). */
export async function bulkAssignAction(_prev: BulkState, form: FormData): Promise<BulkState> {
  const actor = actorOf(await requireUser());
  const parsed = z
    .object({
      mode: z.enum(BULK_MODES, { message: "צריך לבחור מה לעשות" }),
      userId: z.uuid({ message: "צריך לבחור אדם" }).optional(),
      letterIds: z.array(z.uuid()).min(1, { message: "צריך לבחור לפחות מסלול אחד" }),
    })
    .safeParse(formObject(form, ["letterIds"]));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "הטופס לא מולא כראוי" };
  try {
    const r = await bulkAssign(actor, parsed.data);
    revalidateAll();
    const parts =
      r.changed === 0 && r.failed.length === 0
        ? ["לא היה מה לשנות: המסלולים שנבחרו כבר היו כך"]
        : [
            r.changed === 1 ? "עודכן מסלול אחד" : `עודכנו ${r.changed} מסלולים`,
            r.unchanged ? (r.unchanged === 1 ? "מסלול אחד כבר היה כך" : `${r.unchanged} כבר היו כך`) : "",
            r.failed.length ? `${r.failed.length} לא עודכנו (הפירוט למטה)` : "",
          ].filter(Boolean);
    return { ok: true, message: parts.join(" · "), failed: r.failed.map(({ track, message }) => ({ track, message })), at: Date.now() };
  } catch (err) {
    return { error: userMessage(err) };
  }
}

/** Takes one extra person off one track. */
export async function removeExtraAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ letterId: z.uuid(), userId: z.uuid(), kind: z.enum(["ADVISOR", "COMMENTER"]) }),
    formObject(form),
    (actor, d) => removeLetterPerson(actor, d.letterId, d.userId, d.kind),
    PATHS,
    "הוסר/ה מהמסלול",
  );
}
