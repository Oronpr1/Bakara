import { NextResponse, type NextRequest } from "next/server";

/**
 * A link to a letter or to the settings, opened without being signed in, goes to the sign-in page
 * and comes back to the same place afterwards. Only the presence of the session cookie is checked
 * here; whether it is valid is decided by the page itself.
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get("al_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/letters/:path*", "/settings/:path*"] };
