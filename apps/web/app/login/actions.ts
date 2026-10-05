"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loginWithPassword } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { allowLoginAttempt } from "@/lib/auth/throttle";

export type LoginState = { error?: string; email?: string };

const emailSchema = z.email();

/**
 * The visitor's address for login rate limits. Only headers our own proxy sets are trusted:
 * Fly.io's Fly-Client-IP, Caddy's X-Real-IP, else the last X-Forwarded-For entry (the one the
 * nearest proxy appended; earlier entries come from the client and can be forged).
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("fly-client-ip")?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    null
  );
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!emailSchema.safeParse(email).success) return { error: "כתובת המייל לא תקינה", email };
  if (!password) return { error: "צריך להזין סיסמה", email };

  if (!allowLoginAttempt(await clientIp()))
    return { error: "יותר מדי ניסיונות כניסה מהכתובת הזו. נסו שוב בעוד כמה דקות.", email };

  const result = await loginWithPassword(email, password, (await headers()).get("user-agent"));
  if (!result.ok)
    return { error: "המייל או הסיסמה שגויים. אחרי 5 ניסיונות כושלים החשבון ננעל ל-15 דקות.", email };
  await setSessionCookie(result.token, result.expiresAt);
  redirect("/");
}
