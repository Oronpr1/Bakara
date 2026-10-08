// The example file must be one the importer reads as is: same column names, every row back.
import { describe, expect, it } from "vitest";
import { SAMPLE_HEADER, SAMPLE_ROWS, sampleTracksXlsx } from "./sample";
import { readTrackFile } from "./service";
import { mapColumns } from "./tracks";

describe("example track file", () => {
  it("uses only column names the importer knows", () => {
    expect("missing" in mapColumns([...SAMPLE_HEADER])).toBe(false);
    expect(mapColumns([...SAMPLE_HEADER])).toEqual({ campus: 0, faculty: 1, trackName: 2, trackNumber: 3, advisor: 4, manager: 5 });
  });

  it("is read back by the importer without an error, row for row", async () => {
    const bytes = await sampleTracksXlsx();
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK"); // a real .xlsx (a ZIP)
    const rows = await readTrackFile("example.xlsx", bytes);
    expect(rows).toEqual(
      SAMPLE_ROWS.map(([campus, faculty, trackName, trackNumber, advisor, manager], i) => ({
        line: i + 2,
        campus,
        faculty,
        trackName,
        trackNumber,
        advisor,
        manager,
      })),
    );
    for (const r of rows) expect(r.trackNumber).toMatch(/^228\d+$/);
  });
});
