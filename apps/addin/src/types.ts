// Shapes returned by the web app's /api/addin/* routes (apps/web/lib/addin/letters.ts).

export type Stage = "DRAFT" | "INITIAL_REVIEW" | "REGISTRATION_ROUND" | "ACADEMIC_ROUND" | "FINAL_REVIEW" | "APPROVED";

export interface AddinComment {
  id: string;
  authorName: string;
  body: string;
  page: number;
  versionNumber: number;
  status: "OPEN" | "NEEDS_CLARIFICATION";
  hasSnapshot: boolean;
  createdAt: string;
}

export interface AddinLetter {
  id: string;
  trackName: string;
  trackNumber: string;
  campus: string;
  faculty: string;
  seasonName: string;
  stage: Stage;
  stageLabel: string;
  latestVersion: number;
  openComments: AddinComment[];
  canUpload: boolean;
  canSubmit: boolean;
}

export interface LetterLookup {
  letter: AddinLetter;
  user: { name: string };
}

export interface UploadResult {
  versionNumber: number;
  pageCount: number;
  stage: Stage;
  stageLabel: string;
  submitted: boolean;
  submitError?: string;
}

export interface UploadInput {
  letterId: string;
  documentUrl: string;
  docx: Uint8Array;
  pdf: Uint8Array;
  note: string;
  submit: boolean;
}

/** The API as the pane uses it; the real one talks HTTP, the preview one is in memory. */
export interface Api {
  /** null when the document is not a letter file the user may see. */
  findLetter(documentUrl: string): Promise<LetterLookup | null>;
  upload(input: UploadInput, onProgress: (fraction: number) => void): Promise<UploadResult>;
  /** An object URL for the comment's snapshot image. The caller revokes it. */
  snapshot(commentId: string): Promise<string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
