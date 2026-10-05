import type { TokenCredential } from "@azure/identity";
import { crc32 } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { documentsConfigured, getDocumentHost, graphConfigured, setDocumentHost } from "./config";
import { letterPath, safeName, SharePointDocumentHost, wordDesktopUrl } from "./documents";
import { GraphClient, GraphError } from "./graph";
import { GraphMailer } from "./mail";
import { emptyLetterDocx } from "./template";

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

describe("SharePoint working file: lookup and locking", () => {
  it("finds the file at the letter's path, or reports none", async () => {
    const { impl, calls } = fakeFetch([
      Response.json(item),
      Response.json({ error: { code: "itemNotFound", message: "x" } }, { status: 404 }),
    ]);
    const host = new SharePointDocumentHost(new GraphClient(credential, impl), "site1");
    const parts = { seasonName: "s", campus: "c", trackNumber: "1", trackName: "t" };
    expect(await host.findLetterFile(parts)).toMatchObject({ itemId: "item1", cTag: item.cTag });
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/sites/site1/drive/root:/s/c/1%20-%20t.docx");
    expect(await host.findLetterFile(parts)).toBeNull();
  });

  it("does not lock unless checkout locking is turned on", async () => {
    const { impl, calls } = fakeFetch([]);
    const host = new SharePointDocumentHost(new GraphClient(credential, impl), "site1", { lockApproved: false });
    expect(await host.setReadOnly({ driveId: "d", itemId: "i" }, true)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("locks by checking the file out to the app, and unlocks by checking it in", async () => {
    const { impl, calls } = fakeFetch([new Response(null, { status: 204 }), new Response(null, { status: 204 })]);
    const host = new SharePointDocumentHost(new GraphClient(credential, impl), "site1", { lockApproved: true });
    expect(await host.setReadOnly({ driveId: "d", itemId: "i" }, true)).toBe(true);
    expect(await host.setReadOnly({ driveId: "d", itemId: "i" }, false)).toBe(true);
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "POST https://graph.microsoft.com/v1.0/drives/d/items/i/checkout",
      "POST https://graph.microsoft.com/v1.0/drives/d/items/i/checkin",
    ]);
    expect(JSON.parse(calls[1]!.init.body as string)).toHaveProperty("comment");
  });

  it("lets a failed checkout surface (e.g. someone has the file open)", async () => {
    const { impl } = fakeFetch([Response.json({ error: { code: "resourceLocked", message: "locked" } }, { status: 423 })]);
    const host = new SharePointDocumentHost(new GraphClient(credential, impl), "site1", { lockApproved: true });
    await expect(host.setReadOnly({ driveId: "d", itemId: "i" }, true)).rejects.toMatchObject({ status: 423 });
  });
});

describe("empty letter template", () => {
  /** Reads a stored-entry ZIP back, checking each entry's CRC. */
  function unzip(bytes: Uint8Array): Map<string, string> {
    const b = Buffer.from(bytes);
    const out = new Map<string, string>();
    for (let at = 0; b.readUInt32LE(at) === 0x04034b50; ) {
      const size = b.readUInt32LE(at + 18);
      const nameLen = b.readUInt16LE(at + 26);
      const name = b.subarray(at + 30, at + 30 + nameLen).toString("utf8");
      const data = b.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
      expect(crc32(data)).toBe(b.readUInt32LE(at + 14));
      out.set(name, data.toString("utf8"));
      at += 30 + nameLen + size;
    }
    const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(b.readUInt16LE(end + 10)).toBe(out.size);
    return out;
  }

  it("is a minimal right-to-left Word document", () => {
    const docx = emptyLetterDocx();
    const parts = unzip(docx);
    expect([...parts.keys()]).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
    expect(parts.get("[Content_Types].xml")).toContain('PartName="/word/document.xml"');
    expect(parts.get("_rels/.rels")).toContain('Target="word/document.xml"');
    expect(parts.get("word/document.xml")).toContain("<w:bidi/>");
    // What uploadVersion checks to accept a DOCX.
    expect(Buffer.from(docx.subarray(0, 4096)).includes("[Content_Types].xml")).toBe(true);
  });
});

describe("Microsoft 365 configuration", () => {
  it("turns SharePoint features on only with Graph credentials and a site", () => {
    expect(graphConfigured({})).toBe(false);
    expect(graphConfigured({ M365_TENANT_ID: "t" })).toBe(false);
    expect(graphConfigured({ M365_TENANT_ID: "t", M365_CLIENT_ID: "c" })).toBe(true);
    expect(graphConfigured({ M365_USE_MANAGED_IDENTITY: "true" })).toBe(true);
    expect(documentsConfigured({ M365_USE_MANAGED_IDENTITY: "true" })).toBe(false);
    expect(documentsConfigured({ M365_USE_MANAGED_IDENTITY: "true", M365_SITE_ID: "s" })).toBe(true);
  });

  it("has no document host when nothing is configured", () => {
    setDocumentHost(undefined);
    expect(getDocumentHost()).toBeNull();
  });
});
