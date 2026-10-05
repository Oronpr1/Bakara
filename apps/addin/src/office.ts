// The only parts of Office.js the pane uses. Nothing here writes to the document: no
// content, no custom XML parts, no settings. The DOCX we upload is exactly what Word gives.

/** Office's default and maximum useful slice size (4MB). */
export const SLICE_SIZE = 4 * 1024 * 1024;

export class OfficeError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "OfficeError";
  }
}

/** getFileAsync is not available in Word on the web; the pane asks for the desktop app there. */
export function isWordOnWeb(): boolean {
  return Office.context.diagnostics?.platform === Office.PlatformType.OfficeOnline;
}

/** Whether this Word build supports Nested App Authentication (MSAL in the add-in). */
export function supportsNestedAppAuth(): boolean {
  return Office.context.requirements.isSetSupported("NestedAppAuth", "1.1");
}

/** The open document's location as Word reports it: a URL for SharePoint files, a path for local ones, "" if unsaved. */
export function documentUrl(): string {
  return Office.context.document.url ?? "";
}

/** Saves the document the way Ctrl+S does. */
export async function saveDocument(): Promise<void> {
  await Word.run(async (context) => {
    context.document.save();
    await context.sync();
  });
}

function sliceBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  if (typeof data === "string") {
    // Some hosts hand binary slices over as base64.
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new OfficeError("Word החזיר נתונים בפורמט לא צפוי");
}

function asError(error: Office.Error | undefined, fallback: string) {
  return new OfficeError(error?.message || fallback, error?.code);
}

function getSlice(file: Office.File, index: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    file.getSliceAsync(index, (res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded) resolve(sliceBytes(res.value.data));
      else reject(asError(res.error, "קריאת הקובץ מ-Word נכשלה"));
    }),
  );
}

function closeFile(file: Office.File): Promise<void> {
  // Word allows only a couple of open file handles; always release ours, and never let a
  // failure to close hide the real result.
  return new Promise((resolve) => file.closeAsync(() => resolve()));
}

/**
 * The whole document in the requested format, assembled from all its slices, read one at a
 * time. The file handle is closed whether reading succeeds or not.
 * Compressed = the DOCX as Word saves it; Pdf = the same as Word's "Save as PDF".
 */
export function getFileBytes(
  type: Office.FileType.Compressed | Office.FileType.Pdf,
  onProgress?: (fraction: number) => void,
  sliceSize: number = SLICE_SIZE,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(type, { sliceSize }, async (res) => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) {
        reject(asError(res.error, type === Office.FileType.Pdf ? "יצירת ה-PDF ב-Word נכשלה" : "קריאת המסמך מ-Word נכשלה"));
        return;
      }
      const file = res.value;
      try {
        const parts: Uint8Array[] = [];
        let total = 0;
        for (let i = 0; i < file.sliceCount; i++) {
          const part = await getSlice(file, i);
          parts.push(part);
          total += part.byteLength;
          onProgress?.((i + 1) / file.sliceCount);
        }
        if (file.size && total !== file.size) throw new OfficeError("הקובץ שהתקבל מ-Word לא שלם. נסו שוב.");
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const p of parts) {
          bytes.set(p, offset);
          offset += p.byteLength;
        }
        await closeFile(file);
        resolve(bytes);
      } catch (err) {
        await closeFile(file);
        reject(err);
      }
    });
  });
}
