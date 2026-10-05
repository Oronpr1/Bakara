// Against a real PostgreSQL (DATABASE_URL).
import { closeDb, getDb, schema } from "@al/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setMailer, type MailMessage } from "../mail";
import { notify } from "../notify";
import { queueReminders, sendPendingEmails } from "./worker";

const tag = `notif-${process.pid}-${Date.now()}`;
const sent: MailMessage[] = [];
const ids: Record<string, string> = {};
let seasonId = "";
let letterId = "";

describe.skipIf(!process.env.DATABASE_URL)("notification worker", () => {
  beforeAll(async () => {
    setMailer({ send: async (m) => void sent.push(m) });
    const db = getDb();
    for (const [k, roles] of [
      ["adv", ["CONTROL_ADVISOR"]],
      ["rm", ["REGISTRATION_MANAGER"]],
      ["vp", ["VP_REGISTRATION"]],
    ] as const) {
      const [u] = await db.insert(schema.users).values({ email: `${k}-${tag}@example.test`, name: k, roles: [...roles] }).returning();
      ids[k] = u!.id;
    }
    const [s] = await db.insert(schema.seasons).values({ name: tag, reminderIntervalDays: 2 }).returning();
    seasonId = s!.id;
    const [l] = await db
      .insert(schema.letterRequests)
      .values({
        seasonId,
        campus: "c",
        faculty: "f",
        trackName: "מנהל עסקים",
        trackNumber: "7",
        advisorId: ids.adv!,
        stage: "REGISTRATION_ROUND",
        latestVersion: 1,
        stageChangedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      })
      .returning();
    letterId = l!.id;
    await db.insert(schema.approverAssignments).values([
      { letterId, userId: ids.rm!, slot: "REGISTRATION_MANAGER" },
      { letterId, userId: ids.vp!, slot: "VP_REGISTRATION" },
    ]);
    await db.insert(schema.approvals).values({ letterId, userId: ids.vp!, slot: "VP_REGISTRATION", versionNumber: 1 });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.letterRequests).where(eq(schema.letterRequests.seasonId, seasonId));
    await db.delete(schema.seasons).where(eq(schema.seasons.id, seasonId));
    await db.delete(schema.users).where(inArray(schema.users.id, Object.values(ids)));
    await closeDb();
  });

  it("reminds only the approver still waiting, once per interval", async () => {
    // Counted on this letter only: other letters in a shared dev database may be due too.
    const mine = () => getDb().select().from(schema.notifications).where(eq(schema.notifications.letterId, letterId));
    await queueReminders();
    expect((await mine()).map((r) => r.userId)).toEqual([ids.rm]);
    await queueReminders();
    expect(await mine()).toHaveLength(1);
  });

  it("batches a user's notifications into one email after they settle", async () => {
    await notify(getDb(), [ids.adv!], "NEW_COMMENT", letterId, null);
    await notify(getDb(), [ids.adv!], "COMMENT_REPLY", letterId, null);
    sent.length = 0;
    await sendPendingEmails(getDb(), new Date(), "https://letters.example");
    expect(sent.filter((m) => m.to.startsWith("adv-"))).toHaveLength(0); // too fresh

    await sendPendingEmails(getDb(), new Date(Date.now() + 5 * 60 * 1000), "https://letters.example");
    const mine = sent.filter((m) => m.to.startsWith("adv-"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toBe("2 עדכונים במכתבי הקבלה");
    expect(mine[0]!.text).toContain(`https://letters.example/letters/${letterId}`);
    expect(mine[0]!.text).toContain("מנהל עסקים 7");

    sent.length = 0;
    await sendPendingEmails(getDb(), new Date(Date.now() + 10 * 60 * 1000), "https://letters.example");
    expect(sent.filter((m) => m.to.startsWith("adv-"))).toHaveLength(0); // nothing sent twice
  });
});
