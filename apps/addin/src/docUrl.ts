export type DocumentLocation =
  | { kind: "unsaved" }
  | { kind: "local"; path: string }
  | { kind: "remote"; url: string };

/**
 * What Office.context.document.url tells us before asking the server. A local path means the
 * file was saved to the computer ("Save As"), so it can never be a letter's working file.
 */
export function classifyDocumentUrl(raw: string | null | undefined): DocumentLocation {
  const value = raw?.trim() ?? "";
  if (!value) return { kind: "unsaved" };
  if (/^https:\/\//i.test(value)) return { kind: "remote", url: value };
  return { kind: "local", path: value };
}

/** The file name at the end of a path or URL, decoded, for showing the user what is open. */
export function fileNameOf(raw: string): string {
  const last = raw.split(/[\\/]/).filter(Boolean).pop() ?? raw;
  const clean = last.split(/[?#]/)[0] ?? last;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}
