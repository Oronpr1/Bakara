import { describe, expect, it } from "vitest";
import { cell, lettersCsv } from "./csv";
import { applyFilters, defaultGroup, filterQuery, type HomeLetter, inGroup, matchesSearch, parseFilters, personaOf, personalGroups, sortItems } from "./model";

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function letter(over: Partial<HomeLetter> = {}): HomeLetter {
  return {
    id: crypto.randomUUID(),
    seasonId: "s",
    campus: "קמפוס אונו",
    faculty: "מנהל עסקים",
    trackName: 'נדל"ן BA בוקר',
    trackNumber: "227113012",
    advisorId: ME,
    advisorName: "שקד",
    phase: "DRAFT",
    state: "PREPARING",
    holderKind: "ADVISOR",
    holderIds: [ME],
    holderNames: ["שקד"],
    waitingDays: 0,
    openComments: 0,
    latestVersion: 0,
    dueDate: null,
    overdue: false,
    inGilboa: false,
    blockers: [],
    mine: true,
    academicLinkProblem: null,
    rmIds: [OTHER],
    rmNames: ["אורון"],
    advisorIds: [ME],
    canRemind: false,
    canFinal: false,
    finalOnBehalfOf: null,
    myDrafts: 0,
    ...over,
  };
}

describe("search", () => {
  it("finds Hebrew names however the quote marks are written", () => {
    const l = letter();
    for (const q of ["נדלן", 'נדל"ן', "נדל״ן", "נדל'ן", "  נדלן   בוקר ", "227113", "ba"]) expect(matchesSearch(l, q)).toBe(true);
    expect(matchesSearch(l, "נדלן ערב")).toBe(false);
  });
});

describe("groups", () => {
  it("splits an advisor's letters into to-do, with others, and approved", () => {
    const todo = letter({ state: "FIXING", phase: "REVIEW" });
    const others = letter({ state: "IN_REVIEW", phase: "REVIEW", holderKind: "REVIEWERS", holderIds: [OTHER], mine: false });
    const done = letter({ state: "APPROVED", phase: "APPROVED", holderKind: "NONE", holderIds: [], mine: false, waitingDays: null });
    expect([todo, others, done].map((l) => (["todo", "others", "done"] as const).filter((g) => inGroup(l, g, ME)))).toEqual([["todo"], ["others"], ["done"]]);
  });

  it("opens each person on what waits for them", () => {
    const advisor = personaOf(["CONTROL_ADVISOR"], ME, []);
    const vp = personaOf(["VP_REGISTRATION"], ME, []);
    const both = personaOf(["CONTROL_ADVISOR", "REGISTRATION_MANAGER"], ME, []);
    const control = personaOf(["CONTROL_MANAGER"], ME, []);
    expect(defaultGroup(advisor)).toBe("todo");
    expect(defaultGroup(vp)).toBe("mine");
    expect(defaultGroup(both)).toBe("mine");
    expect(defaultGroup(control)).toBe("all");
    expect(personalGroups(both)).toEqual(["todo", "review", "others", "done"]);
    expect(personalGroups(vp)).toEqual(["review", "final"]);
  });
});

describe("filters in the address", () => {
  it("ignores what it does not know, and writes back only what is set", () => {
    const f = parseFilters({ g: "nonsense", sort: "x", campus: " קמפוס אונו ", advisor: "not-a-uuid", q: ["MBA", "x"] });
    expect(f).toMatchObject({ g: undefined, sort: undefined, campus: "קמפוס אונו", advisor: undefined, q: "MBA" });
    expect(filterQuery(f, { g: "REVIEW" })).toBe(`?g=REVIEW&campus=${encodeURIComponent("קמפוס אונו").replace(/%20/g, "+")}&q=MBA`);
  });

  it("filters by registration manager and holder", () => {
    const a = letter({ rmIds: [OTHER] });
    const b = letter({ rmIds: [], holderIds: [OTHER] });
    expect(applyFilters([a, b], { rm: OTHER }, ME, "all")).toEqual([a]);
    expect(applyFilters([a, b], { holder: OTHER }, ME, "all")).toEqual([b]);
  });
});

describe("order", () => {
  it("puts the longest wait first, then what someone must act on", () => {
    const a = letter({ trackName: "א", waitingDays: 1, state: "PREPARING" });
    const b = letter({ trackName: "ב", waitingDays: 6, state: "IN_REVIEW" });
    const c = letter({ trackName: "ג", waitingDays: 1, state: "FIXING" });
    const d = letter({ trackName: "ד", waitingDays: null, state: "APPROVED" });
    expect(sortItems([a, b, c, d]).map((l) => l.trackName)).toEqual(["ב", "ג", "א", "ד"]);
    expect(sortItems([d, c, b, a], "track").map((l) => l.trackName)).toEqual(["א", "ב", "ג", "ד"]);
  });
});

describe("csv", () => {
  it("quotes, and never lets a cell run as a formula", () => {
    expect(cell('נדל"ן, בוקר')).toBe('"נדל""ן, בוקר"');
    expect(cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(cell(-3)).toBe("-3");
    const csv = lettersCsv([letter()]);
    expect(csv.startsWith("﻿מסלול,קוד מסלול")).toBe(true);
    expect(csv.split("\r\n")[1]).toContain('"נדל""ן BA בוקר",227113012');
  });
});
