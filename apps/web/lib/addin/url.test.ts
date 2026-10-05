import { describe, expect, it } from "vitest";
import { documentUrlKey, graphShareId, sameDocumentUrl } from "./url";

const stored =
  "https://college.sharepoint.com/sites/letters/Shared%20Documents/%D7%AA%D7%A9%D7%A4%22%D7%96/%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91/123%20-%20%D7%9E%D7%A9%D7%A4%D7%98%D7%99%D7%9D.docx";

describe("matching the open document to a letter's SharePoint URL", () => {
  it("matches Word's decoded URL to Graph's encoded webUrl", () => {
    const fromWord = 'https://college.sharepoint.com/sites/letters/Shared Documents/תשפ"ז/תל אביב/123 - משפטים.docx';
    expect(sameDocumentUrl(fromWord, stored)).toBe(true);
  });

  it("ignores query strings, fragments, host case, default port and trailing slashes", () => {
    expect(sameDocumentUrl(`${stored}?web=1`, stored)).toBe(true);
    expect(sameDocumentUrl(`${stored}#page=2`, stored)).toBe(true);
    expect(sameDocumentUrl(stored.replace("college.sharepoint.com", "College.SharePoint.com:443"), stored)).toBe(true);
    expect(sameDocumentUrl(`${stored}/`, stored)).toBe(true);
  });

  it("is case-insensitive in the path, like SharePoint", () => {
    expect(sameDocumentUrl(stored.replace("Shared%20Documents", "shared documents"), stored)).toBe(true);
  });

  it("treats NFC and NFD forms of the same name as equal", () => {
    const nfd = "https://x.sharepoint.com/sites/a/Cafe\u0301.docx";
    expect(sameDocumentUrl(nfd, "https://x.sharepoint.com/sites/a/Caf%C3%A9.docx")).toBe(true);
  });

  it("does not match a different file, folder or site", () => {
    expect(sameDocumentUrl(stored.replace("123", "124"), stored)).toBe(false);
    expect(sameDocumentUrl(stored.replace("/sites/letters/", "/sites/other/"), stored)).toBe(false);
    expect(sameDocumentUrl(stored.replace("college.sharepoint.com", "college-my.sharepoint.com"), stored)).toBe(false);
  });

  it("does not decode twice (an encoded % stays a %)", () => {
    expect(sameDocumentUrl("https://x.sharepoint.com/a%2520b.docx", "https://x.sharepoint.com/a b.docx")).toBe(false);
    expect(sameDocumentUrl("https://x.sharepoint.com/a%2520b.docx", "https://x.sharepoint.com/a%20b.docx".replace("%20", "%2520"))).toBe(true);
  });

  it("returns no key for local files and unsaved documents", () => {
    expect(documentUrlKey("C:\\Users\\advisor\\Documents\\123 - משפטים.docx")).toBeNull();
    expect(documentUrlKey("file:///C:/Users/advisor/Documents/x.docx")).toBeNull();
    expect(documentUrlKey("")).toBeNull();
    expect(documentUrlKey(null)).toBeNull();
    expect(documentUrlKey("Document1")).toBeNull();
  });

  it("keys Office viewer links by their document id only", () => {
    const a = "https://x.sharepoint.com/sites/a/_layouts/15/Doc.aspx?sourcedoc=%7BABC-123%7D&file=x.docx&action=default";
    const b = "https://x.sharepoint.com/sites/a/_layouts/15/Doc.aspx?sourcedoc={abc-123}&action=edit";
    expect(sameDocumentUrl(a, b)).toBe(true);
    expect(sameDocumentUrl(a, a.replace("ABC", "ABD"))).toBe(false);
    expect(documentUrlKey("https://x.sharepoint.com/sites/a/_layouts/15/Doc.aspx?file=x.docx")).toBeNull();
  });

  it("encodes URLs for Graph's /shares endpoint", () => {
    expect(graphShareId("https://x/y?a=b")).toBe("u!aHR0cHM6Ly94L3k_YT1i");
  });
});
