"use server";

// Opening seasons and their settings moved to /settings/seasons, and new tracks to
// /settings/tracks. This file keeps only what seasons/[id]/NewLetterForm.tsx still uses.
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { createLetterRequest } from "@/lib/letters/service";

const text = (what: string) =>
  z.string({ message: `צריך למלא ${what}` }).trim().min(1, { message: `צריך למלא ${what}` }).max(200);

const letterSchema = z.object({
  seasonId: z.uuid(),
  campus: text("קמפוס"),
  faculty: text("פקולטה"),
  trackName: text("שם מסלול"),
  trackNumber: text("מספר מסלול"),
  dueDate: z.iso.date({ message: "תאריך היעד לא תקין" }).optional(),
  advisorId: z.uuid({ message: "צריך לבחור יועצת בקרה" }).optional(),
  registrationManagerId: z.uuid().optional(),
});

export async function createLetterAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let createdId = "";
  const result = await runAction(
    letterSchema,
    formObject(form),
    async (actor, data) => {
      createdId = (await createLetterRequest(actor, data)).id;
    },
    (d) => [`/seasons/${d.seasonId}`, "/settings/tracks", "/"],
  );
  if (result && "error" in result) return result;
  redirect(`/letters/${createdId}`);
}
