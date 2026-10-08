import { NextResponse } from "next/server";
import { redeemLink } from "@/lib/academic/service";
import { allowLoginAttempt } from "@/lib/auth/throttle";
import { setSessionCookie } from "@/lib/auth/session";

/** The shape of a link secret; anything else is not worth asking a new link for. */
const SECRET = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * A personal link from an email. A valid one opens a short session for this one letter and goes
 * to the academic approver's page; anything else (wrong, expired, replaced, revoked) lands on the
 * same neutral page. When the link looks real, that page gets it (`?t=`) so the visitor can ask
 * for a new one; the page answers the same way whether or not such a link existed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const token = (await params).token;
  const invalid = (withToken: boolean) => {
    const url = new URL("/a/invalid", base);
    if (withToken && SECRET.test(token)) url.searchParams.set("t", token);
    const res = NextResponse.redirect(url, 303);
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };
  const ip =
    req.headers.get("fly-client-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    null;
  // Too many tries from this address: do not hand the secret on (it may still be a good link).
  if (!allowLoginAttempt(ip)) return invalid(false);
  const result = await redeemLink(token, req.headers.get("user-agent"));
  if (!result.ok) return invalid(true);
  await setSessionCookie(result.token, result.expiresAt);
  const res = NextResponse.redirect(new URL(`/a/letter/${result.letterId}`, base), 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
