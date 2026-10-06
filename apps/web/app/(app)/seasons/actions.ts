"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { createLetterRequest, createSeason, setReminderInterval } from "@/lib/letters/service";

const id = (what: string) => z.uuid({ message: `צריך לבחור ${what}` });
const days = z.coerce
  .number({ message: "מספר הימים צריך להיות מספר" })
  .int({ message: "מספר הימים צריך להיות מספר שלם" })
  .min(1, { message: "מספר הימים צריך להיות בין 1 ל-60" })
  .max(60, { message: "מספר הימים צריך להיות בין 1 ל-60" });

const seasonSchema = z.object({
  name: z.string({ message: "צריך לתת שם לעונה" }).trim().min(1, { message: "צריך לתת שם לעונה" }).max(100),
  copyFromSeasonId: z.uuid().optional(),
  reminderIntervalDays: days.optional(),
  codeFrom: z.string().trim().regex(/^\d{1,6}$/, { message: "הקוד הישן צריך להיות ספרות" }).optional(),
  codeTo: z.string().trim().regex(/^\d{1,6}$/, { message: "הקוד החדש צריך להיות ספרות" }).optional(),
});

export async function createSeasonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let createdId = "";
  const result = await runAction(
    seasonSchema,
    formObject(form),
    async (actor, data) => {
      createdId = (await createSeason(actor, data)).id;
    },
    ["/seasons", "/"],
  );
  if (result && "error" in result) return result;
  redirect(`/seasons/${createdId}`);
}

export async function setReminderAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ seasonId: z.uuid(), days }),
    formObject(form),
    (actor, d) => setReminderInterval(actor, d.seasonId, d.days),
    (d) => ["/seasons", `/seasons/${d.seasonId}`],
    "נשמר",
  );
}

const text = (what: string) =>
  z.string({ message: `צריך למלא ${what}` }).trim().min(1, { message: `צריך למלא ${what}` }).max(200);

const letterSchema = z.object({
  seasonId: z.uuid(),
  campus: text("קמפוס"),
  faculty: text("פקולטה"),
  trackName: text("שם מסלול"),
  trackNumber: text("מספר מסלול"),
  dueDate: z.iso.date({ message: "תאריך היעד לא תקין" }).optional(),
  advisorId: id("יועצת בקרה"),
  registrationManagerId: z.uuid().optional(),
  vpId: z.uuid().optional(),
  academicIds: z.array(z.uuid()).optional(),
});

export async function createLetterAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let createdId = "";
  const result = await runAction(
    letterSchema,
    formObject(form),
    async (actor, data) => {
      createdId = (await createLetterRequest(actor, data)).id;
    },
    (d) => [`/seasons/${d.seasonId}`, "/"],
  );
  if (result && "error" in result) return result;
  redirect(`/letters/${createdId}`);
}
