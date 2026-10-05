// Background worker: emails notification digests every minute and queues reminders every hour.
// Run one or more instances; a PostgreSQL advisory lock makes sure only one works at a time.
import { closeDb, getDb } from "@al/db";
import { sql } from "drizzle-orm";
import { pruneNotifications, queueReminders, sendPendingEmails } from "../lib/notifications/worker";

const LOCK_ID = 774_211; // arbitrary, unique to this job
const db = getDb();
let lastHourly = 0;
let stopping = false;

async function tick() {
  // The transaction only holds the lock (it is released when the transaction ends, on the
  // same connection); the work itself runs on other pooled connections.
  await db.transaction(async (tx) => {
    const [row] = (await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as ok`)).rows as { ok: boolean }[];
    if (!row?.ok) return;
    if (Date.now() - lastHourly > 60 * 60 * 1000) {
      const queued = await queueReminders();
      await pruneNotifications();
      lastHourly = Date.now();
      if (queued) console.info(`Queued ${queued} reminders`);
    }
    const sent = await sendPendingEmails();
    if (sent) console.info(`Sent ${sent} emails`);
  });
}

async function loop() {
  while (!stopping) {
    try {
      await tick();
    } catch (err) {
      console.error("Worker tick failed", err);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
  await closeDb();
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void (stopping = true));
console.info("Notification worker started");
void loop();
