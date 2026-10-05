import type { WordDocument } from "./flow";
import { documentUrl, getFileBytes, saveDocument } from "./office";

/** The open Word document, through Office.js (real or the preview mock). */
export function wordDocument(): WordDocument {
  return {
    documentUrl,
    saveDocument,
    getFile: (kind, onProgress) =>
      getFileBytes(kind === "docx" ? Office.FileType.Compressed : Office.FileType.Pdf, onProgress),
  };
}
