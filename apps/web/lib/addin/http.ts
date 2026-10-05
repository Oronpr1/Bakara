import type { Actor } from "@al/domain";
import { AppError, userMessage } from "../errors";
import { TokenError, userFromBearer, type AddinUser } from "../auth/entra";

/**
 * Shared plumbing for /api/addin/*: bearer auth (never cookies), CORS limited to the
 * add-in's own origin, size-limited bodies, and `{ error }` replies in Hebrew.
 */

/** The add-in's origin, e.g. https://addin.college.ac.il. Nothing else may call these routes from a browser. */
export function addinOrigin(): string | null {
  const raw = process.env.ADDIN_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function corsHeaders(req: Request, methods = "GET, OPTIONS"): Headers {
  const headers = new Headers({ Vary: "Origin" });
  const origin = req.headers.get("origin");
  const allowed = addinOrigin();
  if (origin && allowed && origin === allowed) {
    headers.set("Access-Control-Allow-Origin", allowed);
    headers.set("Access-Control-Allow-Methods", methods);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

/** Answer to the browser's CORS preflight. */
export function preflight(req: Request, methods: string): Response {
  const origin = req.headers.get("origin");
  if (!origin || origin !== addinOrigin()) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  return new Response(null, { status: 204, headers: corsHeaders(req, methods) });
}

const STATUS: Record<AppError["code"], number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, CONFLICT: 409 };

export function json(req: Request, body: unknown, init: { status?: number; methods?: string } = {}): Response {
  const headers = corsHeaders(req, init.methods);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function errorResponse(req: Request, err: unknown, methods?: string): Response {
  const status = err instanceof TokenError ? 401 : err instanceof AppError ? STATUS[err.code] : 500;
  const res = json(req, { error: userMessage(err) }, { status, methods });
  if (status === 401) res.headers.set("WWW-Authenticate", 'Bearer error="invalid_token"');
  return res;
}

/**
 * Runs a handler for a signed-in add-in user. A request from a browser origin other than the
 * add-in's is refused before the token is even looked at.
 */
export async function withAddinUser(
  req: Request,
  methods: string,
  handler: (user: AddinUser, actor: Actor) => Promise<Response>,
): Promise<Response> {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== addinOrigin()) throw new AppError("FORBIDDEN", "הבקשה הגיעה ממקור לא מורשה");
    const user = await userFromBearer(req.headers.get("authorization"));
    return await handler(user, { userId: user.id, roles: user.roles });
  } catch (err) {
    return errorResponse(req, err, methods);
  }
}

const TOO_LARGE = () => new AppError("INVALID", "הקבצים גדולים מדי (עד 30MB לכל קובץ)");

/** Reads the body, refusing anything larger than `max` bytes without buffering it all first. */
export async function readLimitedBody(req: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw TOO_LARGE();
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw TOO_LARGE();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Parses a size-limited multipart/form-data body. */
export async function readLimitedForm(req: Request, max: number): Promise<FormData> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) throw new AppError("INVALID", "הבקשה לא תקינה");
  const body = await readLimitedBody(req, max);
  try {
    return await new Response(body, { headers: { "Content-Type": type } }).formData();
  } catch {
    throw new AppError("INVALID", "הבקשה לא תקינה");
  }
}
