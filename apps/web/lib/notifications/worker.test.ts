// The notification worker against a real PostgreSQL (DATABASE_URL). The worker looks at every
// letter and every pending notification in the database, so each test runs inside a transaction
// that is rolled back at the end: the shared database (and its sample data) is left exactly as it was.
import { closeDb, getDb, schema, type Db } from "@al/db";
import type { Role } from "@al/domain";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideLetter } from "../letters/service";
import { setMailer, type MailMessage } from "../mail";
import { notify } from "../notify";
import { queueReminders, sendPendingEmails } from "./worker";

const tag = `notif-${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
const sent: MailMessage[] = [];
let failFor: string | null = null;

class Rollback extends Error {}
/** Runs `fn` in a transaction that is always rolled back. */
async function rolledBack(fn: (tx: Db) => Promise<void>) {
  await getDb()
    .transaction(async (tx) => {
      await fn(tx as unknown as Db);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

interface Fixture {
  ids: Record<string, string>;
  letters: Record<string, string>;
}

/** People, an active season (reminders every 2 days) and one letter in each situation. */
async function fixture(tx: Db, now: number): Promise<Fixture> {
  const ids: Record<string, string> = {};
  const roles: [string, Role[]][] = [
    ["adv", ["CONTROL_ADVISOR"]],
    ["rm", ["REGISTRATION_MANAGER"]],
    ["vp", ["VP_REGISTRATION"]],
    ["head", ["ACADEMIC_APPROVER"]],
  ];
  for (const [k, r] of roles) {
    const [u] = await tx.insert(schema.users).values({ email: `${k}-${tag}@example.test`, name: k, roles: r }).returning();
    ids[k] = u!.id;
  }
  const [season] = await tx.insert(schema.seasons).values({ name: tag, reminderIntervalDays: 2 }).returning();
  const [archived] = await tx.insert(schema.seasons).values({ name: `${tag}-old`, reminderIntervalDays: 2, status: "ARCHIVED" }).returning();

  const letters: Record<string, string> = {};
  let n = 0;
  const add = async (key: string, o: Partial<typeof schema.letterRequests.$inferInsert> & { heldDays: number }) => {
    const { heldDays, ...rest } = o;
    const [l] = await tx
      .insert(schema.letterRequests)
      .values({
        seasonId: season!.id,
        campus: `קמפוס-${tag}`,
        faculty: "מנהל עסקים",
        trackName: "מנהל עסקים",
        trackNumber: String(++n),
        advisorId: ids.adv!,
        registrationManagerId: ids.rm!,
        latestVersion: 1,
        holderSince: new Date(now - heldDays * DAY - 60 * 60 * 1000),
        ...rest,
      })
      .returning();
    letters[key] = l!.id;
  };
  await add("withManager", { phase: "REVIEW", heldDays: 3 });
  await add("withVp", { phase: "REVIEW", heldDays: 3 });
  await tx.insert(schema.reviews).values({ letterId: letters.withVp!, seat: "RM", kind: "APPROVED", userId: ids.rm!, versionNumber: 1 });
  await add("fixing", { phase: "REVIEW", advisorHold: true, heldDays: 3 });
  await add("fresh", { phase: "REVIEW", heldDays: 1 });
  await add("academic", { phase: "ACADEMIC", heldDays: 4 });
  await tx.insert(schema.letterAcademics).values({ letterId: letters.academic!, userId: ids.head! });
  await add("loading", { phase: "APPROVED", heldDays: 10 });
  await add("archived", { phase: "REVIEW", heldDays: 9, seasonId: archived!.id });
  return { ids, letters };
}

const remindersOf = (tx: Db, letterId: string) =>
  tx
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.letterId, letterId), eq(schema.notifications.type, "REMINDER")));

describe.skipIf(!process.env.DATABASE_URL)("notification worker", () => {
  beforeAll(() => {
    setMailer({
      send: async (m) => {
        if (failFor && m.to === failFor) throw new Error("smtp down");
        sent.push(m);
      },
    });
  });
  afterAll(async () => {
    setMailer(undefined);
    await closeDb();
  });

  it("reminds whoever holds the letter once they have had it longer than the season's interval", async () => {
    await rolledBack(async (tx) => {
      const now = Date.now();
      const { ids, letters } = await fixture(tx, now);
      await queueReminders(tx, new Date(now));
      const to = async (key: string) => (await remindersOf(tx, letters[key]!)).map((r) => r.userId).sort();

      expect(await to("withManager")).toEqual([ids.rm]); // the manager's turn: not the VP, not the advisor
      expect(await to("withVp")).toContain(ids.vp); // the manager approved: the VP (every VP) now holds it
      expect(await to("withVp")).not.toContain(ids.rm);
      expect(await to("fixing")).toEqual([ids.adv]); // being fixed: the advisor holds it
      expect(await to("academic")).toEqual([ids.head]);
      expect(await to("fresh")).toEqual([]); // held 1 day, the interval is 2
      expect(await to("loading")).toEqual([]); // approved letters are not chased
      expect(await to("archived")).toEqual([]); // an archived season is over

      const [r] = await remindersOf(tx, letters.withManager!);
      expect(r!.data).toEqual({ days: 3 });
      expect(r!.emailedAt).toBeNull();
    });
  });

  it("does not remind the same person twice within the interval, and does again after it", async () => {
    await rolledBack(async (tx) => {
      const now = Date.now();
      const { ids, letters } = await fixture(tx, now);
      await queueReminders(tx, new Date(now));
      await queueReminders(tx, new Date(now + 60 * 60 * 1000));
      expect(await remindersOf(tx, letters.withManager!)).toHaveLength(1);

      // Two days later it is still with him: one more reminder, counting the days.
      await queueReminders(tx, new Date(now + 2 * DAY + 2 * 60 * 60 * 1000));
      const all = await remindersOf(tx, letters.withManager!);
      expect(all.map((r) => r.userId)).toEqual([ids.rm, ids.rm]);
      expect(all.map((r) => (r.data as { days: number }).days).sort()).toEqual([3, 5]);
    });
  });

  it("a new holder is not reminded for the time the letter spent with someone else", async () => {
    await rolledBack(async (tx) => {
      const now = Date.now();
      const { ids, letters } = await fixture(tx, now);
      // The manager approves after 3 days: the letter moves to the VP, and "holder since" restarts.
      await decideLetter({ userId: ids.rm!, roles: ["REGISTRATION_MANAGER"] }, letters.withManager!, { seat: "RM", kind: "APPROVED" }, tx);
      const [row] = await tx.select().from(schema.letterRequests).where(eq(schema.letterRequests.id, letters.withManager!));
      expect(now - row!.holderSince.getTime()).toBeLessThan(60 * 1000);
      await queueReminders(tx, new Date(now));
      expect(await remindersOf(tx, letters.withManager!)).toEqual([]);
      // Two days later the VP is reminded, and only the VP's side.
      await queueReminders(tx, new Date(now + 2 * DAY + 60 * 1000));
      const to = (await remindersOf(tx, letters.withManager!)).map((r) => r.userId);
      expect(to).toContain(ids.vp);
      expect(to).not.toContain(ids.rm);
    });
  });

  it("batches a user's notifications into one email after they settle, and never sends twice", async () => {
    await rolledBack(async (tx) => {
      const now = Date.now();
      const { ids, letters } = await fixture(tx, now);
      await notify(tx, [ids.adv!], "NEW_COMMENT", letters.fixing!, null);
      await notify(tx, [ids.adv!], "COMMENT_REPLY", letters.fixing!, null);
      const toAdv = () => sent.filter((m) => m.to === `adv-${tag}@example.test`);

      sent.length = 0;
      await sendPendingEmails(tx, new Date(now), "https://letters.example");
      expect(toAdv()).toHaveLength(0); // too fresh: more may come

      await sendPendingEmails(tx, new Date(now + 5 * 60 * 1000), "https://letters.example/");
      expect(toAdv()).toHaveLength(1);
      const mail = toAdv()[0]!;
      expect(mail.subject).toBe("2 עדכונים במכתבי הקבלה");
      expect(mail.text).toContain(`https://letters.example/letters/${letters.fixing}`);
      expect(mail.text).toContain(`מנהל עסקים 3 · קמפוס-${tag}`);
      expect(mail.text).toContain("נוספה הערה חדשה");
      const mine = await tx.select().from(schema.notifications).where(eq(schema.notifications.userId, ids.adv!));
      expect(mine.every((n) => n.emailedAt !== null)).toBe(true);

      sent.length = 0;
      await sendPendingEmails(tx, new Date(now + 10 * 60 * 1000), "https://letters.example");
      expect(toAdv()).toHaveLength(0);
    });
  });

  it("a reminder email says how long the letter has been waiting", async () => {
    await rolledBack(async (tx) => {
      const now = Date.now();
      const { letters } = await fixture(tx, now);
      await queueReminders(tx, new Date(now));
      sent.length = 0;
      await sendPendingEmails(tx, new Date(now + 5 * 60 * 1000), "https://letters.example");
      const mail = sent.find((m) => m.to === `rm-${tag}@example.test`)!;
      expect(mail.subject).toBe(`תזכורת: המכתב ממתין לך כבר 3 ימים: מנהל עסקים 1 · קמפוס-${tag}`);
      expect(mail.text).toContain(`/letters/${letters.withManager}`);
    });
  });

  it("keeps a failed email for the next run; an inactive user's notifications are dropped without email", async () => {
    await rolledBack(async (tx) => {
      const now = Date.now();
      const { ids, letters } = await fixture(tx, now);
      await notify(tx, [ids.adv!, ids.vp!], "NEW_VERSION", letters.withVp!, null, { number: 2 });
      await tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, ids.vp!));
      const pendingOf = async (userId: string) =>
        (await tx.select().from(schema.notifications).where(and(eq(schema.notifications.userId, userId), inArray(schema.notifications.type, ["NEW_VERSION"])))).filter(
          (n) => n.emailedAt === null,
        );

      sent.length = 0;
      failFor = `adv-${tag}@example.test`;
      try {
        await sendPendingEmails(tx, new Date(now + 5 * 60 * 1000), "https://letters.example");
      } finally {
        failFor = null;
      }
      expect(await pendingOf(ids.adv!)).toHaveLength(1); // not marked: tried again next time
      expect(sent.some((m) => m.to === `vp-${tag}@example.test`)).toBe(false);
      expect(await pendingOf(ids.vp!)).toHaveLength(0); // inactive: marked done, nothing sent

      await sendPendingEmails(tx, new Date(now + 6 * 60 * 1000), "https://letters.example");
      expect(sent.filter((m) => m.to === `adv-${tag}@example.test`).map((m) => m.subject)).toEqual([
        `הועלתה גרסה חדשה (גרסה 2): מנהל עסקים 2 · קמפוס-${tag}`,
      ]);
      expect(await pendingOf(ids.adv!)).toHaveLength(0);
    });
  });

  it("left nothing behind", async () => {
    const left = await getDb().select().from(schema.users).where(eq(schema.users.email, `adv-${tag}@example.test`));
    expect(left).toEqual([]);
  });
});
