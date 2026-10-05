import type { Api, UploadResult } from "./types";

export type Phase = "save" | "docx" | "pdf" | "upload";

export const PHASE_LABELS: Record<Phase, string> = {
  save: "שומרים את המסמך ב-Word",
  docx: "מכינים את קובץ ה-Word",
  pdf: "Word מפיק PDF",
  upload: "מעלים למערכת",
};

/** The Word operations the save flow needs; office.ts in Word, a mock in tests and preview. */
export interface WordDocument {
  documentUrl(): string;
  saveDocument(): Promise<void>;
  getFile(kind: "docx" | "pdf", onProgress: (fraction: number) => void): Promise<Uint8Array>;
}

export class WrongDocumentError extends Error {
  constructor() {
    super("המסמך הפתוח השתנה מאז שהחלונית נטענה (למשל נשמר בשם אחר). לא נשמרה גרסה. פתחו את המכתב מהמערכת ונסו שוב.");
    this.name = "WrongDocumentError";
  }
}

/**
 * Saves the document, takes the DOCX and Word's own PDF of it, and uploads both as a new
 * official version of `letterId`. Refuses to run if the open document is no longer the one
 * the letter was identified by.
 */
export async function saveVersion(
  word: WordDocument,
  api: Api,
  args: { letterId: string; documentUrl: string; note: string; submit: boolean },
  onPhase: (phase: Phase, fraction: number) => void,
): Promise<UploadResult> {
  const assertSameDocument = () => {
    if (word.documentUrl() !== args.documentUrl) throw new WrongDocumentError();
  };

  assertSameDocument();
  onPhase("save", 0);
  await word.saveDocument();
  assertSameDocument();

  onPhase("docx", 0);
  const docx = await word.getFile("docx", (f) => onPhase("docx", f));
  onPhase("pdf", 0);
  const pdf = await word.getFile("pdf", (f) => onPhase("pdf", f));
  assertSameDocument();

  onPhase("upload", 0);
  return api.upload(
    { letterId: args.letterId, documentUrl: args.documentUrl, docx, pdf, note: args.note.trim(), submit: args.submit },
    (f) => onPhase("upload", f),
  );
}
