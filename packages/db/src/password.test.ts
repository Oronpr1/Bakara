import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "./password";

describe("passwords", () => {
  it("verifies the right password only, with a fresh salt each time", async () => {
    const a = await hashPassword("a long enough password");
    const b = await hashPassword("a long enough password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("a long enough password", a)).toBe(true);
    expect(await verifyPassword("a long enough passwore", a)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", DUMMY_HASH)).toBe(false);
  });

  it("rejects short or blank passwords", () => {
    expect(passwordProblem("short")).toMatch(/קצרה/);
    expect(passwordProblem(" ".repeat(12))).toMatch(/רווחים/);
    expect(passwordProblem("ok password 12")).toBeNull();
  });
});
