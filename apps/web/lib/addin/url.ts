/**
 * The add-in identifies the open letter by the document's URL (Office.context.document.url).
 * Word Desktop reports it decoded and sometimes with a query string ("?web=1"), while Graph
 * gives the stored `webUrl` percent-encoded. Both are reduced to the same comparison key.
 */

const OFFICE_VIEWERS = new Set(["/_layouts/15/doc.aspx", "/_layouts/15/doc2.aspx", "/_layouts/15/wopiframe.aspx"]);

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // a lone "%" in a file name: keep it as written
  }
}

/**
 * A comparison key for a SharePoint document URL, or null when the value is not an http(s)
 * URL at all (e.g. a local path after "Save As", or an unsaved document).
 *
 * - scheme, default port, query string, fragment and trailing slash are ignored;
 * - every path segment is percent-decoded once and Unicode-normalised (NFC);
 * - comparison is case-insensitive, as SharePoint paths are;
 * - Office viewer links (_layouts/15/Doc.aspx?sourcedoc={guid}) keep only their document id.
 */
export function documentUrlKey(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname) return null;

  const path = url.pathname
    .split("/")
    .map(decodeSegment)
    .join("/")
    .replace(/\/+$/, "")
    .normalize("NFC")
    .toLowerCase();
  const host = url.hostname.toLowerCase();

  if ([...OFFICE_VIEWERS].some((viewer) => path.endsWith(viewer))) {
    const doc = url.searchParams.get("sourcedoc") ?? url.searchParams.get("sourceDoc");
    if (!doc) return null;
    return `${host}${path}?sourcedoc=${doc.replace(/[{}]/g, "").toLowerCase()}`;
  }
  return `${host}${path}`;
}

export function sameDocumentUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = documentUrlKey(a);
  return ka !== null && ka === documentUrlKey(b);
}

/** Graph's encoding of a URL for GET /shares/{id}: "u!" + unpadded base64url. */
export function graphShareId(url: string): string {
  return "u!" + Buffer.from(url, "utf8").toString("base64url");
}
