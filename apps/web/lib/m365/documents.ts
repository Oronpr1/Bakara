import { GraphClient, GraphError } from "./graph";

/** Where a letter's live working DOCX lives in SharePoint. */
export interface LiveDocRef {
  driveId: string;
  itemId: string;
}

export interface LiveDocInfo extends LiveDocRef {
  webUrl: string;
  /** Changes whenever the file content changes (unlike eTag, which also tracks metadata). */
  cTag: string;
  lastModifiedAt: Date;
  lastModifiedBy: string | null;
  size: number;
}

export interface LetterPathParts {
  seasonName: string;
  campus: string;
  trackNumber: string;
  trackName: string;
}

/**
 * The live document store: the DOCX the advisor edits in Word. Official versions are frozen
 * copies kept separately (see uploadVersion); this only manages the working file.
 */
export interface DocumentHost {
  createLetterFile(parts: LetterPathParts, docx: Uint8Array): Promise<LiveDocInfo>;
  getInfo(ref: LiveDocRef): Promise<LiveDocInfo>;
  downloadDocx(ref: LiveDocRef): Promise<Uint8Array>;
  /** Review PDF rendered by Microsoft's service. Fallback when the Word add-in did not make one. */
  convertToPdf(ref: LiveDocRef): Promise<Uint8Array>;
  /** A link that opens the file in Word on the desktop. */
  desktopEditUrl(info: LiveDocInfo): string;
}

/** Characters SharePoint does not allow in file and folder names. */
export function safeName(s: string): string {
  const cleaned = s
    .replace(/["*:<>?/\\|#%]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return (cleaned || "ללא שם").slice(0, 120);
}

export function letterPath(p: LetterPathParts): string {
  return [safeName(p.seasonName), safeName(p.campus), `${safeName(p.trackNumber)} - ${safeName(p.trackName)}.docx`]
    .map(encodeURIComponent)
    .join("/");
}

/** Office URI scheme: "ofe" = open for edit in the desktop app. */
export function wordDesktopUrl(webUrl: string): string {
  return `ms-word:ofe|u|${webUrl}`;
}

interface DriveItem {
  id: string;
  webUrl: string;
  cTag: string;
  size: number;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { email?: string; displayName?: string } };
  parentReference: { driveId: string };
}

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
const CHUNK = 5 * 320 * 1024; // upload session chunks must be multiples of 320 KiB

/**
 * SharePoint document library of the one site the app may access (Graph "Sites.Selected").
 */
export class SharePointDocumentHost implements DocumentHost {
  constructor(
    private graph: GraphClient,
    private siteId: string = process.env.M365_SITE_ID ?? "",
  ) {
    if (!siteId) throw new Error("M365_SITE_ID is not configured");
  }

  private toInfo(item: DriveItem): LiveDocInfo {
    return {
      driveId: item.parentReference.driveId,
      itemId: item.id,
      webUrl: item.webUrl,
      cTag: item.cTag,
      size: item.size,
      lastModifiedAt: new Date(item.lastModifiedDateTime),
      lastModifiedBy: item.lastModifiedBy?.user?.email ?? item.lastModifiedBy?.user?.displayName ?? null,
    };
  }

  async createLetterFile(parts: LetterPathParts, docx: Uint8Array): Promise<LiveDocInfo> {
    const path = letterPath(parts);
    // "fail": never overwrite a working file that already exists at this path.
    const base = `/sites/${this.siteId}/drive/root:/${path}:`;
    if (docx.byteLength <= SIMPLE_UPLOAD_LIMIT) {
      const res = await this.graph.request("PUT", `${base}/content?@microsoft.graph.conflictBehavior=fail`, {
        body: new Uint8Array(docx),
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      });
      return this.toInfo((await res.json()) as DriveItem);
    }
    const session = await this.graph.json<{ uploadUrl: string }>("POST", `${base}/createUploadSession`, {
      item: { "@microsoft.graph.conflictBehavior": "fail" },
    });
    let item: DriveItem | undefined;
    for (let start = 0; start < docx.byteLength; start += CHUNK) {
      const end = Math.min(start + CHUNK, docx.byteLength);
      // The upload URL is pre-authenticated; it must not receive the bearer token.
      const res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${start}-${end - 1}/${docx.byteLength}` },
        body: docx.slice(start, end),
      });
      if (!res.ok && res.status !== 202) throw new GraphError(res.status, "uploadFailed", "Upload session chunk failed");
      if (res.status === 200 || res.status === 201) item = (await res.json()) as DriveItem;
    }
    if (!item) throw new GraphError(500, "uploadIncomplete", "Upload session did not return the file");
    return this.toInfo(item);
  }

  async getInfo(ref: LiveDocRef): Promise<LiveDocInfo> {
    return this.toInfo(await this.graph.json<DriveItem>("GET", `/drives/${ref.driveId}/items/${ref.itemId}`));
  }

  downloadDocx(ref: LiveDocRef): Promise<Uint8Array> {
    return this.graph.bytes(`/drives/${ref.driveId}/items/${ref.itemId}/content`);
  }

  convertToPdf(ref: LiveDocRef): Promise<Uint8Array> {
    return this.graph.bytes(`/drives/${ref.driveId}/items/${ref.itemId}/content?format=pdf`);
  }

  desktopEditUrl(info: LiveDocInfo): string {
    return wordDesktopUrl(info.webUrl);
  }
}
