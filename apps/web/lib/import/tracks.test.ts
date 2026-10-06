import { describe, expect, it } from "vitest";
import { parseCsv, parseTrackRows } from "./tracks";

describe("track import parsing", () => {
  it("reads columns by their header, in any order", () => {
    const r = parseTrackRows([
      ["יועצת בקרה", "קמפוס", "פקולטה", "מספר מסלול", "שם מסלול"],
      ["dana@ono.ac.il", "קריית אונו", "משפטים", "101", "משפטים LLB"],
      ["", "", "", "", ""],
      ["  רות  כהן ", "ירושלים", "עיצוב", 202, "עיצוב פנים"],
    ]);
    expect(r).toEqual({
      rows: [
        { line: 2, trackName: "משפטים LLB", trackNumber: "101", faculty: "משפטים", campus: "קריית אונו", advisor: "dana@ono.ac.il" },
        { line: 4, trackName: "עיצוב פנים", trackNumber: "202", faculty: "עיצוב", campus: "ירושלים", advisor: "רות כהן" },
      ],
    });
  });

  it("names the missing columns", () => {
    expect(parseTrackRows([["שם מסלול", "פקולטה"], ["x", "y"]])).toEqual({
      error: "חסרות עמודות בשורת הכותרת: מספר מסלול, קמפוס, יועץ בקרה",
    });
    expect(parseTrackRows([])).toEqual({ error: "הקובץ ריק" });
  });

  it("reads CSV with quotes, a BOM and semicolons", () => {
    expect(parseCsv('﻿שם מסלול;מספר\r\n"א;ב";1\n"ג ""ד""";2')).toEqual([
      ["שם מסלול", "מספר"],
      ["א;ב", "1"],
      ['ג "ד"', "2"],
    ]);
  });
});
