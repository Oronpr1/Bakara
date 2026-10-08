// Does this PDF come from this DOCX? A version is a frozen DOCX + PDF pair; when someone uploads a
// PDF of another letter by mistake, the words of the Word file will mostly be missing from the PDF.
// textMatch() answers with the share (0-100) of the DOCX's distinct words that also appear in the
// PDF, or null when either file's text cannot be read (a scanned PDF, a damaged file).
//
// Both sides are reduced to the same plain words: Hebrew points and cantillation, direction marks,
// geresh/gershayim and quotes are removed, so "תשפ״ז" in Word and "תשפ"ז" in the PDF are one word.
import { strFromU8, unzipSync } from "fflate";

// ---------------------------------------------------------------- words

/** Hebrew points and cantillation marks (U+0591–U+05C7), but not maqaf (U+05BE) or sof pasuq. */
const HEBREW_MARKS = /[֑-ׇֽֿׁׂׅׄ]/g;
/** Direction and invisible formatting characters, soft hyphen. */
const INVISIBLE = /[­؜​-‏‪-‮⁠-⁩﻿]/g;
/** Quote-like characters that sit inside words: geresh, gershayim and their ASCII/typographic stand-ins. */
const QUOTES = /[׳״'"`‘’‚‛“”„‟′″´]/g;

/** One word, the way both files are compared. */
function normalizeText(text: string): string {
  return text
    .normalize("NFKC") // Hebrew presentation forms (U+FB1D…) and ligatures back to plain letters
    .replace(HEBREW_MARKS, "")
    .replace(INVISIBLE, "")
    .replace(QUOTES, "")
    .toLowerCase();
}

/** The distinct words of a text: runs of letters and digits, two characters or more. */
export function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of normalizeText(text).matchAll(/[\p{L}\p{N}]+/gu)) if (m[0].length >= 2) out.add(m[0]);
  return out;
}

// ---------------------------------------------------------------- DOCX

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()]!,
  );

/**
 * The visible text of one WordprocessingML part: the text runs (<w:t>), with a space wherever Word
 * shows a break (paragraph, tab, line break, table cell). Deleted text (<w:delText>) and field
 * codes (<w:instrText>) are not text the reader sees, and are left out.
 */
export function textOfWordXml(xml: string): string {
  const parts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/>|<\/w:(?:p|tc)>|<w:noBreakHyphen\s*\/>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) parts.push(decodeXml(m[1]));
    else if (m[0].startsWith("<w:noBreakHyphen")) parts.push("-");
    else parts.push(" ");
  }
  return parts.join("");
}

/** The text of a DOCX: the body (with text boxes and tables), headers, footers and notes. */
export function docxText(docx: Uint8Array): string | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(docx, { filter: (f) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(f.name) });
  } catch {
    return null;
  }
  const body = files["word/document.xml"];
  if (!body) return null;
  const others = Object.keys(files)
    .filter((n) => n !== "word/document.xml")
    .sort();
  return [body, ...others.map((n) => files[n]!)].map((b) => textOfWordXml(strFromU8(b))).join(" ");
}

// ---------------------------------------------------------------- PDF

/** The part of a pdf.js text item this file uses. */
export interface PdfTextItem {
  str: string;
  /** [a, b, c, d, x, y]: x and y are the item's left edge and baseline. */
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

/**
 * Whether a space separates two consecutive text items. Word writes Hebrew one glyph per item and no
 * space characters at all, so words are told apart by position: a new line, or a horizontal gap
 * wider than a small part of the font size (in either direction, for right-to-left lines).
 */
function gapBetween(a: PdfTextItem, b: PdfTextItem): boolean {
  const size = Math.max(Math.abs(a.height), Math.abs(b.height), 1);
  if (Math.abs(a.transform[5]! - b.transform[5]!) > size * 0.5) return true;
  const ax = a.transform[4]!;
  const bx = b.transform[4]!;
  const gap = Math.max(bx - (ax + a.width), ax - (bx + b.width));
  return gap > size * 0.12;
}

/** One page's text items, in the order the PDF draws them, joined into text with spaces between words. */
export function joinTextItems(items: readonly PdfTextItem[]): string {
  let out = "";
  let prev: PdfTextItem | null = null;
  for (const item of items) {
    if (item.str) {
      if (prev && gapBetween(prev, item)) out += " ";
      out += item.str;
      prev = item;
    }
    if (item.hasEOL) {
      out += " ";
      prev = null;
    }
  }
  return out;
}

/**
 * The text of a PDF, page by page, through pdf.js (the same library the review screen draws with;
 * the legacy build is the one meant for Node).
 */
export async function pdfText(pdf: Uint8Array): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // pdf.js may take over the buffer it is given: work on a copy.
    const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    try {
      const doc = await task.promise;
      const pages: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        pages.push(joinTextItems(content.items.filter((i): i is PdfTextItem & typeof i => "str" in i)));
        page.cleanup();
      }
      return pages.join("\n");
    } finally {
      await task.destroy();
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the match

/**
 * The share (0-100) of the DOCX's distinct words that also appear in the PDF; null when the DOCX
 * has no readable text or the PDF has no text layer at all (for example a scan).
 */
export async function textMatch(docx: Uint8Array, pdf: Uint8Array): Promise<number | null> {
  const dText = docxText(docx);
  if (dText === null) return null;
  const dWords = wordsOf(dText);
  if (dWords.size === 0) return null;
  const pText = await pdfText(pdf);
  if (pText === null) return null;
  const pWords = wordsOf(pText);
  if (pWords.size === 0) return null;
  // A right-to-left line may come out of a PDF in visual order: accept a Hebrew word reversed too.
  for (const w of [...pWords]) if (/[֐-׿]/.test(w)) pWords.add([...w].reverse().join(""));
  let found = 0;
  for (const w of dWords) if (pWords.has(w)) found++;
  return Math.round((found / dWords.size) * 100);
}
