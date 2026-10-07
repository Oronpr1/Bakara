// The read side's pure parts: one letter as a list row (toSummary) and the control tower
// (buildTower). No database: the loaded letters are built by hand.
import type { Actor, Decision, FlowInput } from "@al/domain";
import { describe, expect, it } from "vitest";
import { buildTower, toSummary, type LetterSummary } from "./queries";
import type { LoadedLetter, LetterRow, SeasonRow } from "./state";

const DAY = 24 * 60 * 60 * 1000;
/** A moment n whole days ago, plus an hour so the count never sits on a day boundary. */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY - 60 * 60 * 1000);

const cm: Actor = { userId: "cm", roles: ["CONTROL_MANAGER"] };
const adv: Actor = { userId: "adv", roles: ["CONTROL_ADVISOR"] };
const rm: Actor = { userId: "rm", roles: ["REGISTRATION_MANAGER"] };
const names = new Map([
  ["adv", "שקד"],
  ["adv2", "לימור"],
  ["rm", "אורון"],
  ["vp", "יוסי"],
  ["vp2", "סגן"],
  ["cm", "ורוניקה"],
  ["head", "פרופ׳ לוי"],
]);

const season: SeasonRow = {
  id: "s1",
  name: 'תשפ"ז א\'',
  status: "ACTIVE",
  sourceSeasonId: null,
  reminderIntervalDays: 3,
  sequentialReview: true,
  controlReview: false,
  dueDate: null,
  createdBy: null,
  createdAt: new Date(),
};

let seq = 0;
function letter(
  o: {
    input?: Partial<FlowInput>;
    people?: Partial<FlowInput["people"]>;
    row?: Partial<LetterRow>;
    season?: Partial<SeasonRow>;
    held?: number;
  } = {},
): LoadedLetter {
  const id = `l${++seq}`;
  const input: FlowInput = {
    phase: "DRAFT",
    latestVersion: 1,
    settings: { sequential: true, controlReview: false },
    people: { advisorId: "adv", extraAdvisorIds: [], rmIds: ["rm"], commenterIds: [], vpIds: ["vp"], controlIds: ["cm"], ...o.people },
    academics: [],
    decisions: [],
    openComments: 0,
    advisorHold: false,
    inGilboa: false,
    ...o.input,
  };
  const row: LetterRow = {
    id,
    seasonId: season.id,
    campus: "קמפוס אונו",
    faculty: "מנהל עסקים",
    trackName: `מסלול ${seq}`,
    trackNumber: String(227113000 + seq),
    advisorId: input.people.advisorId,
    phase: input.phase,
    registrationManagerId: null,
    advisorHold: input.advisorHold,
    sourceLetterId: null,
    inGilboaAt: input.inGilboa ? new Date() : null,
    dueDate: null,
    latestVersion: input.latestVersion,
    sharepointDriveId: null,
    sharepointItemId: null,
    sharepointWebUrl: null,
    sharepointVersionCTag: null,
    holderSince: daysAgo(o.held ?? 0),
    approvedAt: null,
    createdBy: null,
    createdAt: new Date(),
    ...o.row,
  };
  return { row, season: { ...season, ...o.season }, input };
}

const approved = (seat: Decision["seat"], userId: string, versionNumber = 1): Decision => ({
  seat,
  kind: "APPROVED",
  userId,
  versionNumber,
  at: new Date(),
});

describe("one letter as a list row (toSummary)", () => {
  it("a draft is with its advisor: who, for how long, and what is missing", () => {
    const l = letter({ input: { latestVersion: 0 }, held: 4 });
    const s = toSummary(l, adv, names);
    expect(s).toMatchObject({
      id: l.row.id,
      phase: "DRAFT",
      state: "PREPARING",
      holderKind: "ADVISOR",
      holderIds: ["adv"],
      holderNames: ["שקד"],
      advisorName: "שקד",
      waitingDays: 4,
      blockers: ["NO_VERSION"],
      mine: true,
      latestVersion: 0,
      academicLinkProblem: null,
    });
    // The control manager sees the same letter, but it does not wait for her.
    expect(toSummary(l, cm, names).mine).toBe(false);
  });

  it("a track with nobody to review is blocked, in red, and still with the advisor", () => {
    const s = toSummary(letter({ people: { rmIds: [] } }), cm, names);
    expect(s.state).toBe("BLOCKED");
    expect(s.blockers).toEqual(["NO_REGISTRATION_MANAGER"]);
    expect(s.holderNames).toEqual(["שקד"]);
    // No advisor either: blocked for that too, and nobody holds it.
    const noAdvisor = toSummary(letter({ people: { advisorId: null } }), cm, names);
    expect(noAdvisor).toMatchObject({ state: "BLOCKED", advisorId: null, advisorName: "לא שויכה יועצת", holderNames: [] });
    expect(noAdvisor.blockers).toEqual(["NO_ADVISOR"]);
  });

  it("in review the registration manager holds it first, then the VP(s); people with no name show a dash", () => {
    const first = toSummary(letter({ input: { phase: "REVIEW" }, held: 2 }), rm, names);
    expect(first).toMatchObject({ state: "IN_REVIEW", holderKind: "REVIEWERS", holderNames: ["אורון"], mine: true, waitingDays: 2 });

    const second = toSummary(
      letter({ input: { phase: "REVIEW", decisions: [approved("RM", "rm")] }, people: { vpIds: ["vp", "ghost"] } }),
      rm,
      names,
    );
    expect(second.holderIds).toEqual(["vp", "ghost"]);
    expect(second.holderNames).toEqual(["יוסי", "—"]);
    expect(second.mine).toBe(false);
  });

  it("open comments put the letter back with the advisor, with the count", () => {
    const s = toSummary(letter({ input: { phase: "REVIEW", openComments: 3, advisorHold: true } }), adv, names);
    expect(s).toMatchObject({ state: "FIXING", holderKind: "ADVISOR", openComments: 3, mine: true });
  });

  it("flags an academic link that expired, or that nobody opened after 3 days", () => {
    const withHead = (held: number) =>
      letter({ input: { phase: "ACADEMIC", academics: ["head"] }, held });
    const l = withHead(5);
    const key = `${l.row.id}:head`;
    expect(toSummary(l, cm, names).state).toBe("WITH_ACADEMIC");
    expect(toSummary(l, cm, names).holderNames).toEqual(["פרופ׳ לוי"]);
    expect(toSummary(l, cm, names, new Map([[key, { expired: true, opened: true }]])).academicLinkProblem).toBe("expired");
    expect(toSummary(l, cm, names, new Map()).academicLinkProblem).toBe("expired"); // no live link at all
    expect(toSummary(l, cm, names, new Map([[key, { expired: false, opened: false }]])).academicLinkProblem).toBe("unopened");
    expect(toSummary(l, cm, names, new Map([[key, { expired: false, opened: true }]])).academicLinkProblem).toBeNull();
    // Unopened for only a day is not a problem yet.
    const fresh = withHead(1);
    expect(toSummary(fresh, cm, names, new Map([[`${fresh.row.id}:head`, { expired: false, opened: false }]])).academicLinkProblem).toBeNull();
    // Not waiting for the academic approver: no link problem whatever the link is.
    const ready = letter({ input: { phase: "ACADEMIC" } });
    expect(toSummary(ready, cm, names).state).toBe("READY_FOR_ACADEMIC");
    expect(toSummary(ready, cm, names).academicLinkProblem).toBeNull();
  });

  it("approved: waits for the advisor to load it into Gilboa; once loaded nobody holds it", () => {
    const loading = toSummary(letter({ input: { phase: "APPROVED", decisions: [approved("FINAL", "vp")] }, held: 6 }), adv, names);
    expect(loading).toMatchObject({ state: "LOADING", holderKind: "ADVISOR", waitingDays: 6, inGilboa: false, mine: true });
    const done = toSummary(letter({ input: { phase: "APPROVED", inGilboa: true }, held: 6 }), adv, names);
    expect(done).toMatchObject({ state: "APPROVED", holderKind: "NONE", holderIds: [], waitingDays: null, inGilboa: true, mine: false });
  });

  it("is overdue when the due date (the letter's, else the season's) passed and the letter is not approved", () => {
    const past = "2000-01-01";
    const future = "2999-01-01";
    expect(toSummary(letter({ row: { dueDate: past } }), cm, names)).toMatchObject({ dueDate: past, overdue: true });
    expect(toSummary(letter({ season: { dueDate: past } }), cm, names)).toMatchObject({ dueDate: past, overdue: true });
    expect(toSummary(letter({ row: { dueDate: future }, season: { dueDate: past } }), cm, names)).toMatchObject({ dueDate: future, overdue: false });
    expect(toSummary(letter({ input: { phase: "APPROVED" }, row: { dueDate: past } }), cm, names).overdue).toBe(false);
    expect(toSummary(letter(), cm, names)).toMatchObject({ dueDate: null, overdue: false });
  });
});

describe("the control tower (buildTower)", () => {
  // A small season: every phase, a few people, waits of different lengths.
  const items: LetterSummary[] = [
    letter({ input: { latestVersion: 0 }, held: 10 }), // not started (שקד)
    letter({ input: { latestVersion: 0 }, held: 1 }), // not started (שקד)
    letter({ input: { latestVersion: 0 }, people: { advisorId: "adv2" }, held: 2 }), // not started (לימור)
    letter({ input: { latestVersion: 2 }, people: { advisorId: "adv2" }, held: 3 }), // started, still preparing
    letter({ people: { rmIds: [] }, held: 7 }), // blocked: no registration manager
    letter({ input: { phase: "REVIEW" }, held: 4 }), // with the manager
    letter({ input: { phase: "REVIEW" }, held: 9 }), // with the manager, longer
    letter({ input: { phase: "REVIEW", decisions: [approved("RM", "rm")] }, people: { vpIds: ["vp", "vp2"] }, held: 5 }), // with both VPs
    letter({ input: { phase: "REVIEW", openComments: 2 }, held: 1 }), // fixing (שקד)
    letter({ input: { phase: "ACADEMIC", academics: ["head"] }, held: 6 }), // with the academic approver
    letter({ input: { phase: "FINAL" }, held: 2, row: { dueDate: "2000-01-01" } }), // with the VP to sign, overdue
    letter({ input: { phase: "APPROVED" }, held: 3 }), // approved, not yet in Gilboa (שקד)
    letter({ input: { phase: "APPROVED", inGilboa: true }, held: 20 }), // done: nobody holds it
  ].map((l) => toSummary(l, cm, names));

  const tower = buildTower(items);

  it("counts the letters by phase, approved and loaded into Gilboa", () => {
    expect(tower.total).toBe(13);
    expect(tower.byPhase).toEqual({ DRAFT: 5, REVIEW: 4, ACADEMIC: 1, FINAL: 1, APPROVED: 2 });
    expect(tower.approved).toBe(2);
    expect(tower.inGilboa).toBe(1);
    expect(tower.overdue).toBe(1);
  });

  it("lists who holds how many letters and the longest wait, longest first", () => {
    const line = (name: string) => tower.holders.find((h) => h.name === name);
    expect(tower.holders.map((h) => h.name)).toEqual(["שקד", "אורון", "פרופ׳ לוי", "יוסי", "סגן", "לימור"]);
    // שקד: 2 not started + blocked + fixing + approved-not-loaded; the finished letter is nobody's.
    expect(line("שקד")).toMatchObject({ userId: "adv", kind: "ADVISOR", count: 5, oldestDays: 10 });
    expect(line("אורון")).toMatchObject({ kind: "REVIEWERS", count: 2, oldestDays: 9 });
    expect(line("אורון")!.letterIds).toEqual([items[5]!.id, items[6]!.id]);
    // A letter waiting for two VPs is on both lines.
    expect(line("יוסי")).toMatchObject({ count: 2, oldestDays: 5 }); // the review and the final signature
    expect(line("סגן")).toMatchObject({ count: 1, oldestDays: 5, letterIds: [items[7]!.id] });
    expect(line("פרופ׳ לוי")).toMatchObject({ kind: "ACADEMIC", count: 1, oldestDays: 6 });
    expect(line("לימור")).toMatchObject({ count: 2, oldestDays: 3 });
    expect(line("ורוניקה")).toBeUndefined();
  });

  it("names the advisors who did not start (a draft with no version yet), most first", () => {
    expect(tower.notStarted).toEqual([
      { advisorId: "adv", name: "שקד", count: 2 },
      { advisorId: "adv2", name: "לימור", count: 1 },
    ]);
  });

  it("lists the blocked letters and the academic link problems", () => {
    expect(tower.blocked.map((l) => l.id)).toEqual([items[4]!.id]);
    expect(tower.academicLinkProblems.map((l) => l.id)).toEqual([items[9]!.id]); // no link given to toSummary
  });

  it("an empty season is all zeros", () => {
    expect(buildTower([])).toEqual({
      total: 0,
      byPhase: { DRAFT: 0, REVIEW: 0, ACADEMIC: 0, FINAL: 0, APPROVED: 0 },
      approved: 0,
      inGilboa: 0,
      holders: [],
      notStarted: [],
      blocked: [],
      overdue: 0,
      academicLinkProblems: [],
    });
  });
});
