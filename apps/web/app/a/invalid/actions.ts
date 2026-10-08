"use server";

import { headers } from "next/headers";
import { requestNewLink } from "@/lib/academic/service";
import type { ActionResult } from "@/lib/action-result";
import { allowLoginAttempt } from "@/lib/auth/throttle";

const SECRET = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * "בקש קישור חדש" from the page of an expired or replaced link. Always answers the same, whether
 * or not the link existed, so nothing can be learned by trying. Limited per address like logins.
 */
export async function requestNewLinkAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const h = await headers();
  const ip = h.get("fly-client-ip")?.trim() || h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null;
  const done: ActionResult = { ok: true, message: "הבקשה נשלחה. איש הקשר שלך במחלקת הרישום יקבל הודעה וישלח לך קישור חדש." };
  if (!allowLoginAttempt(ip)) return { error: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות." };
  const t = form.get("t");
  if (typeof t !== "string" || !SECRET.test(t)) return done;
  try {
    await requestNewLink(t);
  } catch (err) {
    console.error(err);
  }
  return done;
}
