import { getDb, schema, type Db } from "@al/db";
import { flowView } from "@al/domain";
import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { loadLetter } from "../letters/state";
import { getMailer } from "../mail";
import { notify, type NotificationType } from "../notify";
import { renderDigest, type PendingItem } from "./render";

const { notifications, users, letterRequests, seasons } = schema;

/** Wait this long before emailing, so a burst of events becomes one email. */
const BATCH_DELAY_MS = 2 * 60 * 1000;

/**
 * Emails every user their not-yet-emailed notifications as one digest. A notification is
 * marked emailed only after its email was sent, so a failure is retried on the next run.
 */
export async function sendPendingEmails(db: Db = getDb(), now = new Date(), appUrl = process.env.APP_URL ?? "") {
  const cutoff = new Date(now.getTime() - BATCH_DELAY_MS);
  const pending = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      letterId: notifications.letterId,
      data: notifications.data,
      createdAt: notifications.createdAt,
      email: users.email,
      name: users.name,
      active: users.active,
      trackName: letterRequests.trackName,
      trackNumber: letterRequests.trackNumber,
      campus: letterRequests.campus,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(letterRequests, eq(letterRequests.id, notifications.letterId))
    .where(isNull(notifications.emailedAt))
    .orderBy(asc(notifications.createdAt));

  const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);

  let sent = 0;
  for (const [, items] of byUser) {
    // Hold the whole batch until its newest item has settled.
    if (items.at(-1)!.createdAt > cutoff) continue;
    const ids = items.map((i) => i.id);
    const first = items[0]!;
    if (first.active) {
      const list: PendingItem[] = items.map((i) => ({
        type: i.type as NotificationType,
        letterId: i.letterId,
        letterTitle: i.trackName ? `${i.trackName} ${i.trackNumber} · ${i.campus}` : null,
        data: (i.data ?? {}) as Record<string, unknown>,
      }));
      try {
        await getMailer().send(renderDigest({ email: first.email, name: first.name }, list, appUrl));
        sent++;
      } catch (err) {
        console.error("Email failed; will retry", err);
        continue;
      }
    }
    await db.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, ids));
  }
  return sent;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Reminds whoever holds a letter when they have had it longer than the season's interval (set by
 * the control manager), at most once per interval per letter and person.
 */
export async function queueReminders(db: Db = getDb(), now = new Date()) {
  const open = await db
    .select({ letter: letterRequests, interval: seasons.reminderIntervalDays })
    .from(letterRequests)
    .innerJoin(seasons, eq(seasons.id, letterRequests.seasonId))
    .where(and(eq(seasons.status, "ACTIVE"), ne(letterRequests.phase, "APPROVED")));

  let queued = 0;
  for (const { letter, interval } of open) {
    const intervalMs = interval * DAY;
    if (now.getTime() - letter.holderSince.getTime() < intervalMs) continue;

    const { input } = await loadLetter(db, letter.id);
    const view = flowView(input);
    const waiting = [...view.holder.userIds];
    if (waiting.length === 0) continue;

    const recent = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.letterId, letter.id),
          eq(notifications.type, "REMINDER"),
          gte(notifications.createdAt, new Date(now.getTime() - intervalMs)),
        ),
      );
    const already = new Set(recent.map((r) => r.userId));
    const due = [...new Set(waiting)].filter((u) => !already.has(u));
    if (due.length === 0) continue;
    await notify(db, due, "REMINDER", letter.id, null, { days: Math.floor((now.getTime() - letter.holderSince.getTime()) / DAY) });
    queued += due.length;
  }
  return queued;
}

/** Removes emailed notifications older than a year; history stays in audit_events. */
export async function pruneNotifications(db: Db = getDb(), now = new Date()) {
  await db
    .delete(notifications)
    .where(and(lt(notifications.createdAt, new Date(now.getTime() - 365 * DAY)), sql`${notifications.emailedAt} is not null`));
}
