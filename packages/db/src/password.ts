// Password hashing shared by the web app and the command-line tools (create-admin, seed).
// scrypt from node:crypto, one random salt per password; the stored string carries its own
// parameters so they can be raised later without breaking old hashes.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const MAXMEM = 128 * N * R * 2;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

/** Returns an Hebrew error message when the password is not acceptable, else null. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `הסיסמה קצרה מדי: לפחות ${MIN_PASSWORD_LENGTH} תווים`;
  if (password.length > MAX_PASSWORD_LENGTH) return "הסיסמה ארוכה מדי";
  if (!password.trim()) return "הסיסמה לא יכולה להיות רווחים בלבד";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A well-formed hash nobody knows the password of, to spend the same time on unknown emails. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEY_LEN).toString("base64")}`;
