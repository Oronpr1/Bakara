import { describe, expect, it } from "vitest";
import {
  abilities,
  academicSeat,
  changedSince,
  decide,
  flowView,
  FlowError,
  reopen,
  resetApprovals,
  resubmit,
  retract,
  skipAcademic,
  submit,
  validateStatusChange,
  type Actor,
  type Decision,
  type FlowInput,
} from "./index";

const at = new Date("2026-10-07T08:00:00Z");
const D = (seat: Decision["seat"], kind: Decision["kind"], userId: string, v = 1, extra: Partial<Decision> = {}): Decision => ({
  seat,
  kind,
  userId,
  versionNumber: v,
  at,
  ...extra,
});
const veronica: Actor = { userId: "ver", roles: ["CONTROL_MANAGER"] };
const yossi: Actor = { userId: "yossi", roles: ["VP_REGISTRATION"] };
const oron: Actor = { userId: "oron", roles: ["REGISTRATION_MANAGER"] };
const shaked: Actor = { userId: "shaked", roles: ["CONTROL_ADVISOR"] };
const head: Actor = { userId: "head", roles: ["ACADEMIC_APPROVER"] };
const stranger: Actor = { userId: "x", roles: ["CONTROL_ADVISOR"] };

function letter(over: Partial<FlowInput> = {}): FlowInput {
  return {
    phase: "REVIEW",
    latestVersion: 1,
    settings: { sequential: true, controlReview: false },
    people: { advisorId: "shaked", extraAdvisorIds: [], rmIds: ["oron"], commenterIds: [], vpIds: ["yossi"], controlIds: ["ver"] },
    academics: [],
    decisions: [],
    openComments: 0,
    advisorHold: false,
    inGilboa: false,
    ...over,
  };
}

describe("who holds the letter", () => {
  it("a draft is the advisor's, and cannot be sent without a version", () => {
    const v = flowView(letter({ phase: "DRAFT", latestVersion: 0 }));
    expect(v.holder).toEqual({ kind: "ADVISOR", userIds: ["shaked"] });
    expect(v.state).toBe("PREPARING");
    expect(v.blockers).toEqual(["NO_VERSION"]);
    expect(() => submit(letter({ phase: "DRAFT", latestVersion: 0 }))).toThrow(/גרסה/);
    expect(submit(letter({ phase: "DRAFT" }))).toEqual({ toPhase: "REVIEW" });
  });

  it("in review the registration manager goes first, then the VP, one at a time", () => {
    const first = flowView(letter());
    expect(first.holder).toEqual({ kind: "REVIEWERS", userIds: ["oron"] });
    expect(first.seats.map((s) => [s.key, s.turn])).toEqual([["RM", "now"], ["VP", "later"]]);

    const second = flowView(letter({ decisions: [D("RM", "APPROVED", "oron")] }));
    expect(second.holder).toEqual({ kind: "REVIEWERS", userIds: ["yossi"] });
    expect(second.seats.map((s) => s.turn)).toEqual(["done", "now"]);
  });

  it("with the parallel setting both review at once", () => {
    const v = flowView(letter({ settings: { sequential: false, controlReview: false } }));
    expect(v.holder.userIds).toEqual(["oron", "yossi"]);
  });

  it("the control manager reviews first when the season says so", () => {
    const v = flowView(letter({ settings: { sequential: true, controlReview: true } }));
    expect(v.seats.map((s) => s.key)).toEqual(["CONTROL", "RM", "VP"]);
    expect(v.holder.userIds).toEqual(["ver"]);
  });

  it("when everybody approved the letter moves on to the academic step by itself", () => {
    const v = flowView(letter({ decisions: [D("RM", "APPROVED", "oron"), D("VP", "APPROVED", "yossi")] }));
    expect(v.advanceTo).toBe("ACADEMIC");
    expect(v.state).toBe("READY_FOR_ACADEMIC");
  });
});

describe("returning for changes", () => {
  it("a returned letter is the advisor's, and nobody decides until she answered every comment", () => {
    const input = letter({ decisions: [D("RM", "CHANGES", "oron")], openComments: 2 });
    const v = flowView(input);
    expect(v.state).toBe("FIXING");
    expect(v.holder).toEqual({ kind: "ADVISOR", userIds: ["shaked"] });
    expect(() => decide(input, { seat: "RM", kind: "APPROVED", userId: "oron" })).toThrow(/אצל היועצת/);
    expect(abilities(yossi, input).decide).toEqual([]);
    expect(abilities(shaked, input).resubmit).toBe(false); // comments still open
    expect(() => resubmit(input)).toThrow(/להגיב לכל ההערות/);
  });

  it("after the fixes the returning reviewer is asked again, and others keep their approval", () => {
    const fixed = letter({ decisions: [D("RM", "APPROVED", "oron"), D("VP", "CHANGES", "yossi", 1)], openComments: 0 });
    expect(abilities(shaked, fixed).resubmit).toBe(true);
    const r = resubmit(fixed);
    expect(r).toEqual({ clear: ["VP"], toPhase: null });
    const after = letter({ latestVersion: 2, decisions: [...fixed.decisions, D("VP", "CLEARED", "shaked", 2)] });
    const v = flowView(after);
    expect(v.state).toBe("IN_REVIEW");
    expect(v.holder.userIds).toEqual(["yossi"]);
    expect(v.seats[0]!.status).toBe("approved"); // the registration manager's approval stays
  });

  it('"approve with comments" keeps the approval, and the letter moves on without coming back', () => {
    const base = letter();
    const d = decide(base, { seat: "RM", kind: "APPROVED", userId: "oron", publishedComments: 2 });
    const input = letter({ decisions: [d], openComments: 2, advisorHold: true });
    expect(flowView(input).state).toBe("FIXING");
    // Every comment answered, but the advisor has not sent it yet: the VP does not see it.
    const answered = letter({ decisions: [d], openComments: 0, advisorHold: true });
    expect(flowView(answered).holder.userIds).toEqual(["shaked"]);
    expect(resubmit(answered)).toEqual({ clear: [], toPhase: null });
    const v = flowView(letter({ latestVersion: 2, decisions: [d] }));
    expect(v.holder.userIds).toEqual(["yossi"]); // straight to the VP
  });

  it("returning needs a reason or a comment", () => {
    expect(() => decide(letter(), { seat: "RM", kind: "CHANGES", userId: "oron" })).toThrow(/הערה/);
    expect(decide(letter(), { seat: "RM", kind: "CHANGES", userId: "oron", note: "הימים שגויים" }).kind).toBe("CHANGES");
    expect(decide(letter(), { seat: "RM", kind: "CHANGES", userId: "oron", publishedComments: 1 }).kind).toBe("CHANGES");
  });

  it("only the seat whose turn it is can decide", () => {
    expect(() => decide(letter(), { seat: "VP", kind: "APPROVED", userId: "yossi" })).toThrow(/לא תורך/);
    const d = decide(letter(), { seat: "RM", kind: "APPROVED", userId: "oron" });
    expect(d.versionNumber).toBe(1);
    expect(() => decide(letter({ decisions: [d] }), { seat: "RM", kind: "APPROVED", userId: "oron" })).toThrow(FlowError);
  });
});

describe("the academic step", () => {
  const acad = letter({ phase: "ACADEMIC", decisions: [D("RM", "APPROVED", "oron"), D("VP", "APPROVED", "yossi")] });

  it("waits for the advisor to send it; the advisor and others in the workspace may", () => {
    expect(flowView(acad).state).toBe("READY_FOR_ACADEMIC");
    expect(abilities(shaked, acad).sendToAcademic).toBe(true);
    expect(abilities(oron, acad).sendToAcademic).toBe(true);
    expect(abilities(head, acad).sendToAcademic).toBe(false);
    expect(abilities(stranger, acad).view).toBe(false);
  });

  it("is with the academic approver after sending; each invited one must approve", () => {
    const sent = letter({ phase: "ACADEMIC", academics: ["head", "head2"] });
    const v = flowView(sent);
    expect(v.state).toBe("WITH_ACADEMIC");
    expect(v.holder.userIds).toEqual(["head", "head2"]);
    const one = letter({ phase: "ACADEMIC", academics: ["head", "head2"], decisions: [D(academicSeat("head"), "APPROVED", "head")] });
    expect(flowView(one).holder.userIds).toEqual(["head2"]);
    const all = letter({
      phase: "ACADEMIC",
      academics: ["head", "head2"],
      decisions: [D(academicSeat("head"), "APPROVED", "head"), D(academicSeat("head2"), "APPROVED", "head2")],
    });
    expect(flowView(all).advanceTo).toBe("FINAL");
  });

  it("the academic approver decides only on their own seat", () => {
    const sent = letter({ phase: "ACADEMIC", academics: ["head"] });
    expect(abilities(head, sent).decide).toEqual([{ seat: "ACADEMIC:head", onBehalfOf: null }]);
    expect(abilities(shaked, sent).decide).toEqual([]);
    expect(abilities(head, sent).comment).toBe(true);
    expect(abilities(head, letter({ phase: "ACADEMIC", academics: ["other"] })).view).toBe(false);
  });

  it("after the academic asked for a fix, the default goes to final approval, not back to the academic", () => {
    const fixed = letter({ phase: "ACADEMIC", academics: ["head"], decisions: [D(academicSeat("head"), "CHANGES", "head")] });
    expect(resubmit(fixed)).toEqual({ clear: [], toPhase: "FINAL" });
    expect(resubmit(fixed, { resendToAcademic: true })).toEqual({ clear: [academicSeat("head")], toPhase: null });
  });

  it("the control manager or the VP may skip it", () => {
    expect(abilities(veronica, acad).skipAcademic).toBe(true);
    expect(abilities(yossi, acad).skipAcademic).toBe(true);
    expect(abilities(shaked, acad).skipAcademic).toBe(false);
    expect(skipAcademic(acad)).toEqual({ toPhase: "FINAL" });
    expect(() => skipAcademic(letter())).toThrow(/בשלב שלו/);
  });
});

describe("final approval", () => {
  const fin = letter({ phase: "FINAL" });

  it("belongs to the VP; the control manager signs in his place, on record", () => {
    expect(flowView(fin).holder).toEqual({ kind: "SIGNER", userIds: ["yossi"] });
    expect(abilities(yossi, fin).decide).toEqual([{ seat: "FINAL", onBehalfOf: null }]);
    expect(abilities(veronica, fin).decide).toEqual([{ seat: "FINAL", onBehalfOf: "yossi" }]);
    expect(abilities(veronica, fin).actsForOthers).toBe(true);
    expect(abilities(oron, fin).decide).toEqual([]);
  });

  it("cannot be signed while comments are open (the control manager may override)", () => {
    const open = letter({ phase: "FINAL", openComments: 1 });
    expect(flowView(open).state).toBe("FIXING");
    expect(abilities(yossi, open).decide).toEqual([]);
    expect(abilities(veronica, open).overrideOpenComments).toBe(true);
    expect(() => decide(open, { seat: "FINAL", kind: "APPROVED", userId: "yossi" })).toThrow();
  });

  it("an approved letter is the advisor's until she marks it as loaded into Gilboa", () => {
    const done = letter({ phase: "APPROVED", decisions: [D("FINAL", "APPROVED", "yossi")] });
    expect(flowView(done).state).toBe("LOADING");
    expect(abilities(shaked, done).markInGilboa).toBe(true);
    expect(flowView({ ...done, inGilboa: true }).state).toBe("APPROVED");
    expect(abilities(veronica, done).reopen).toBe(true);
    expect(abilities(oron, done).reopen).toBe(false);
    expect(reopen(done, "ver").toPhase).toBe("FINAL");
    expect(() => reopen(letter(), "ver")).toThrow();
  });
});

describe("people and edge cases", () => {
  it("a track with no registration manager, or no advisor, is stuck and cannot be sent", () => {
    const noManager = letter({ phase: "DRAFT", people: { ...letter().people, rmIds: [] } });
    expect(flowView(noManager).state).toBe("BLOCKED");
    expect(flowView(noManager).blockers).toContain("NO_REGISTRATION_MANAGER");
    expect(() => submit(noManager)).toThrow(/מנהל רישום/);
    const noAdvisor = letter({ phase: "DRAFT", people: { ...letter().people, advisorId: null } });
    expect(flowView(noAdvisor).state).toBe("BLOCKED");
    expect(flowView(noAdvisor).blockers).toContain("NO_ADVISOR");
    expect(flowView(noAdvisor).holder.userIds).toEqual([]);
    expect(() => submit(noAdvisor)).toThrow(/יועצת/);
  });

  it("a commenter attached to the track may look and comment, but holds no seat and approves nothing", () => {
    const withCommenter = letter({ phase: "REVIEW", people: { ...letter().people, commenterIds: ["dean"] } });
    const dean = { userId: "dean", roles: [] as never[] };
    const a = abilities(dean, withCommenter);
    expect(a.view).toBe(true);
    expect(a.comment).toBe(true);
    expect(a.reply).toBe(true);
    expect(a.decide).toEqual([]);
    expect(a.submit).toBe(false);
    expect(flowView(withCommenter).seats.flatMap((s) => s.holderIds)).not.toContain("dean");
    // Somebody who is not on the track still cannot see it.
    expect(abilities({ userId: "other", roles: [] as never[] }, withCommenter).view).toBe(false);
  });

  it("no VP in the system blocks sending", () => {
    expect(flowView(letter({ phase: "DRAFT", people: { ...letter().people, vpIds: [] } })).blockers).toContain("NO_VP");
  });

  it("an advisor who is also the registration manager is approved by submitting; the VP stays required", () => {
    const shuli = letter({ people: { advisorId: "shuli", extraAdvisorIds: [], rmIds: ["shuli"], commenterIds: [], vpIds: ["yossi"], controlIds: ["ver"] } });
    const v = flowView(shuli);
    expect(v.seats[0]).toMatchObject({ key: "RM", status: "approved", auto: true });
    expect(v.holder.userIds).toEqual(["yossi"]);
    expect(v.advanceTo).toBeNull();
  });

  it("the control manager can decide in the registration manager's place, on record", () => {
    expect(abilities(veronica, letter()).decide).toEqual([{ seat: "RM", onBehalfOf: "oron" }]);
    expect(abilities(oron, letter()).decide).toEqual([{ seat: "RM", onBehalfOf: null }]);
    expect(abilities(yossi, letter()).decide).toEqual([]); // not his turn yet
  });

  it("a new registration manager inherits a pending letter, and nobody else sees it", () => {
    const input = letter({ people: { ...letter().people, rmIds: ["newrm"] } });
    expect(flowView(input).holder.userIds).toEqual(["newrm"]);
    expect(abilities(oron, input).view).toBe(false);
    expect(abilities({ userId: "newrm", roles: ["REGISTRATION_MANAGER"] }, input).decide).toHaveLength(1);
  });

  it("a reviewer can take back their approval; the advisor's automatic approval cannot be retracted", () => {
    const input = letter({ decisions: [D("RM", "APPROVED", "oron")] });
    expect(abilities(oron, input).retract).toEqual(["RM"]);
    expect(abilities(yossi, input).retract).toEqual([]);
    expect(retract(input, "RM", "oron").kind).toBe("CLEARED");
    expect(() => retract(letter(), "RM", "oron")).toThrow();
  });

  it("an approval on an older version is flagged, not cancelled", () => {
    const v = flowView(letter({ latestVersion: 3, decisions: [D("RM", "APPROVED", "oron", 1)] }));
    expect(changedSince(v.seats[0]!, 3)).toBe(true);
    expect(v.seats[0]!.status).toBe("approved");
  });

  it('"everyone approves again" clears every decision and goes back to review', () => {
    const input = letter({ phase: "FINAL", decisions: [D("RM", "APPROVED", "oron"), D("VP", "APPROVED", "yossi")] });
    const r = resetApprovals(input, "ver");
    expect(r.toPhase).toBe("REVIEW");
    expect(r.clear.map((d) => d.seat).sort()).toEqual(["RM", "VP"]);
    expect(abilities(shaked, input).resetApprovals).toBe(false);
    expect(() => resetApprovals(letter({ phase: "DRAFT" }), "ver")).toThrow();
  });

  it("who may upload a version: the advisor when she holds the letter, the control manager always, nobody once approved", () => {
    expect(abilities(shaked, letter({ phase: "DRAFT", latestVersion: 0 })).uploadVersion).toBe(true);
    expect(abilities(shaked, letter()).uploadVersion).toBe(false); // the reviewers hold it
    expect(abilities(shaked, letter({ openComments: 1 })).uploadVersion).toBe(true); // fixing
    expect(abilities(veronica, letter()).uploadVersion).toBe(true);
    expect(abilities(veronica, letter({ phase: "APPROVED" })).uploadVersion).toBe(false);
    expect(abilities(oron, letter({ openComments: 1 })).uploadVersion).toBe(false);
  });

  it("extra people added to a track share it: another advisor fixes, another manager reviews", () => {
    const extra = letter({ people: { ...letter().people, extraAdvisorIds: ["limor"], rmIds: ["oron", "oshrat"] } });
    const limor: Actor = { userId: "limor", roles: ["CONTROL_ADVISOR"] };
    const oshrat: Actor = { userId: "oshrat", roles: ["REGISTRATION_MANAGER"] };
    expect(abilities(oshrat, extra).decide).toEqual([{ seat: "RM", onBehalfOf: null }]);
    expect(flowView(extra).holder.userIds).toEqual(["oron", "oshrat"]);
    const fixing = { ...extra, openComments: 1 };
    expect(flowView(fixing).holder.userIds).toEqual(["shaked", "limor"]);
    expect(abilities(limor, fixing).uploadVersion).toBe(true);
    expect(abilities(limor, fixing).handleComments).toBe(true);
    expect(abilities(limor, letter()).view).toBe(false);
  });

  it("the unit's manager does not see letters of other units", () => {
    expect(abilities(oron, letter({ people: { ...letter().people, rmIds: ["someoneElse"] } })).view).toBe(false);
  });
});

describe("comments", () => {
  it("the advisor answers: fixed, or not accepted with a reason; either can be reopened", () => {
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_FIXED" })).not.toThrow();
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_NO_CHANGE" })).toThrow(/להסביר/);
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_NO_CHANGE", note: "הימים נכונים" })).not.toThrow();
    expect(() => validateStatusChange("RESOLVED_FIXED", { to: "OPEN" })).not.toThrow();
    expect(() => validateStatusChange("RESOLVED_FIXED", { to: "RESOLVED_NO_CHANGE", note: "x" })).toThrow();
  });
});
