import { describe, expect, it } from "vitest";
import { contentDisposition, versionFilename } from "./http";

describe("contentDisposition", () => {
  it("keeps Hebrew names in the UTF-8 form and gives an ASCII fallback", () => {
    const name = versionFilename({ trackNumber: "101", trackName: 'משפטים (תשפ"ז)' }, 2, "docx");
    const header = contentDisposition(name);
    expect(header).toMatch(/^attachment; filename="101-[_ ()]+-v2\.docx"; filename\*=UTF-8''/);
    const encoded = header.split("UTF-8''")[1]!;
    expect(encoded).not.toMatch(/[()'"* ]/);
    expect(decodeURIComponent(encoded)).toBe("101-משפטים (תשפ״ז)-v2.docx");
    expect(contentDisposition('a"b/c.pdf')).toContain(`filename="a_b_c.pdf"`);
  });

  it("can ask the browser to show the file inline", () => {
    expect(contentDisposition("a.pdf", "inline")).toBe(`inline; filename="a.pdf"; filename*=UTF-8''a.pdf`);
  });
});
