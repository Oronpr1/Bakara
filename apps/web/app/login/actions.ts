"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

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
  const intent = form.get("intent");
  const email = String(form.get("email") ?? "").trim();

  if (intent === "request") {
    if (!emailSchema.safeParse(email).success) return { step: "email", error: "כתובת המייל לא תקינה" };
    await requestLoginCode(email, await clientIp());
    return { step: "code", email };
  }

  if (intent === "verify") {
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    const result = await verifyLoginCode(email, code, (await headers()).get("user-agent"));
    if (!result.ok) return { step: "code", email, error: "הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש." };
    await setSessionCookie(result.token, result.expiresAt);
    redirect("/");
  }

  return { step: "email" };
}
