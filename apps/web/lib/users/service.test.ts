// Integration test against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import type { Actor } from "@al/domain";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { loginWithPassword } from "../auth/service";
import { createUser, setUserActive, setUserPassword, setUserRoles } from "./service";

const tag = `users-${process.pid}-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("users admin", () => {
  afterAll(async () => {
    const db = getDb();
    const rows = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `%${tag}%`));
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.actorId, ids));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
    await closeDb();
  });

  it("lets the control manager add, change and deactivate users, with history", async () => {
    const [cmRow] = await getDb()
      .insert(schema.users)
      .values({ email: `cm-${tag}@example.test`, name: "cm", roles: ["CONTROL_MANAGER"] })
      .returning();
    const cm: Actor = { userId: cmRow!.id, roles: ["CONTROL_MANAGER"] };

    const user = await createUser(cm, { name: " דנה ", email: ` Dana-${tag}@Example.test `, roles: ["CONTROL_ADVISOR"], password: "first password 1" });
    expect(user.email).toBe(`dana-${tag}@example.test`);
    expect(user.name).toBe("דנה");
    await expect(createUser(cm, { name: "x", email: user.email, roles: [], password: "first password 1" })).rejects.toThrow(/כבר יש/);
    await expect(createUser(cm, { name: "x", email: `y-${tag}@example.test`, roles: ["BOSS"], password: "first password 1" })).rejects.toThrow();

    // The manager's password works for the new user; a short one is refused; a reset ends old sessions.
    await expect(createUser(cm, { name: "x", email: `s-${tag}@example.test`, roles: [], password: "short" })).rejects.toThrow(/קצרה/);
    const first = await loginWithPassword(user.email, "first password 1", null);
    expect(first.ok).toBe(true);
    await setUserPassword(cm, user.id, "second password 2");
    expect((await loginWithPassword(user.email, "first password 1", null)).ok).toBe(false);
    expect((await loginWithPassword(user.email, "second password 2", null)).ok).toBe(true);
    await getDb().delete(schema.sessions).where(eq(schema.sessions.userId, user.id));

    await setUserRoles(cm, user.id, ["CONTROL_ADVISOR", "ACADEMIC_APPROVER"]);
    await setUserActive(cm, user.id, false);
    const [after] = await getDb().select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(after!.roles).toEqual(["CONTROL_ADVISOR", "ACADEMIC_APPROVER"]);
    expect(after!.active).toBe(false);

    const history = await getDb().select().from(schema.auditEvents).where(eq(schema.auditEvents.actorId, cm.userId));
    expect(history.map((e) => e.type)).toEqual(["USER_CREATED", "USER_PASSWORD_SET", "USER_ROLES_SET", "USER_DEACTIVATED"]);

    // Nobody locks themselves out, and people without the right cannot manage users.
    await expect(setUserActive(cm, cm.userId, false)).rejects.toThrow();
    await expect(setUserRoles(cm, cm.userId, ["CONTROL_ADVISOR"])).rejects.toThrow();
    const advisor: Actor = { userId: user.id, roles: ["CONTROL_ADVISOR"] };
    await expect(createUser(advisor, { name: "x", email: `z-${tag}@example.test`, roles: [], password: "first password 1" })).rejects.toThrow(/הרשאה/);
  });
});
