// Assigning people to many tracks at once ("all the MBA tracks → Limor"). There is no bulk service
// in the letters module, so this calls the existing one-letter services for each chosen track and
// collects what happened. Each track is its own transaction: one failure does not undo the others.
import { getDb, schema, type Db } from "@al/db";
import { canGlobal, type Actor } from "@al/domain";
import { inArray } from "drizzle-orm";
import { AppError, forbidden, userMessage } from "../errors";
import { addLetterPerson, changeAdvisor, removeLetterPerson, setLetterRegistrationManager, type LetterPersonKind } from "../letters/service";
import { loadLetters } from "../letters/state";

const { letterRequests, letterPeople } = schema;

export type BulkMode =
  | "ADVISOR" // the main advisor of the track
  | "MANAGER" // the track's registration manager
  | "MANAGER_CLEAR" // no registration manager (until one is assigned again)
  | "ADD_ADVISOR" // one more advisor on the track
  | "ADD_MANAGER" // one more registration manager on the track
  | "ADD_COMMENTER" // someone attached to look and comment, who approves nothing
  | "REMOVE_ADVISOR"
  | "REMOVE_MANAGER"
  | "REMOVE_COMMENTER";

export const BULK_MODES: readonly BulkMode[] = [
  "ADVISOR",
  "MANAGER",
  "MANAGER_CLEAR",
  "ADD_ADVISOR",
  "ADD_MANAGER",
  "ADD_COMMENTER",
  "REMOVE_ADVISOR",
  "REMOVE_MANAGER",
  "REMOVE_COMMENTER",
];

export interface BulkOutcome {
  /** Tracks that changed. */
  changed: number;
  /** Tracks that were already so (nothing done, nobody notified twice). */
  unchanged: number;
  failed: { letterId: string; track: string; message: string }[];
}

export const MAX_BULK = 500;

/** Applies one assignment to every chosen track. `userId` is required except for MANAGER_CLEAR. */
export async function bulkAssign(
  actor: Actor,
  input: { letterIds: readonly string[]; mode: BulkMode; userId?: string | null },
  db: Db = getDb(),
): Promise<BulkOutcome> {
  if (!canGlobal(actor, "MANAGE_UNITS")) throw forbidden();
  const ids = [...new Set(input.letterIds)];
  if (ids.length === 0) throw new AppError("INVALID", "צריך לבחור לפחות מסלול אחד");
  if (ids.length > MAX_BULK) throw new AppError("INVALID", `אפשר לעדכן עד ${MAX_BULK} מסלולים בפעם אחת`);
  const userId = input.userId ?? null;
  if (input.mode !== "MANAGER_CLEAR" && !userId) throw new AppError("INVALID", "צריך לבחור אדם");

  const [rows, extraRows] = await Promise.all([
    db.select().from(letterRequests).where(inArray(letterRequests.id, ids)),
    db.select().from(letterPeople).where(inArray(letterPeople.letterId, ids)),
  ]);
  const loaded = new Map((await loadLetters(db, rows)).map((l) => [l.row.id, l]));
  const isExtra = (letterId: string, kind: LetterPersonKind) =>
    extraRows.some((e) => e.letterId === letterId && e.userId === userId && e.kind === kind);
  const out: BulkOutcome = { changed: 0, unchanged: 0, failed: [] };

  for (const id of ids) {
    const l = loaded.get(id);
    if (!l) {
      out.failed.push({ letterId: id, track: "—", message: "המסלול לא נמצא" });
      continue;
    }
    const { row, input: flow } = l;
    // What is already so needs no change (and no second notification).
    const already =
      input.mode === "ADVISOR"
        ? row.advisorId === userId
        : input.mode === "MANAGER"
          ? row.registrationManagerId === userId
          : input.mode === "MANAGER_CLEAR"
            ? !row.registrationManagerId
            : input.mode === "ADD_ADVISOR"
              ? row.advisorId === userId || isExtra(id, "ADVISOR")
              : input.mode === "ADD_MANAGER"
                ? flow.people.rmIds.includes(userId!) || isExtra(id, "MANAGER")
                : input.mode === "ADD_COMMENTER"
                  ? isExtra(id, "COMMENTER")
                  : input.mode === "REMOVE_ADVISOR"
                    ? !isExtra(id, "ADVISOR")
                    : input.mode === "REMOVE_MANAGER"
                      ? !isExtra(id, "MANAGER")
                      : !isExtra(id, "COMMENTER");
    if (already) {
      out.unchanged++;
      continue;
    }
    try {
      if (input.mode === "ADVISOR") await changeAdvisor(actor, id, userId!, db);
      else if (input.mode === "MANAGER") await setLetterRegistrationManager(actor, id, userId, db);
      else if (input.mode === "MANAGER_CLEAR") await setLetterRegistrationManager(actor, id, null, db);
      else if (input.mode === "ADD_ADVISOR") await addLetterPerson(actor, id, userId!, "ADVISOR", db);
      else if (input.mode === "ADD_MANAGER") await addLetterPerson(actor, id, userId!, "MANAGER", db);
      else if (input.mode === "ADD_COMMENTER") await addLetterPerson(actor, id, userId!, "COMMENTER", db);
      else if (input.mode === "REMOVE_ADVISOR") await removeLetterPerson(actor, id, userId!, "ADVISOR", db);
      else if (input.mode === "REMOVE_MANAGER") await removeLetterPerson(actor, id, userId!, "MANAGER", db);
      else await removeLetterPerson(actor, id, userId!, "COMMENTER", db);
      out.changed++;
    } catch (err) {
      out.failed.push({ letterId: id, track: `${row.trackName} (${row.trackNumber})`, message: userMessage(err) });
    }
  }
  return out;
}
