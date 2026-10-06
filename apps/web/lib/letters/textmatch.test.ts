// Text match between a version's DOCX and PDF. Pure functions first, then the real sample letters
// in ~/.local/share/al-demo (skipped on a machine that does not have them).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { docxText, joinTextItems, textMatch, textOfWordXml, wordsOf, type PdfTextItem } from "./textmatch";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (...runs: string[]) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;
const documentXml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`;

/** A minimal DOCX: the ZIP parts a reader needs, with the given body (and optional header/footer). */
function makeDocx(body: string, extra: Record<string, string> = {}): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(documentXml(body)),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}

/** A PDF with one line of Latin text per entry (pdf-lib's standard fonts have no Hebrew). */
async function makePdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  lines.forEach((text, i) => page.drawText(text, { x: 50, y: 750 - i * 20, size: 12, font }));
  return doc.save();
}

describe("words, the way both files are compared", () => {
  const words = (s: string) => [...wordsOf(s)];

  it("drops Hebrew points, direction marks and the quotes inside abbreviations", () => {
    expect(words("שָׁלוֹם")).toEqual(["שלום"]);
    expect(words("‏יום‎ רביעי‫")).toEqual(["יום", "רביעי"]);
    for (const year of ["תשפ״ז", 'תשפ"ז', "תשפ''ז", "תשפ”ז"]) expect(words(year)).toEqual(["תשפז"]);
    expect(words("יח'")).toEqual(words("יח׳"));
    expect(words("ש״ח")).toEqual(["שח"]);
  });

  it("reads Hebrew presentation forms as plain letters", () => {
    expect(words("שׁלום")).toEqual(["שלום"]); // שׁ as one presentation-form character
  });

  it("splits on hyphens, maqaf and punctuation, ignores one-character words and case", () => {
    expect(words("תל-אביב, בית־ספר.")).toEqual(["תל", "אביב", "בית", "ספר"]);
    expect(words("ו-3 B.A Mac MAC")).toEqual(["mac"]);
    expect(words("08.11.2026 09:00-13:00")).toEqual(["08", "11", "2026", "09", "00", "13"]);
  });
});

describe("text of a Word document", () => {
  it("joins a word split across runs, and separates paragraphs, tabs, breaks and table cells", () => {
    const xml = documentXml(
      para("של", "ום ", "רב") +
        "<w:p><w:r><w:t>אחד</w:t><w:tab/><w:t>שניים</w:t><w:br/><w:t>שלושה</w:t></w:r></w:p>" +
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>תא</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>שני</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
        para("סוף"),
    );
    expect([...wordsOf(textOfWordXml(xml))]).toEqual(["שלום", "רב", "אחד", "שניים", "שלושה", "תא", "שני", "סוף"]);
  });

  it("leaves out deleted text and field codes, keeps the field's result, decodes entities", () => {
    const xml = documentXml(
      "<w:p><w:del><w:r><w:delText>מחוק</w:delText></w:r></w:del><w:ins><w:r><w:t>נוסף</w:t></w:r></w:ins></w:p>" +
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> DATE \\@ "dd/MM/yyyy" </w:instrText></w:r><w:r><w:t>07/10/2026</w:t></w:r></w:p>' +
        para("R&amp;D &quot;מבחן&quot; &#1488;&#x05D1;"),
    );
    const w = wordsOf(textOfWordXml(xml));
    expect(w.has("מחוק")).toBe(false);
    expect(w.has("date")).toBe(false);
    expect([...w]).toEqual(["נוסף", "07", "10", "2026", "מבחן", "אב"]);
  });

  it("reads the body, headers, footers and text boxes of a DOCX", () => {
    const docx = makeDocx(
      para("גוף המכתב") + '<w:p><w:r><w:txbxContent><w:p><w:r><w:t>תיבת טקסט</w:t></w:r></w:p></w:txbxContent></w:r></w:p>',
      {
        "word/header1.xml": `<w:hdr ${W}>${para("כותרת עליונה")}</w:hdr>`,
        "word/footer2.xml": `<w:ftr ${W}>${para("כותרת תחתונה")}</w:ftr>`,
        "word/media/image1.png": "not text",
      },
    );
    const w = wordsOf(docxText(docx)!);
    for (const word of ["גוף", "המכתב", "תיבת", "טקסט", "כותרת", "עליונה", "תחתונה"]) expect(w.has(word)).toBe(true);
  });

  it("has no text for a file that is not a DOCX", () => {
    expect(docxText(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(docxText(zipSync({ "hello.txt": strToU8("hi") }))).toBeNull(); // a ZIP, but not a Word file
  });
});

describe("text of a PDF page", () => {
  const item = (str: string, x: number, width: number, y = 700, o: Partial<PdfTextItem> = {}): PdfTextItem => ({
    str,
    transform: [11, 0, 0, 11, x, y],
    width,
    height: 11,
    hasEOL: false,
    ...o,
  });

  it("puts Hebrew written one glyph per item back into words, by the gaps between them", () => {
    // "במעבר מכינה" as Word writes it: right to left, one item per letter, no space characters.
    const items = [
      item("ב", 532.2, 5.9),
      item("מ", 525.8, 6.3),
      item("ע", 519.9, 6.0),
      item("ב", 513.9, 5.9),
      item("ר", 509.0, 4.9),
      item("מ", 499.9, 6.3),
      item("כ", 495.2, 5.0),
      item("י", 492.5, 2.6),
      item("נ", 488.5, 4.0),
      item("ה", 482.3, 6.3),
      item("8.11.2026", 428.1, 43.7), // a number inside the line, after a gap
    ];
    expect(joinTextItems(items)).toBe("במעבר מכינה 8.11.2026");
  });

  it("starts a new word on a new line, after an end-of-line item, and keeps left-to-right words", () => {
    const items = [
      item("Ono", 50, 20),
      item("Academic", 73, 50),
      item("College", 50, 40, 680), // next line, starts at the left again
      item("", 0, 0, 680, { hasEOL: true }),
      item("קמפוס", 500, 30, 660),
      item("x", 470, 5, 660),
    ];
    expect(joinTextItems(items)).toBe("Ono Academic College קמפוס x");
  });
});

describe("text match", () => {
  it("is 100 for a PDF with the same words, whatever their order and spacing", async () => {
    const docx = makeDocx(para("Acceptance letter for the Business") + para("Administration track, 2026"));
    expect(await textMatch(docx, await makePdf(["2026 track: Business Administration", "Acceptance letter for the"]))).toBe(100);
  });

  it("is the share of the Word file's words that the PDF has", async () => {
    const docx = makeDocx(para("alpha beta gamma delta"));
    expect(await textMatch(docx, await makePdf(["alpha beta gamma"]))).toBe(75);
    expect(await textMatch(docx, await makePdf(["alpha beta gamma delta epsilon zeta eta"]))).toBe(100); // extra words in the PDF do not count
    expect(await textMatch(docx, await makePdf(["something else entirely"]))).toBe(0);
  });

  it("cannot judge (null) a scan without text, a damaged file, or an empty Word file", async () => {
    const docx = makeDocx(para("alpha beta"));
    const blank = await PDFDocument.create();
    blank.addPage();
    expect(await textMatch(docx, await blank.save())).toBeNull();
    expect(await textMatch(docx, new TextEncoder().encode("%PDF-1.7 broken"))).toBeNull();
    expect(await textMatch(new Uint8Array([0x50, 0x4b, 3, 4, 0]), await makePdf(["alpha beta"]))).toBeNull();
    expect(await textMatch(makeDocx("<w:p/>"), await makePdf(["alpha beta"]))).toBeNull();
  });

  it("does not take over the caller's PDF bytes", async () => {
    const pdf = await makePdf(["alpha beta"]);
    const copy = new Uint8Array(pdf);
    await textMatch(makeDocx(para("alpha beta")), pdf);
    expect(pdf.byteLength).toBe(copy.byteLength);
    expect(Buffer.from(pdf).equals(Buffer.from(copy))).toBe(true);
  });
});

const demo = join(homedir(), ".local/share/al-demo");
const sample = (name: string) => new Uint8Array(readFileSync(join(demo, name)));
const haveSamples = ["realestate.docx", "realestate.pdf", "interior.docx", "interior.pdf"].every((f) => existsSync(join(demo, f)));

describe.skipIf(!haveSamples)("text match on the real sample letters", () => {
  it("a letter's Word file and the PDF Word made from it match almost fully", async () => {
    expect(await textMatch(sample("realestate.docx"), sample("realestate.pdf"))).toBeGreaterThanOrEqual(90);
    expect(await textMatch(sample("interior.docx"), sample("interior.pdf"))).toBeGreaterThanOrEqual(90);
  }, 20_000);

  it("the two samples are the same letter in two layouts, so their texts match each other too", async () => {
    // Both are "מנהל עסקים עם התמחות בנדל״ן ותשתיות - תעודה בעיצוב פנים" ("פורמט נדלן רגיל" and
    // "פורמט עיצוב פנים"): the two PDFs hold exactly the same 740 words. A text comparison cannot
    // tell them apart, and should not: the words are the same.
    expect(await textMatch(sample("realestate.docx"), sample("interior.pdf"))).toBeGreaterThanOrEqual(90);
  }, 20_000);

  it("a PDF missing part of the letter, or of another document, scores far lower", async () => {
    const full = (await textMatch(sample("realestate.docx"), sample("realestate.pdf")))!;
    const src = await PDFDocument.load(sample("realestate.pdf"));
    for (const keep of [0, 1]) {
      const part = await PDFDocument.create();
      for (const p of await part.copyPages(src, [keep])) part.addPage(p);
      const score = (await textMatch(sample("realestate.docx"), await part.save()))!;
      expect(score).toBeLessThan(70);
      expect(full - score).toBeGreaterThan(30);
    }
    expect(await textMatch(sample("realestate.docx"), await makePdf(["Invoice 2026 for office supplies, paid in full."]))).toBeLessThan(5);
  }, 20_000);
});
