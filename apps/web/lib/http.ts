/**
 * Content-Disposition with an ASCII fallback and an RFC 5987 UTF-8 name, so Hebrew file
 * names survive every browser.
 */
export function contentDisposition(filename: string, type: "attachment" | "inline" = "attachment"): string {
  // eslint-disable-next-line no-control-regex
  const clean = filename.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "file";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(clean)}`;
}

/** Percent-encodes everything outside the RFC 5987 attr-char set. */
export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function versionFilename(letter: { trackNumber: string; trackName: string }, number: number, ext: string) {
  return `${letter.trackNumber}-${letter.trackName}-v${number}.${ext}`;
}
