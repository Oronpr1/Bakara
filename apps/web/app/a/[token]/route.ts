import { NextResponse } from "next/server";
import { redeemLink } from "@/lib/academic/service";
import { allowLoginAttempt } from "@/lib/auth/throttle";
import { setSessionCookie } from "@/lib/auth/session";

/**
 * A personal link from an email. A valid one opens a short session for this one letter and goes
 * to it; anything else (wrong, expired, replaced, revoked) lands on the same neutral page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const invalid = () => NextResponse.redirect(new URL("/a/invalid", base), 303);
  const ip =
    req.headers.get("fly-client-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    null;
  if (!allowLoginAttempt(ip)) return invalid();
  const result = await redeemLink((await params).token, req.headers.get("user-agent"));
  if (!result.ok) return invalid();
  await setSessionCookie(result.token, result.expiresAt);
  return NextResponse.redirect(new URL(`/letters/${result.letterId}`, base), 303);
}
