import { PDFDocument } from "pdf-lib";
import {
  letterPath,
  wordDesktopUrl,
  type DocumentHost,
  type LetterPathParts,
  type LiveDocInfo,
  type LiveDocRef,
} from "@/lib/m365/documents";
import { GraphError } from "@/lib/m365/graph";

interface FakeFile {
  path: string;
  docx: Uint8Array;
  cTag: number;
  readOnly: boolean;
}

/** An in-memory SharePoint library: files by item id, content tags that change on every save. */
export class FakeDocumentHost implements DocumentHost {
  files = new Map<string, FakeFile>();
  lockCalls: boolean[] = [];
  /** Set to make setReadOnly fail, like a checkout while someone has the file open. */
  lockError: Error | null = null;
  /** Runs between the DOCX download and the PDF rendering, to simulate a save in between. */
  duringConvert: (() => void) | null = null;
  private seq = 0;

  constructor(private locks = true) {}

  private info(itemId: string): LiveDocInfo {
    const f = this.files.get(itemId);
    if (!f) throw new GraphError(404, "itemNotFound", "not found");
    return {
      driveId: "drive-fake",
      itemId,
      webUrl: `https://college.sharepoint.com/sites/letters/Shared%20Documents/${f.path}`,
      cTag: `"c:{${itemId}},${f.cTag}"`,
      lastModifiedAt: new Date(),
      lastModifiedBy: "advisor@college.ac.il",
      size: f.docx.byteLength,
    };
  }

  /** Someone saves the file in Word. */
  save(itemId: string, docx: Uint8Array) {
    const f = this.files.get(itemId)!;
    f.docx = docx;
    f.cTag++;
  }

  /** A file put at the letter's path outside the app (or by an attempt that did not finish). */
  seed(parts: LetterPathParts, docx: Uint8Array): string {
    const itemId = `item-${++this.seq}`;
    this.files.set(itemId, { path: letterPath(parts), docx, cTag: 1, readOnly: false });
    return itemId;
  }

  async createLetterFile(parts: LetterPathParts, docx: Uint8Array) {
    const path = letterPath(parts);
    if ([...this.files.values()].some((f) => f.path === path)) throw new GraphError(409, "nameAlreadyExists", "exists");
    return this.info(this.seed(parts, docx));
  }

  async findLetterFile(parts: LetterPathParts) {
    const path = letterPath(parts);
    const hit = [...this.files.entries()].find(([, f]) => f.path === path);
    return hit ? this.info(hit[0]) : null;
  }

  async getInfo(ref: LiveDocRef) {
    return this.info(ref.itemId);
  }

  async downloadDocx(ref: LiveDocRef) {
    this.info(ref.itemId);
    return this.files.get(ref.itemId)!.docx;
  }

  async convertToPdf(ref: LiveDocRef) {
    this.info(ref.itemId);
    this.duringConvert?.();
    const doc = await PDFDocument.create();
    doc.addPage();
    return doc.save();
  }

  desktopEditUrl(info: LiveDocInfo) {
    return wordDesktopUrl(info.webUrl);
  }

  async setReadOnly(ref: LiveDocRef, readOnly: boolean) {
    if (!this.locks) return false;
    if (this.lockError) throw this.lockError;
    this.lockCalls.push(readOnly);
    this.files.get(ref.itemId)!.readOnly = readOnly;
    return true;
  }
}
