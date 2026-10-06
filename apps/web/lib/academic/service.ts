import { getDb, schema, type Db } from "@al/db";
import { abilities, type Actor } from "@al/domain";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createLinkSession, type SessionUser } from "../auth/service";
import { keyedHash, newSessionToken, normalizeEmail } from "../auth/crypto";
import { AppError, forbidden, notFound } from "../errors";
import { escapeHtml, getMailer, rtlEmail } from "../mail";
import { afterChange } from "../letters/engine";
import { loadLetter } from "../letters/state";
import { audit, notify } from "../notify";

const { users, academicLinks, letterAcademics, letterRequests } = schema;

export const LINK_TTL_DAYS = 14;
const linkHash = (token: string) => keyedHash(token, "academic-link");

export interface IssuedLink {
  url: string;
  expiresAt: Date;
  /** True when the link was also sent by email. */
  emailed: boolean;
  userName: string;
}

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Creates the link, replacing any earlier link of the same person for the same letter. */
async function issue(actor: Actor, letterId: string, userId: string, sendMail: boolean, db: Db): Promise<IssuedLink> {
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.active, true)) });
  if (!user?.roles.includes("ACADEMIC_APPROVER")) throw new AppError("INVALID", "המשתמש שנבחר אינו גורם אקדמי פעיל");
  const letter = await db.query.letterRequests.findFirst({ where: eq(letterRequests.id, letterId) });
  if (!letter) throw notFound();
  const assigned = await db.query.letterAcademics.findFirst({
    where: and(eq(letterAcademics.letterId, letterId), eq(letterAcademics.userId, userId), isNull(letterAcademics.removedAt)),
  });
  if (!assigned) throw new AppError("INVALID", "הגורם האקדמי אינו משויך למכתב הזה");

  const secret = newSessionToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx
      .update(academicLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(academicLinks.letterId, letterId), eq(academicLinks.userId, userId), isNull(academicLinks.revokedAt)));
    await tx.insert(academicLinks).values({ letterId, userId, tokenHash: linkHash(secret), expiresAt, createdBy: actor.userId });
    await audit(tx, actor.userId, "ACADEMIC_LINK_ISSUED", { letterId, seasonId: letter.seasonId }, { userId });
  });

  const url = `${appUrl()}/a/${secret}`;
  let emailed = false;
  if (sendMail) {
    try {
      const track = `${letter.trackName} (${letter.trackNumber})`;
      await getMailer().send({
        to: user.email,
        subject: `מכתב קבלה לבדיקתך: ${letter.trackName}`,
        text: `שלום ${user.name},\n\nמכתב הקבלה של המסלול ${track} ממתין לבדיקתך.\nהקישור האישי שלך (בתוקף ${LINK_TTL_DAYS} ימים, אין צורך בסיסמה):\n${url}\n\nאין להעביר את הקישור לאחרים.`,
        html: rtlEmail(
          `<p>שלום ${escapeHtml(user.name)},</p><p>מכתב הקבלה של המסלול <b>${escapeHtml(track)}</b> ממתין לבדיקתך.</p><p><a href="${url}">לפתיחת המכתב</a></p><p>הקישור אישי ובתוקף ${LINK_TTL_DAYS} ימים, ואין צורך בסיסמה. אין להעביר אותו לאחרים.</p>`,
        ),
      });
      await db.update(academicLinks).set({ emailedAt: new Date() }).where(eq(academicLinks.tokenHash, linkHash(secret)));
      emailed = true;
    } catch {
      // No mail transport yet (or it failed): the caller shows the link to be sent by hand.
    }
  }
  return { url, expiresAt, emailed, userName: user.name };
}

/**
 * Adds an academic approver to a letter and gives them a personal link. Either an existing
 * academic user (`userId`) or a new person by name and email, who becomes a user with no password.
 * The letter must be at the academic step.
 */
export async function inviteAcademic(
  actor: Actor,
  letterId: string,
  who: { userId: string } | { name: string; email: string },
  db: Db = getDb(),
): Promise<IssuedLink> {
  const l = await loadLetter(db, letterId);
  const ab = abilities(actor, l.input);
  if (!ab.view) throw notFound();
  if (!ab.sendToAcademic) throw forbidden();

  let userId: string;
  if ("userId" in who) {
    const u = await db.query.users.findFirst({ where: and(eq(users.id, who.userId), eq(users.active, true)) });
    if (!u?.roles.includes("ACADEMIC_APPROVER")) throw new AppError("INVALID", "המשתמש שנבחר אינו גורם אקדמי פעיל");
    userId = u.id;
  } else {
    const name = who.name.trim();
    const email = normalizeEmail(who.email);
    if (!name) throw new AppError("INVALID", "צריך למלא שם");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("INVALID", "כתובת המייל לא תקינה");
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      if (!existing.active || !existing.roles.includes("ACADEMIC_APPROVER"))
        throw new AppError("INVALID", "כבר יש משתמש עם המייל הזה שאינו גורם אקדמי פעיל. מנהלת הבקרה יכולה להוסיף לו את התפקיד");
      userId = existing.id;
    } else {
      const [created] = await db.insert(users).values({ name, email, roles: ["ACADEMIC_APPROVER"] }).returning({ id: users.id });
      userId = created!.id;
      await audit(db, actor.userId, "USER_CREATED", { letterId }, { userId, email, via: "academic invite" });
    }
  }
  await db.transaction(async (tx) => {
    const locked = await loadLetter(tx, letterId, { lock: true });
    const before = abilities(actor, locked.input).flow;
    await tx
      .insert(letterAcademics)
      .values({ letterId, userId, invitedBy: actor.userId })
      .onConflictDoUpdate({ target: [letterAcademics.letterId, letterAcademics.userId], set: { removedAt: null, invitedBy: actor.userId } });
    await audit(tx, actor.userId, "ACADEMIC_ADDED", { letterId, seasonId: locked.row.seasonId }, { userId });
    await afterChange(tx, letterId, before, actor.userId);
  });
  return issue(actor, letterId, userId, true, db);
}

/** Takes an academic approver off the letter (their link stops working). */
export async function removeAcademic(actor: Actor, letterId: string, userId: string, db: Db = getDb()) {
  await db.transaction(async (tx) => {
    const l = await loadLetter(tx, letterId, { lock: true });
    const ab = abilities(actor, l.input);
    if (!ab.view) throw notFound();
    if (!ab.sendToAcademic) throw forbidden();
    await tx.update(letterAcademics).set({ removedAt: new Date() }).where(and(eq(letterAcademics.letterId, letterId), eq(letterAcademics.userId, userId)));
    await tx.update(academicLinks).set({ revokedAt: new Date() }).where(and(eq(academicLinks.letterId, letterId), eq(academicLinks.userId, userId), isNull(academicLinks.revokedAt)));
    await audit(tx, actor.userId, "ACADEMIC_REMOVED", { letterId, seasonId: l.row.seasonId }, { userId });
    await afterChange(tx, letterId, ab.flow, actor.userId);
  });
}

/** A fresh link for an academic approver who is already on the letter (the old link stops working). */
export async function reissueLink(actor: Actor, letterId: string, userId: string, db: Db = getDb()): Promise<IssuedLink> {
  const l = await loadLetter(db, letterId);
  const ab = abilities(actor, l.input);
  if (!ab.view) throw notFound();
  if (!ab.sendToAcademic) throw forbidden();
  return issue(actor, letterId, userId, true, db);
}

export type RedeemResult =
  | { ok: true; letterId: string; token: string; expiresAt: Date }
  | { ok: false };

/** Opens a session from a link's secret. Every failure looks the same to the visitor. */
export async function redeemLink(secret: string, userAgent: string | null, db: Db = getDb()): Promise<RedeemResult> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(secret)) return { ok: false };
  const link = await db.query.academicLinks.findFirst({
    where: and(eq(academicLinks.tokenHash, linkHash(secret)), isNull(academicLinks.revokedAt), gt(academicLinks.expiresAt, new Date())),
  });
  if (!link) return { ok: false };
  const user = await db.query.users.findFirst({ where: and(eq(users.id, link.userId), eq(users.active, true)) });
  const assigned = await db.query.letterAcademics.findFirst({
    where: and(eq(letterAcademics.letterId, link.letterId), eq(letterAcademics.userId, link.userId), isNull(letterAcademics.removedAt)),
  });
  if (!user || !assigned || !user.roles.includes("ACADEMIC_APPROVER")) return { ok: false };

  await db.update(academicLinks).set({ lastUsedAt: new Date() }).where(eq(academicLinks.id, link.id));
  const session = await createLinkSession(user.id, link.letterId, userAgent, db);
  await db.insert(schema.auditEvents).values({ actorId: user.id, letterId: link.letterId, type: "ACADEMIC_LINK_OPENED", data: {} });
  return { ok: true, letterId: link.letterId, ...session };
}

export type { SessionUser };

/**
 * An academic approver whose link expired or was replaced asks for a new one. Always looks the
 * same to the visitor; the advisor and the control manager are told.
 */
export async function requestNewLink(secret: string, db: Db = getDb()): Promise<void> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(secret)) return;
  const link = await db.query.academicLinks.findFirst({ where: eq(academicLinks.tokenHash, linkHash(secret)) });
  if (!link) return;
  const letter = await db.query.letterRequests.findFirst({ where: eq(letterRequests.id, link.letterId) });
  if (!letter) return;
  const control = await db.select({ id: users.id, roles: users.roles }).from(users).where(eq(users.active, true));
  await notify(
    db,
    [letter.advisorId, ...control.filter((u) => u.roles.includes("CONTROL_MANAGER")).map((u) => u.id)],
    "LINK_REQUEST",
    letter.id,
    null,
    { userId: link.userId },
  );
}
