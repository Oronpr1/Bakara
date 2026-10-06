"use server";
// The home screen's bulk actions: reminders (per person or for the marked letters) and the final
// approval of several letters at once. Each letter goes through the same service call as on its
// own page, so every rule and record (audit, notifications, "in someone's place") is the same.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "../action-result";
import { actorOf } from "../actor";
import { requireUser } from "../auth/session";
import { AppError } from "../errors";
import { decideLetter, remindHolders } from "../letters/service";
import { finalEligible } from "./model";
import { getHomeView, letterExtras } from "./queries";

const ids = z.array(z.uuid()).min(1, "לא נבחרו מכתבים").max(500, "אפשר לבחור עד 500 מכתבים בבת אחת");
const n = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`);

/** Sends one reminder per letter to whoever holds it. Letters the actor may not remind about are skipped. */
async function remindAll(letterIds: string[]) {
  const actor = actorOf(await requireUser());
  let sent = 0;
  let skipped = 0;
  const people = new Set<string>();
  for (const id of letterIds) {
    try {
      const to = await remindHolders(actor, id);
      if (to.length === 0) skipped++;
      else {
        sent++;
        to.forEach((p) => people.add(p));
      }
    } catch (err) {
      if (err instanceof AppError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) skipped++;
      else throw err;
    }
  }
  return { sent, skipped, people: people.size };
}

function remindMessage({ sent, skipped, people }: { sent: number; skipped: number; people: number }): ActionResult {
  if (sent === 0) return { error: "לא נשלחה תזכורת: אף אחד מהמכתבים לא ממתין כרגע למישהו שאפשר להזכיר לו." };
  const skip = skipped ? ` (${n(skipped, "מכתב אחד", "מכתבים")} בלי תזכורת: בהכנה, מאושר או ממתין לך)` : "";
  return { ok: true, message: `נשלחה תזכורת על ${n(sent, "מכתב אחד", "מכתבים")} ל${n(people, "אדם אחד", "אנשים")}${skip}.` };
}

/** "תזכיר" next to a person in "הגורמים": every letter they hold now, that the actor may remind about. */
export async function remindPersonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const input = z.object({ userId: z.uuid(), seasonId: z.uuid() }).safeParse({ userId: form.get("userId"), seasonId: form.get("seasonId") });
  if (!input.success) return { error: "הבקשה לא תקינה" };
  const actor = actorOf(await requireUser());
  try {
    const { letters } = await getHomeView(actor, input.data.seasonId);
    const theirs = letters.filter((l) => l.holderIds.includes(input.data.userId) && l.canRemind).map((l) => l.id);
    if (theirs.length === 0) return { error: "אין מכתב אצלו שאפשר להזכיר עליו (מכתבים בהכנה לא נשלחים לתזכורת)." };
    const result = remindMessage(await remindAll(theirs));
    revalidatePath("/");
    return result;
  } catch (err) {
    console.error(err);
    return { error: "משהו השתבש. נסו שוב." };
  }
}

/** "תזכיר למסומנים". */
export async function remindLettersAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const input = ids.safeParse(form.getAll("ids"));
  if (!input.success) return { error: input.error.issues[0]?.message ?? "הבקשה לא תקינה" };
  try {
    const result = remindMessage(await remindAll(input.data));
    revalidatePath("/");
    return result;
  } catch (err) {
    console.error(err);
    return { error: "משהו השתבש. נסו שוב." };
  }
}

/**
 * "אשר סופית למסומנים": the final approval for each marked letter where it is the actor's turn,
 * nothing is open and they have no unpublished comments on it. The rest are skipped and counted.
 */
export async function approveFinalAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const input = ids.safeParse(form.getAll("ids"));
  if (!input.success) return { error: input.error.issues[0]?.message ?? "הבקשה לא תקינה" };
  const actor = actorOf(await requireUser());
  let approved = 0;
  const skipped: string[] = [];
  try {
    const extras = await letterExtras(actor, input.data);
    for (const id of input.data) {
      const x = extras.get(id);
      // The same check the list uses, on fresh data; decideLetter checks the rules again in its transaction.
      if (!x || !finalEligible(x)) {
        skipped.push(id);
        continue;
      }
      try {
        await decideLetter(actor, id, { seat: "FINAL", kind: "APPROVED" });
        approved++;
      } catch (err) {
        console.warn("final approval skipped", id, err instanceof Error ? err.message : err);
        skipped.push(id);
      }
    }
  } catch (err) {
    console.error(err);
    return { error: "משהו השתבש. נסו שוב." };
  }
  revalidatePath("/");
  if (approved === 0)
    return { error: "אף מכתב לא אושר: הם כבר לא ממתינים לאישור הסופי שלך, או שיש בהם הערות פתוחות או הערות שלך שטרם פורסמו." };
  const skip = skipped.length ? ` ${n(skipped.length, "מכתב אחד דולג", "מכתבים דולגו")} (כבר לא ממתין לאישור סופי, או שיש בו הערות פתוחות).` : "";
  return {
    ok: true,
    message: `${approved === 1 ? "אושר סופית מכתב אחד. היועצת קיבלה הודעה." : `אושרו סופית ${approved} מכתבים. היועצות קיבלו הודעה.`}${skip}`,
  };
}
