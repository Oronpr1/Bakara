import type { TokenCredential } from "@azure/identity";
import { describe, expect, it, vi } from "vitest";
import { letterPath, safeName, SharePointDocumentHost, wordDesktopUrl } from "./documents";
import { GraphClient, GraphError } from "./graph";
import { GraphMailer } from "./mail";

const credential: TokenCredential = { getToken: async () => ({ token: "t", expiresOnTimestamp: Date.now() + 3600e3 }) };

function fakeFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responses.shift()!;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const item = {
  id: "item1",
  webUrl: "https://college.sharepoint.com/sites/letters/Shared%20Documents/x.docx",
  cTag: '"c:{1},2"',
  size: 1234,
  lastModifiedDateTime: "2026-10-05T10:00:00Z",
  lastModifiedBy: { user: { email: "advisor@college.ac.il" } },
  parentReference: { driveId: "drive1" },
};

describe("SharePoint names and links", () => {
  it("cleans characters SharePoint rejects", () => {
    expect(safeName('מנהל עסקים: "מימון" / ערב?')).toBe("מנהל עסקים- -מימון- - ערב-");
    expect(safeName("  .. ")).toBe("ללא שם");
  });

  it("builds the season / campus / track path, URL-encoded", () => {
    const p = letterPath({ seasonName: 'תשפ"ז א\'', campus: "קריית אונו", trackNumber: "101", trackName: "משפטים" });
    expect(decodeURIComponent(p)).toBe("תשפ-ז א'/קריית אונו/101 - משפטים.docx");
  });

  it("opens Word desktop for editing", () => {
    expect(wordDesktopUrl(item.webUrl)).toBe(`ms-word:ofe|u|${item.webUrl}`);
  });
});

describe("Graph client", () => {
  it("retries after throttling, honouring Retry-After", async () => {
    const { impl, calls } = fakeFetch([
      new Response("", { status: 429, headers: { "Retry-After": "3" } }),
      Response.json(item),
    ]);
    const sleep = vi.fn(async () => {});
    const g = new GraphClient(credential, impl, sleep);
    await g.json("GET", "/drives/d/items/i");
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(3000);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("surfaces Graph error codes", async () => {
    const { impl } = fakeFetch([Response.json({ error: { code: "nameAlreadyExists", message: "exists" } }, { status: 409 })]);
    const g = new GraphClient(credential, impl);
    await expect(g.json("GET", "/x")).rejects.toMatchObject({ status: 409, code: "nameAlreadyExists" });
    await expect(Promise.reject(new GraphError(1, "a", "b"))).rejects.toBeInstanceOf(GraphError);
  });
});

describe("SharePoint document host", () => {
  it("creates the working file without overwriting an existing one", async () => {
    const { impl, calls } = fakeFetch([Response.json(item, { status: 201 })]);
    const host = new SharePointDocumentHost(new GraphClient(credential, impl), "site1");
    const info = await host.createLetterFile(
      { seasonName: "s", campus: "c", trackNumber: "1", trackName: "t" },
      new Uint8Array([1, 2, 3]),
    );
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/sites/site1/drive/root:/s/c/1%20-%20t.docx:/content?@microsoft.graph.conflictBehavior=fail");
    expect(info).toMatchObject({ driveId: "drive1", itemId: "item1", lastModifiedBy: "advisor@college.ac.il" });
  });

  it("asks Graph for a PDF rendering of the live file", async () => {
    const { impl, calls } = fakeFetch([new Response(new Uint8Array([37, 80, 68, 70]))]);
    const host = new SharePointDocumentHost(new GraphClient(credential, impl), "site1");
    const pdf = await host.convertToPdf({ driveId: "d", itemId: "i" });
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/items/i/content?format=pdf");
    expect(pdf).toHaveLength(4);
  });
});

describe("Graph mailer", () => {
  it("sends from the shared mailbox without keeping a copy", async () => {
    const { impl, calls } = fakeFetch([new Response(null, { status: 202 })]);
    await new GraphMailer(new GraphClient(credential, impl), "letters@college.ac.il").send({
      to: "a@college.ac.il",
      subject: "s",
      text: "t",
      html: "<p>h</p>",
    });
    expect(calls[0]!.url).toContain("/users/letters%40college.ac.il/sendMail");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ saveToSentItems: false });
  });
});
