import { getDb, schema, type Db } from "@al/db";
import type { Stage } from "@al/domain";
import { eq } from "drizzle-orm";
import { getDocumentHost } from "../m365/config";
import type { DocumentHost } from "../m365/documents";
import { audit } from "../notify";

const { letterRequests } = schema;

/**
 * Makes the SharePoint working file read-only when a letter reaches APPROVED, and editable
 * again when it is reopened. Best effort, after the stage change has committed: a failure is
 * written to the history instead of failing the approval. "Edit in Word" is hidden on an
 * approved letter either way, because nobody may upload versions to it.
 */
export async function syncLiveFileLock(
  letterId: string,
  from: Stage,
  to: Stage,
  actorId: string,
  opts: { db?: Db; host?: DocumentHost | null } = {},
) {
  const readOnly = to === "APPROVED";
  if ((from === "APPROVED") === readOnly) return; // neither approved nor reopened
  const host = opts.host === undefined ? getDocumentHost() : opts.host;
  if (!host) return;
  const db = opts.db ?? getDb();
  const [row] = await db
    .select({ seasonId: letterRequests.seasonId, driveId: letterRequests.sharepointDriveId, itemId: letterRequests.sharepointItemId })
    .from(letterRequests)
    .where(eq(letterRequests.id, letterId));
  if (!row?.driveId || !row.itemId) return;

  const ids = { letterId, seasonId: row.seasonId };
  try {
    if (await host.setReadOnly({ driveId: row.driveId, itemId: row.itemId }, readOnly))
      await audit(db, actorId, readOnly ? "SHAREPOINT_FILE_LOCKED" : "SHAREPOINT_FILE_UNLOCKED", ids);
  } catch (err) {
    console.error(err);
    await audit(db, actorId, "SHAREPOINT_LOCK_FAILED", ids, {
      readOnly,
      error: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
  }
}
