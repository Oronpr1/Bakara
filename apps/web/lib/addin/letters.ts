import { getDb, schema, type Db } from "@al/db";
import { abilities, isOpenComment, STATE_LABELS, type Actor, type Phase } from "@al/domain";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { AppError, notFound } from "../errors";
import { getGraphClient, graphConfigured } from "../m365/config";
import { getFileStore } from "../storage";
import { loadLetter } from "../letters/state";
import { documentUrlKey, graphShareId } from "./url";

const { letterRequests, seasons, comments, users } = schema;

/** Resolves a document URL to its SharePoint drive item, for URLs whose form differs from the stored one. */
export type DriveItemResolver = (url: string) => Promise<{ driveId: string; itemId: string } | null>;

/**
 * Asks Graph which drive item a URL points to (GET /shares/u!.../driveItem). Only used when
 * Microsoft 365 is configured and the plain URL comparison found nothing.
 */
export function graphResolverFromEnv(env: Record<string, string | undefined> = process.env): DriveItemResolver | undefined {
  if (!graphConfigured(env)) return undefined;
  return async (url) => {
    if (!/^https:\/\/[^/]+\.sharepoint\.com\//i.test(url)) return null;
    try {
      const item = await getGraphClient().json<{ id: string; parentReference: { driveId: string } }>(
        "GET",
        `/shares/${graphShareId(url)}/driveItem?$select=id,parentReference`,
      );
      return { driveId: item.parentReference.driveId, itemId: item.id };
    } catch {
      return null; // not found / not shared with the app: treated as "not a letter"
    }
  };
}

/**
 * The letter whose SharePoint working file is the document at `url`, or null.
 * Never guesses: two letters with the same file URL is an error, not a pick.
 */
export async function findLetterIdByDocumentUrl(
  url: string,
  opts: { db?: Db; resolve?: DriveItemResolver } = {},
): Promise<string | null> {
  const key = documentUrlKey(url);
  if (!key) return null;
  const db = opts.db ?? getDb();
  const rows = await db
    .select({
      id: letterRequests.id,
      webUrl: letterRequests.sharepointWebUrl,
      driveId: letterRequests.sharepointDriveId,
      itemId: letterRequests.sharepointItemId,
    })
    .from(letterRequests)
    .where(isNotNull(letterRequests.sharepointWebUrl));

  const matches = rows.filter((r) => documentUrlKey(r.webUrl) === key);
  if (matches.length > 1) throw new AppError("CONFLICT", "הקובץ משויך ליותר ממכתב אחד. פנו למנהלת הבקרה.");
  if (matches[0]) return matches[0].id;

  const item = opts.resolve ? await opts.resolve(url) : null;
  if (!item) return null;
  const byItem = rows.filter((r) => r.itemId === item.itemId && (!r.driveId || r.driveId === item.driveId));
  return byItem.length === 1 ? byItem[0]!.id : null;
}

export interface AddinComment {
  id: string;
  authorName: string;
  body: string;
  page: number;
  versionNumber: number;
  status: "OPEN" | "NEEDS_CLARIFICATION";
  hasSnapshot: boolean;
  createdAt: string;
}

export interface AddinLetter {
  id: string;
  trackName: string;
  trackNumber: string;
  campus: string;
  faculty: string;
  seasonName: string;
  /** The letter's phase (DRAFT, REVIEW, ACADEMIC, FINAL, APPROVED). */
  stage: Phase;
  /** The one-line status people read, e.g. "בתיקון". */
  stageLabel: string;
  latestVersion: number;
  openComments: AddinComment[];
  canUpload: boolean;
  canSubmit: boolean;
}

/** What the task pane shows for one letter. Letters the actor may not view are "not found". */
export async function letterForAddin(actor: Actor, letterId: string, db: Db = getDb()): Promise<AddinLetter> {
  const { row, input } = await loadLetter(db, letterId);
  const ab = abilities(actor, input);
  if (!ab.view) throw notFound();
  const [season] = await db.select({ name: seasons.name }).from(seasons).where(eq(seasons.id, row.seasonId));
  const commentRows = await db
    .select({
      id: comments.id,
      authorName: users.name,
      body: comments.body,
      page: comments.page,
      versionNumber: comments.versionNumber,
      status: comments.status,
      kind: comments.kind,
      snapshotKey: comments.snapshotKey,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.letterId, letterId), isNotNull(comments.publishedAt)))
    .orderBy(asc(comments.page), asc(comments.createdAt));

  return {
    id: row.id,
    trackName: row.trackName,
    trackNumber: row.trackNumber,
    campus: row.campus,
    faculty: row.faculty,
    seasonName: season?.name ?? "",
    stage: row.phase,
    stageLabel: STATE_LABELS[ab.flow.state],
    latestVersion: row.latestVersion,
    openComments: commentRows
      .filter((c) => isOpenComment(c.status))
      .map((c) => ({
        id: c.id,
        authorName: c.authorName,
        body: c.body || (c.kind === "X" ? "סימון X על המסמך" : c.kind === "LINE" ? "קו על המסמך" : c.body),
        page: c.page,
        versionNumber: c.versionNumber,
        status: c.status as AddinComment["status"],
        hasSnapshot: c.snapshotKey !== null,
        createdAt: c.createdAt.toISOString(),
      })),
    canUpload: ab.uploadVersion,
    // "Save and submit" saves the version first, so a draft with no version yet still offers it; and a
    // letter being fixed offers it (it sends the fixes back).
    canSubmit:
      ab.uploadVersion &&
      (ab.flow.phase === "DRAFT" ? ab.flow.blockers.every((b) => b === "NO_VERSION") : ab.flow.fixing),
  };
}

/** The PNG of the area a comment was written about, if the actor may view its letter. */
export async function commentSnapshot(actor: Actor, commentId: string, db: Db = getDb()): Promise<Uint8Array> {
  const [comment] = await db
    .select({ letterId: comments.letterId, snapshotKey: comments.snapshotKey })
    .from(comments)
    .where(eq(comments.id, commentId));
  if (!comment) throw notFound();
  const { input } = await loadLetter(db, comment.letterId);
  if (!abilities(actor, input).view || !comment.snapshotKey) throw notFound();
  return getFileStore().get(comment.snapshotKey);
}

/** Checks that `documentUrl` is still the working file of `letterId` before accepting an upload. */
export async function assertDocumentIsLetter(
  letterId: string,
  documentUrl: string,
  opts: { db?: Db; resolve?: DriveItemResolver } = {},
) {
  const found = await findLetterIdByDocumentUrl(documentUrl, opts);
  if (found !== letterId)
    throw new AppError(
      "CONFLICT",
      "המסמך הפתוח ב-Word הוא לא קובץ המכתב הזה. פתחו את המכתב מספריית SharePoint ונסו שוב.",
    );
}
