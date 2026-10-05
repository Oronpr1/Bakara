import type { Host } from "../App";
import { isWordOnWeb, supportsNestedAppAuth } from "../office";
import { wordDocument } from "../word";
import { MockApi, PREVIEW_URL, previewLetter } from "./mockApi";
import { installMockOffice } from "./mockOffice";

/**
 * Dev preview: `?preview=<scenario>` runs the real pane and the real Office-facing code
 * against a mocked Office.js and an in-memory API, in a plain browser.
 */
export const SCENARIOS = ["found", "empty", "readonly", "local", "unknown", "unsaved", "web", "no-naa", "error", "fail"] as const;
export type Scenario = (typeof SCENARIOS)[number];

function fakeFile(size: number, header: string): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode(header));
  for (let i = header.length; i < size; i++) bytes[i] = (i * 31) & 0xff;
  return bytes;
}

export function installPreview(name: string): Host {
  const scenario: Scenario = (SCENARIOS as readonly string[]).includes(name) ? (name as Scenario) : "found";
  const url =
    scenario === "local"
      ? "C:\\Users\\dana\\Documents\\123 - משפטים (עותק).docx"
      : scenario === "unsaved"
        ? ""
        : scenario === "unknown"
          ? "https://college.sharepoint.com/sites/letters/Shared Documents/טיוטות/מכתב ישן.docx"
          : PREVIEW_URL;

  installMockOffice({
    url,
    platform: scenario === "web" ? "OfficeOnline" : "PC",
    nestedAppAuth: scenario !== "no-naa",
    // Larger than one 4MB slice, so the preview reads several slices like Word would.
    docx: fakeFile(9 * 1024 * 1024 + 123, "PK\u0003\u0004[Content_Types].xml"),
    pdf: fakeFile(5 * 1024 * 1024, "%PDF-1.7"),
    delay: { save: 500, slice: 120, pdf: 900 },
  });

  const letter =
    scenario === "empty"
      ? previewLetter({ openComments: [], latestVersion: 0 })
      : scenario === "readonly"
        ? previewLetter({ stage: "ACADEMIC_ROUND", stageLabel: "סבב אקדמי", canUpload: false, canSubmit: false })
        : previewLetter();

  const api = new MockApi({
    letter,
    uploadMs: 4000,
    failLookup: scenario === "error" ? "אין חיבור לשרת מכתבי הקבלה. בדקו את החיבור לרשת ונסו שוב." : undefined,
    failUpload: scenario === "fail" ? "קובץ ה-PDF לא תקין" : undefined,
  });

  return { word: wordDocument(), api, inWord: true, wordOnWeb: isWordOnWeb(), nestedAuth: supportsNestedAppAuth() };
}
