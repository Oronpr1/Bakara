import { getDb, schema, type Db } from "@al/db";
import type { Role } from "@al/domain";
import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { AppError } from "../errors";
import { normalizeEmail } from "./crypto";

/**
 * Bearer tokens from the Word add-in. The add-in signs the user in with Nested App
 * Authentication (MSAL) and asks Entra ID for a token to our API scope; here we check that
 * token and map it to an active user of the system. No cookies are involved.
 */

export interface EntraConfig {
  /** The college's directory (tenant) id. Tokens from any other tenant are rejected. */
  tenantId: string;
  /** Client id of the app registration that exposes the API. v2 tokens carry it as `aud`. */
  clientId: string;
  /** Application ID URI of the API (e.g. api://addin.college.ac.il/<client-id>). Also accepted as `aud`. */
  apiUri?: string;
  /** Delegated scope the token must carry. */
  scope: string;
}

export interface EntraIdentity {
  email: string;
  objectId: string | null;
  tenantId: string;
  name: string | null;
}

export class TokenError extends AppError {
  constructor(public readonly reason: string) {
    super("FORBIDDEN", "ההתחברות לא בתוקף. סגרו ופתחו מחדש את החלונית ב-Word.");
    this.name = "TokenError";
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function entraConfigFromEnv(env: Record<string, string | undefined> = process.env): EntraConfig {
  const tenantId = env.ENTRA_TENANT_ID?.trim() ?? "";
  const clientId = env.ENTRA_CLIENT_ID?.trim() ?? "";
  if (!GUID.test(tenantId) || !GUID.test(clientId))
    throw new Error("The Word add-in API is not configured (ENTRA_TENANT_ID, ENTRA_CLIENT_ID)");
  return {
    tenantId,
    clientId,
    apiUri: env.ENTRA_API_URI?.trim() || undefined,
    scope: env.ENTRA_API_SCOPE?.trim() || "access_as_user",
  };
}

export const jwksUrl = (tenantId: string) =>
  new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);

export type TokenVerifier = (token: string) => Promise<EntraIdentity>;

/**
 * Builds a verifier for v2 access tokens issued by the college tenant to our API.
 * `keys` is injectable for tests; production fetches (and caches) Microsoft's signing keys.
 */
export function createEntraVerifier(config: EntraConfig, keys?: JWTVerifyGetKey): TokenVerifier {
  const getKey = keys ?? createRemoteJWKSet(jwksUrl(config.tenantId), { cacheMaxAge: 6 * 60 * 60 * 1000 });
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  const audience = [config.clientId, ...(config.apiUri ? [config.apiUri] : [])];

  return async (token) => {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        issuer,
        audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "tid"],
        clockTolerance: 60,
      }));
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) throw new TokenError(err.code);
      throw err;
    }

    const claims = payload as JWTPayload & Record<string, unknown>;
    if (claims.tid !== config.tenantId) throw new TokenError("wrong tenant");
    // Delegated tokens only: an app-only token (roles, no scp) never acts as a person here.
    const scopes = typeof claims.scp === "string" ? claims.scp.split(" ") : [];
    if (!scopes.includes(config.scope)) throw new TokenError("missing scope");

    const raw = [claims.preferred_username, claims.upn, claims.email].find(
      (v): v is string => typeof v === "string" && v.includes("@"),
    );
    if (!raw) throw new TokenError("no email claim");
    return {
      email: normalizeEmail(raw),
      objectId: typeof claims.oid === "string" ? claims.oid : null,
      tenantId: config.tenantId,
      name: typeof claims.name === "string" ? claims.name : null,
    };
  };
}

let verifier: TokenVerifier | undefined;

/** The process-wide verifier, built from the environment on first use. */
export function getTokenVerifier(): TokenVerifier {
  verifier ??= createEntraVerifier(entraConfigFromEnv());
  return verifier;
}

/** For tests: replace the verifier (undefined restores the default). */
export function setTokenVerifier(v: TokenVerifier | undefined) {
  verifier = v;
}

export interface AddinUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

/** Reads `Authorization: Bearer <token>`, verifies it, and returns the active user it belongs to. */
export async function userFromBearer(
  authorization: string | null,
  verify: TokenVerifier = getTokenVerifier(),
  db: Db = getDb(),
): Promise<AddinUser> {
  const match = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)\s*$/.exec(authorization ?? "");
  if (!match) throw new TokenError("no bearer token");
  const identity = await verify(match[1]!);
  const user = await db.query.users.findFirst({
    where: and(eq(schema.users.email, normalizeEmail(identity.email)), eq(schema.users.active, true)),
  });
  if (!user)
    throw new AppError("FORBIDDEN", "החשבון שלך לא מוגדר במערכת מכתבי הקבלה. פנו למנהלת הבקרה.");
  return { id: user.id, email: user.email, name: user.name, roles: user.roles };
}
