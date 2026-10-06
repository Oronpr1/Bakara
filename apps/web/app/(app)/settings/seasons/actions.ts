"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { createSeason, updateSeason } from "@/lib/letters/service";
import { SEASON_COOKIE } from "@/lib/season-context";

const days = z.coerce
  .number({ message: "מספר הימים צריך להיות מספר" })
  .int({ message: "מספר הימים צריך להיות מספר שלם" })
  .min(1, { message: "מספר הימים לתזכורת צריך להיות בין 1 ל-60" })
  .max(60, { message: "מספר הימים לתזכורת צריך להיות בין 1 ל-60" });
const name = z.string({ message: "צריך לתת שם לעונה" }).trim().min(1, { message: "צריך לתת שם לעונה" }).max(100, { message: "השם ארוך מדי" });
const code = (what: string) => z.string().trim().regex(/^\d{1,6}$/, { message: `${what} צריך להיות ספרות בלבד (למשל 227)` });
const settings = {
  reminderIntervalDays: days,
  order: z.enum(["sequential", "parallel"], { message: "צריך לבחור את סדר הבדיקה" }),
  controlReview: z.literal("on").optional(),
  dueDate: z.iso.date({ message: "תאריך היעד לא תקין" }).optional(),
};
const PATHS = ["/settings/seasons", "/settings/tracks", "/settings/units", "/settings/people", "/"];

/** Opens a season, moves the whole system to it, and continues to its tracks. */
export async function createSeasonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let createdId = "";
  const result = await runAction(
    z
      .object({ name, copyFromSeasonId: z.uuid().optional(), codeFrom: code("הקוד הישן").optional(), codeTo: code("הקוד החדש").optional(), ...settings })
      .refine((d) => !d.copyFromSeasonId || Boolean(d.codeFrom) === Boolean(d.codeTo), {
        message: 'כדי להחליף את תחילת הקוד צריך למלא את שני השדות ("קוד שמתחיל ב-" ו"יתחיל ב-"), או להשאיר את שניהם ריקים',
      }),
    formObject(form),
    async (actor, d) => {
      const copy = Boolean(d.copyFromSeasonId);
      const season = await createSeason(actor, {
        name: d.name,
        copyFromSeasonId: d.copyFromSeasonId,
        codeFrom: copy ? d.codeFrom : undefined,
        codeTo: copy ? d.codeTo : undefined,
        reminderIntervalDays: d.reminderIntervalDays,
        sequentialReview: d.order === "sequential",
        controlReview: d.controlReview === "on",
        dueDate: d.dueDate ?? null,
      });
      createdId = season.id;
    },
    PATHS,
  );
  if (result && "error" in result) return result;
  (await cookies()).set(SEASON_COOKIE, createdId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(`/settings/tracks?opened=${createdId}`);
}

export async function updateSeasonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ seasonId: z.uuid(), name, ...settings }),
    formObject(form),
    (actor, d) =>
      updateSeason(actor, d.seasonId, {
        name: d.name,
        reminderIntervalDays: d.reminderIntervalDays,
        sequentialReview: d.order === "sequential",
        controlReview: d.controlReview === "on",
        dueDate: d.dueDate ?? null,
      }),
    PATHS,
    "ההגדרות נשמרו",
  );
}
