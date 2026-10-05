import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return "development-only-secret-do-not-use-in-production";
}

/** Keyed hash, so a leaked database alone does not reveal codes or session tokens. */
export function keyedHash(value: string, context: string): string {
  return createHmac("sha256", secret()).update(`${context}:${value}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** A 6-digit one-time code, uniformly random. */
export function newLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
