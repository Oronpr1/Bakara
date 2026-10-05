// Office-facing code against the Office.js mock. These prove our handling of slices,
// closeAsync and the "wrong document" guard; they cannot prove Word itself behaves the same.
import { describe, expect, it } from "vitest";
import { classifyDocumentUrl, fileNameOf } from "./docUrl";
import { saveVersion, WrongDocumentError, type Phase } from "./flow";
import { getFileBytes, isWordOnWeb, supportsNestedAppAuth } from "./office";
import { MockApi, PREVIEW_URL, previewLetter } from "./preview/mockApi";
import { installMockOffice, type MockOfficeOptions } from "./preview/mockOffice";
import { wordDocument } from "./word";

function bytes(size: number, seed: number) {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * seed + 7) & 0xff;
  return b;
}

// Word's real slice size is 4MB; the tests use small files and slices to stay fast.
const SLICE = 64 * 1024;
const docx = bytes(2 * SLICE + 1234, 13); // three slices
const pdf = bytes(SLICE - 5, 29); // one slice
const same = (a: Uint8Array | undefined, b: Uint8Array) => !!a && Buffer.from(a).equals(Buffer.from(b));

function setup(extra: Partial<MockOfficeOptions> = {}) {
  return installMockOffice({ url: PREVIEW_URL, docx, pdf, ...extra });
}

describe("reading the document from Word", () => {
  it("asks Word for 4MB slices by default", async () => {
    const state = setup();
    expect(same(await getFileBytes(Office.FileType.Compressed), docx)).toBe(true);
    expect(state.slicesRead).toBe(1);
  });

  it("assembles every slice in order and closes the file", async () => {
    const state = setup();
    const seen: number[] = [];
    const out = await getFileBytes(Office.FileType.Compressed, (f) => seen.push(f), SLICE);
    expect(same(out, docx)).toBe(true);
    expect(seen).toEqual([1 / 3, 2 / 3, 1]);
    expect(state).toMatchObject({ opened: 1, closed: 1, openFiles: 0, slicesRead: 3 });
  });

  it("closes the file when a slice fails, so the next request still works", async () => {
    const state = setup({ failSlice: 1 });
    await expect(getFileBytes(Office.FileType.Compressed, undefined, SLICE)).rejects.toThrow();
    await expect(getFileBytes(Office.FileType.Compressed, undefined, SLICE)).rejects.toThrow();
    await expect(getFileBytes(Office.FileType.Compressed, undefined, SLICE)).rejects.toThrow();
    expect(state.openFiles).toBe(0);
    expect(state.closed).toBe(3);
  });

  it("can read many files in a row without leaking handles (Word allows only two open)", async () => {
    const state = setup();
    for (let i = 0; i < 5; i++) expect(same(await getFileBytes(Office.FileType.Pdf, undefined, SLICE), pdf)).toBe(true);
    expect(state.openFiles).toBe(0);
  });

  it("reports a failed PDF export with a Hebrew message", async () => {
    setup({ failOn: "pdf" });
    await expect(getFileBytes(Office.FileType.Pdf)).rejects.toThrow(/An internal error|PDF/);
  });

  it("detects Word on the web and missing Nested App Authentication", () => {
    setup({ platform: "OfficeOnline", nestedAppAuth: false });
    expect(isWordOnWeb()).toBe(true);
    expect(supportsNestedAppAuth()).toBe(false);
    setup();
    expect(isWordOnWeb()).toBe(false);
    expect(supportsNestedAppAuth()).toBe(true);
  });
});

describe("saving a version", () => {
  it("saves, takes the exact DOCX and Word's PDF, and uploads them for the letter", async () => {
    const state = setup();
    const api = new MockApi({ letter: previewLetter(), uploadMs: 1 });
    const phases: Phase[] = [];
    const result = await saveVersion(
      wordDocument(),
      api,
      { letterId: "L1", documentUrl: PREVIEW_URL, note: "  תיקון  ", submit: true },
      (p) => phases.at(-1) !== p && phases.push(p),
    );
    expect(phases).toEqual(["save", "docx", "pdf", "upload"]);
    expect(result).toMatchObject({ versionNumber: 4, submitted: true });
    expect(state.saves).toBe(1);
    expect(state.writes).toBe(0);
    expect(state.openFiles).toBe(0);
    const [upload] = api.uploads;
    expect(same(upload!.docx, docx)).toBe(true);
    expect(same(upload!.pdf, pdf)).toBe(true);
    expect(upload).toMatchObject({ letterId: "L1", documentUrl: PREVIEW_URL, note: "תיקון", submit: true });
  });

  it("refuses to upload if the open document is no longer the letter's file", async () => {
    const state = setup();
    state.url = "C:\\Users\\dana\\Desktop\\copy.docx";
    const api = new MockApi({ letter: previewLetter(), uploadMs: 1 });
    await expect(
      saveVersion(wordDocument(), api, { letterId: "L1", documentUrl: PREVIEW_URL, note: "", submit: false }, () => {}),
    ).rejects.toBeInstanceOf(WrongDocumentError);
    expect(state.saves).toBe(0);
    expect(api.uploads).toHaveLength(0);
  });
});

describe("document location", () => {
  it("tells SharePoint URLs from local paths and unsaved documents", () => {
    expect(classifyDocumentUrl(PREVIEW_URL).kind).toBe("remote");
    expect(classifyDocumentUrl("C:\\Users\\x\\a.docx").kind).toBe("local");
    expect(classifyDocumentUrl("/Users/x/a.docx").kind).toBe("local");
    expect(classifyDocumentUrl("").kind).toBe("unsaved");
    expect(fileNameOf("https://x/sites/a/Shared%20Documents/123%20-%20משפטים.docx?web=1")).toBe("123 - משפטים.docx");
    expect(fileNameOf("C:\\Users\\x\\a b.docx")).toBe("a b.docx");
  });
});
