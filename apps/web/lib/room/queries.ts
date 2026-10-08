import "server-only";
// Read-only extras for the review room that the shared LetterRoom does not carry.
import { getDb, schema, type Db } from "@al/db";
import { and, eq, isNull } from "drizzle-orm";

const { users, letterAcademics, letterRequests } = schema;

export interface AcademicChoice {
  id: string;
  name: string;
  email: string;
}

/**
 * Who can be picked in "שלח לגורם אקדמי": last season's academic approvers of the same track
 * first (the natural choice), then every other active academic approver. People already on the
 * letter are left out. Only called for someone who may send the letter to an academic approver.
 */
export async function academicChoices(letterId: string, db: Db = getDb()): Promise<{ suggested: AcademicChoice[]; others: AcademicChoice[] }> {
  const [letter] = await db.select({ sourceLetterId: letterRequests.sourceLetterId }).from(letterRequests).where(eq(letterRequests.id, letterId));
  const [all, onLetter, lastYear] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, roles: users.roles }).from(users).where(eq(users.active, true)),
    db
      .select({ userId: letterAcademics.userId })
      .from(letterAcademics)
      .where(and(eq(letterAcademics.letterId, letterId), isNull(letterAcademics.removedAt))),
    letter?.sourceLetterId
      ? db.select({ userId: letterAcademics.userId }).from(letterAcademics).where(eq(letterAcademics.letterId, letter.sourceLetterId))
      : Promise.resolve([] as { userId: string }[]),
  ]);
  const taken = new Set(onLetter.map((a) => a.userId));
  const previous = new Set(lastYear.map((a) => a.userId));
  const academics = all
    .filter((u) => u.roles.includes("ACADEMIC_APPROVER") && !taken.has(u.id))
    .map(({ id, name, email }) => ({ id, name, email }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  return { suggested: academics.filter((u) => previous.has(u.id)), others: academics.filter((u) => !previous.has(u.id)) };
}
