import type { TokenProvider } from "./auth";
import { ApiError, type Api, type LetterLookup, type UploadInput, type UploadResult } from "./types";

const NETWORK_ERROR = "אין חיבור לשרת מכתבי הקבלה. בדקו את החיבור לרשת ונסו שוב.";

async function errorFrom(res: Response): Promise<ApiError> {
  let message = "משהו השתבש. נסו שוב, ואם זה חוזר פנו למנהלת הבקרה.";
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // not JSON
  }
  return new ApiError(message, res.status);
}

/** The web app's /api/addin/* routes, called with a bearer token (no cookies). */
export class HttpApi implements Api {
  constructor(
    private baseUrl: string,
    private token: TokenProvider,
  ) {}

  private async get(path: string): Promise<Response> {
    const token = await this.token();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new ApiError(NETWORK_ERROR, 0);
    }
    return res;
  }

  async findLetter(documentUrl: string): Promise<LetterLookup | null> {
    const res = await this.get(`/api/addin/letter?url=${encodeURIComponent(documentUrl)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as LetterLookup;
  }

  async snapshot(commentId: string): Promise<string> {
    const res = await this.get(`/api/addin/comments/${encodeURIComponent(commentId)}/snapshot`);
    if (!res.ok) throw await errorFrom(res);
    return URL.createObjectURL(await res.blob());
  }

  /** XMLHttpRequest rather than fetch, for upload progress. */
  async upload(input: UploadInput, onProgress: (fraction: number) => void): Promise<UploadResult> {
    const token = await this.token();
    const form = new FormData();
    form.set("documentUrl", input.documentUrl);
    form.set("note", input.note);
    form.set("submit", String(input.submit));
    form.set("docx", new Blob([input.docx as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "letter.docx");
    form.set("pdf", new Blob([input.pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), "letter.pdf");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/api/addin/letters/${encodeURIComponent(input.letterId)}/versions`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.withCredentials = false;
      xhr.responseType = "text";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onerror = () => reject(new ApiError(NETWORK_ERROR, 0));
      xhr.onload = () => {
        let body: { error?: string } & Partial<UploadResult> = {};
        try {
          body = JSON.parse(xhr.responseText || "{}");
        } catch {
          // not JSON
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult);
        else reject(new ApiError(body.error ?? "השמירה נכשלה. נסו שוב.", xhr.status));
      };
      xhr.send(form);
    });
  }
}
