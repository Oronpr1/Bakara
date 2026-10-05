import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createEntraVerifier, entraConfigFromEnv, TokenError, type EntraConfig, type TokenVerifier } from "./entra";

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER_TENANT = "99999999-8888-7777-6666-555555555555";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const config: EntraConfig = { tenantId: TENANT, clientId: CLIENT, apiUri: `api://addin.college.test/${CLIENT}`, scope: "access_as_user" };

let key: CryptoKey;
let strangerKey: CryptoKey;
let verify: TokenVerifier;

async function token(claims: JWTPayload = {}, opts: { key?: CryptoKey; kid?: string; exp?: string | number } = {}) {
  const base: JWTPayload = {
    iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
    aud: CLIENT,
    tid: TENANT,
    scp: "access_as_user",
    oid: "00000000-0000-0000-0000-000000000001",
    preferred_username: "Advisor@College.TEST",
    name: "יועצת",
    ver: "2.0",
  };
  return new SignJWT({ ...base, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "k1" })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? key);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  strangerKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  // Stands in for https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys
  verify = createEntraVerifier(config, createLocalJWKSet({ keys: [jwk] }));
});

async function rejection(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TokenError);
  return (err as TokenError).reason;
}

describe("Entra ID token validation for the Word add-in", () => {
  it("accepts a good token and maps it to a lower-cased email", async () => {
    const id = await verify(await token());
    expect(id).toMatchObject({ email: "advisor@college.test", tenantId: TENANT, name: "יועצת" });
  });

  it("accepts the Application ID URI as audience and falls back to upn", async () => {
    const id = await verify(await token({ aud: config.apiUri, preferred_username: undefined, upn: "Other@College.test" }));
    expect(id.email).toBe("other@college.test");
  });

  it("rejects a token for another audience", async () => {
    expect(await rejection(verify(await token({ aud: "api://someone-else" })))).toBe("ERR_JWT_CLAIM_VALIDATION_FAILED");
  });

  it("rejects a token issued by another tenant", async () => {
    await rejection(
      verify(await token({ iss: `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0`, tid: OTHER_TENANT })),
    );
    // Right issuer string but a foreign tid claim is refused too.
    expect(await rejection(verify(await token({ tid: OTHER_TENANT })))).toBe("wrong tenant");
  });

  it("rejects a v1 token (sts.windows.net issuer)", async () => {
    await rejection(verify(await token({ iss: `https://sts.windows.net/${TENANT}/` })));
  });

  it("rejects an expired token", async () => {
    const expired = await token({}, { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await rejection(verify(expired))).toBe("ERR_JWT_EXPIRED");
  });

  it("rejects a token without the access_as_user scope", async () => {
    expect(await rejection(verify(await token({ scp: "User.Read" })))).toBe("missing scope");
    // An app-only token (roles, no scp) never acts as a person.
    expect(await rejection(verify(await token({ scp: undefined, roles: ["access_as_user"] })))).toBe("missing scope");
  });

  it("rejects a token signed by an unknown key", async () => {
    await rejection(verify(await token({}, { key: strangerKey })));
    await rejection(verify(await token({}, { key: strangerKey, kid: "other" })));
  });

  it("rejects a token without any email-like claim", async () => {
    expect(await rejection(verify(await token({ preferred_username: "no-at-sign" })))).toBe("no email claim");
  });

  it("reads its configuration from the environment and refuses half a config", () => {
    expect(() => entraConfigFromEnv({ ENTRA_TENANT_ID: TENANT })).toThrow();
    expect(entraConfigFromEnv({ ENTRA_TENANT_ID: TENANT, ENTRA_CLIENT_ID: CLIENT })).toEqual({
      tenantId: TENANT,
      clientId: CLIENT,
      apiUri: undefined,
      scope: "access_as_user",
    });
  });
});
