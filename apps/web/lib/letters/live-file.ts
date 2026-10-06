// The letter's working DOCX in SharePoint: creating it for "Edit in Word", checking whether it
// changed since the last version, and turning it into an official version on the server.
import { getDb, schema, type Db } from "@al/db";
import { abilities, type Actor } from "@al/domain";
import { and, eq } from "drizzle-orm";
import { AppError, forbidden } from "../errors";
import { getDocumentHost } from "../m365/config";
import { wordDesktopUrl, type DocumentHost, type LiveDocInfo, type LiveDocRef } from "../m365/documents";
import { GraphError } from "../m365/graph";
import { emptyLetterDocx } from "../m365/template";
import { audit } from "../notify";
import { getFileStore } from "../storage";
import { uploadVersion } from "./service";
import { loadLetter, type LetterRow } from "./state";

const { letterRequests, seasons, versions } = schema;

type Opts = { db?: Db; host?: DocumentHost | null };

function hostOf(opts: Opts): DocumentHost {
  const host = opts.host === undefined ? getDocumentHost() : opts.host;
  if (!host) throw new AppError("INVALID", "החיבור ל-Microsoft 365 לא מוגדר במערכת");
  return host;
}

/** Turns a Graph failure into a message the user can act on; other errors pass through. */
function sharepointError(err: unknown): unknown {
  if (!(err instanceof GraphError)) return err;
  console.error(err);
  if (err.status === 404) return new AppError("NOT_FOUND", "קובץ ה-Word לא נמצא ב-SharePoint. ייתכן שהוא הועבר או נמחק.");
  if (err.status === 423) return new AppError("CONFLICT", "הקובץ נעול ב-SharePoint כרגע. נסו שוב בעוד כמה דקות.");
  return new AppError("CONFLICT", "לא הצלחנו לדבר עם SharePoint. נסו שוב, ואם זה חוזר פנו למנהלת הבקרה.");
}

async function sharepoint<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw sharepointError(err);
  }
}

const refOf = (row: LetterRow): LiveDocRef | null =>
  row.sharepointDriveId && row.sharepointItemId ? { driveId: row.sharepointDriveId, itemId: row.sharepointItemId } : null;

/**
 * "Edit in Word": the Office link that opens the letter's working file in Word on the desktop.
 * The first time, the file is created in SharePoint from the latest official version (or an
 * empty page when there is none yet) and linked to the letter.
 */
export async function openInWord(actor: Actor, letterId: string, opts: Opts = {}): Promise<{ url: string; created: boolean }> {
  const host = hostOf(opts);
  const db = opts.db ?? getDb();
  const { row, input } = await loadLetter(db, letterId);
  if (!abilities(actor, input).uploadVersion) throw forbidden();
  if (row.sharepointWebUrl) return { url: wordDesktopUrl(row.sharepointWebUrl), created: false };

  const [season] = await db.select({ name: seasons.name }).from(seasons).where(eq(seasons.id, row.seasonId));
  const parts = { seasonName: season?.name ?? "", campus: row.campus, trackNumber: row.trackNumber, trackName: row.trackName };
  const [latest] = row.latestVersion
    ? await db
        .select({ docxKey: versions.docxKey })
        .from(versions)
        .where(and(eq(versions.letterId, letterId), eq(versions.number, row.latestVersion)))
    : [];
  // The latest version may be a PDF alone; then the working file starts from the empty letter.
  const docx = latest?.docxKey ? await getFileStore().get(latest.docxKey) : emptyLetterDocx();

  // A file already at the letter's path comes from an earlier attempt that did not finish
  // (or a second click racing this one); link it rather than fail. Its content is unknown,
  // so it counts as changed since the last version.
  let info: LiveDocInfo;
  let cTag: string | null;
  try {
    info = await host.createLetterFile(parts, docx);
    cTag = info.cTag;
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 409)) throw sharepointError(err);
    const found = await sharepoint(() => host.findLetterFile(parts));
    if (!found) throw new AppError("CONFLICT", "לא הצלחנו ליצור את קובץ ה-Word ב-SharePoint. נסו שוב.");
    info = found;
    cTag = null;
  }

  const webUrl = await db.transaction(async (tx) => {
    const { row: now } = await loadLetter(tx, letterId, { lock: true });
    if (now.sharepointWebUrl) return now.sharepointWebUrl; // linked by a concurrent request
    await tx
      .update(letterRequests)
      .set({
        sharepointDriveId: info.driveId,
        sharepointItemId: info.itemId,
        sharepointWebUrl: info.webUrl,
        sharepointVersionCTag: cTag,
      })
      .where(eq(letterRequests.id, letterId));
    await audit(tx, actor.userId, "SHAREPOINT_FILE_CREATED", { letterId, seasonId: row.seasonId }, {
      fromVersion: latest ? row.latestVersion : null,
    });
    return info.webUrl;
  });
  return { url: wordDesktopUrl(webUrl), created: true };
}

export interface LiveFileStatus {
  webUrl: string;
  desktopUrl: string;
  /** The file's content differs from what the last official version was taken from. */
  changed: boolean;
  lastModifiedAt: Date;
  lastModifiedBy: string | null;
}

/**
 * The working file's state for the letter page, or null when there is none (or Microsoft 365
 * is off). Throws AppError when SharePoint cannot be reached; the page shows that instead.
 */
export async function liveFileStatus(row: LetterRow, opts: Pick<Opts, "host"> = {}): Promise<LiveFileStatus | null> {
  const host = opts.host === undefined ? getDocumentHost() : opts.host;
  const ref = refOf(row);
  if (!host || !ref) return null;
  const info = await sharepoint(() => host.getInfo(ref));
  return {
    webUrl: info.webUrl,
    desktopUrl: wordDesktopUrl(info.webUrl),
    changed: info.cTag !== row.sharepointVersionCTag,
    lastModifiedAt: info.lastModifiedAt,
    lastModifiedBy: info.lastModifiedBy,
  };
}

/**
 * "Create version from SharePoint": the server-side alternative to the Word add-in. Takes the
 * DOCX as saved in SharePoint and Microsoft's own PDF rendering of it (Graph ?format=pdf).
 */
export async function versionFromSharePoint(actor: Actor, letterId: string, note: string | undefined, opts: Opts = {}) {
  const host = hostOf(opts);
  const db = opts.db ?? getDb();
  const { row, input } = await loadLetter(db, letterId);
  if (!abilities(actor, input).uploadVersion) throw forbidden();
  const ref = refOf(row);
  if (!ref) throw new AppError("INVALID", "למכתב הזה עדיין אין קובץ Word ב-SharePoint");

  const before = await sharepoint(() => host.getInfo(ref));
  if (row.latestVersion > 0 && before.cTag === row.sharepointVersionCTag)
    throw new AppError("INVALID", "אין שינויים בקובץ ה-Word מאז הגרסה האחרונה");
  const [docx, pdf] = await sharepoint(() => Promise.all([host.downloadDocx(ref), host.convertToPdf(ref)]));
  // The DOCX and the PDF must be the same content: if someone saved in between, start over.
  const after = await sharepoint(() => host.getInfo(ref));
  if (after.cTag !== before.cTag)
    throw new AppError("CONFLICT", "הקובץ השתנה בזמן יצירת הגרסה (מישהו עורך אותו עכשיו). נסו שוב בעוד רגע.");

  return uploadVersion(actor, letterId, { docx, pdf, note, pdfSource: "GRAPH", sharepointCTag: before.cTag }, db);
}

/**
 * The working file's content tag right now, for a version saved by the Word add-in, or
 * undefined when it cannot be read. Read before the upload is stored: an edit saved after
 * this moment then still shows as a change, never the other way round.
 */
export async function currentCTag(letterId: string, opts: Opts = {}): Promise<string | undefined> {
  const host = opts.host === undefined ? getDocumentHost() : opts.host;
  if (!host) return undefined;
  try {
    const { row } = await loadLetter(opts.db ?? getDb(), letterId);
    const ref = refOf(row);
    return ref ? (await host.getInfo(ref)).cTag : undefined;
  } catch (err) {
    console.error(err);
    return undefined;
  }
}
