import { ApiError, type AddinLetter, type Api, type LetterLookup, type UploadInput, type UploadResult } from "../types";

export const PREVIEW_URL =
  'https://college.sharepoint.com/sites/letters/Shared Documents/תשפ"ז א/תל אביב/123 - משפטים.docx';

export function previewLetter(overrides: Partial<AddinLetter> = {}): AddinLetter {
  return {
    id: "8b0c7f36-1d8c-4a43-9b9a-3f1c2d4e5f60",
    trackName: "משפטים",
    trackNumber: "123",
    campus: "תל אביב",
    faculty: "הפקולטה למשפטים",
    seasonName: 'תשפ"ז א\'',
    stage: "DRAFT",
    stageLabel: "בהכנה",
    latestVersion: 3,
    canUpload: true,
    canSubmit: true,
    openComments: [
      {
        id: "c1",
        authorName: "רונית לוי",
        body: "תאריך תחילת שנת הלימודים צריך להיות 25.10, לא 20.10.",
        page: 1,
        versionNumber: 3,
        status: "OPEN",
        hasSnapshot: true,
        createdAt: "2026-10-01T09:12:00Z",
      },
      {
        id: "c2",
        authorName: "ד\"ר אבי כהן",
        body: "חסר המשפט על דרישת האנגלית לפטור (רמה מתקדמים ב').",
        page: 2,
        versionNumber: 3,
        status: "NEEDS_CLARIFICATION",
        hasSnapshot: true,
        createdAt: "2026-10-02T13:40:00Z",
      },
      {
        id: "c3",
        authorName: "מיכל ברק",
        body: "לעדכן את שם ראש החוג בחתימה.",
        page: 2,
        versionNumber: 2,
        status: "OPEN",
        hasSnapshot: false,
        createdAt: "2026-09-28T08:05:00Z",
      },
    ],
    ...overrides,
  };
}

const SNIPPETS: Record<string, string[]> = {
  c1: ["הלימודים יחלו ביום", "20.10.2026 בשעה 16:00", "בקמפוס תל אביב"],
  c2: ["תנאי קבלה:", "ציון פסיכומטרי 600 לפחות", "ואנגלית ברמת..."],
};

/** An image of "the marked area" for the preview: a few lines of letter text, one highlighted. */
function snapshotSvg(id: string): string {
  const lines = SNIPPETS[id] ?? ["…"];
  const text = lines
    .map(
      (l, i) =>
        `<text x="150" y="${24 + i * 22}" text-anchor="end" font-family="David, Times New Roman, serif" font-size="15" fill="#222">${l}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="84" viewBox="0 0 160 84"><rect width="160" height="84" fill="#fff"/><rect x="6" y="31" width="148" height="20" rx="2" fill="#fde68a" opacity=".7"/>${text}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MockApiOptions {
  letter: AddinLetter | null;
  userName?: string;
  /** Milliseconds the simulated upload takes. */
  uploadMs?: number;
  failLookup?: string;
  failUpload?: string;
}

/** The add-in API in memory: same contract as HttpApi, with slow, observable uploads. */
export class MockApi implements Api {
  uploads: UploadInput[] = [];
  constructor(private opts: MockApiOptions) {}

  async findLetter(documentUrl: string): Promise<LetterLookup | null> {
    await wait(250);
    if (this.opts.failLookup) throw new ApiError(this.opts.failLookup, 500);
    if (!this.opts.letter || documentUrl !== PREVIEW_URL) return null;
    return { letter: this.opts.letter, user: { name: this.opts.userName ?? "דנה יועצת" } };
  }

  async snapshot(commentId: string): Promise<string> {
    await wait(150);
    return snapshotSvg(commentId);
  }

  async upload(input: UploadInput, onProgress: (fraction: number) => void): Promise<UploadResult> {
    const letter = this.opts.letter!;
    const total = this.opts.uploadMs ?? 2500;
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      await wait(total / steps);
      onProgress(i / steps);
    }
    if (this.opts.failUpload) throw new ApiError(this.opts.failUpload, 400);
    this.uploads.push(input);
    const versionNumber = letter.latestVersion + 1;
    const submitted = input.submit;
    this.opts.letter = {
      ...letter,
      latestVersion: versionNumber,
      ...(submitted ? { stage: "INITIAL_REVIEW", stageLabel: "בדיקה ראשונית", canSubmit: false } : {}),
    };
    return {
      versionNumber,
      pageCount: 2,
      stage: this.opts.letter.stage,
      stageLabel: this.opts.letter.stageLabel,
      submitted,
    };
  }
}
