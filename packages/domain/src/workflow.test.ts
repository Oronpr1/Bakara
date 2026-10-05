import { describe, expect, it } from "vitest";
import {
  autoAdvance,
  canOnLetter,
  changedSinceApproval,
  roundBlockers,
  transition,
  validateAnchor,
  validateStatusChange,
  WorkflowError,
  type Actor,
  type LetterState,
} from "./index.js";

const cm: Actor = { userId: "cm", roles: ["CONTROL_MANAGER"] };
const vp: Actor = { userId: "vp", roles: ["VP_REGISTRATION"] };
const advisor: Actor = { userId: "adv", roles: ["CONTROL_ADVISOR"] };
const otherAdvisor: Actor = { userId: "adv2", roles: ["CONTROL_ADVISOR"] };
const regMgr: Actor = { userId: "rm", roles: ["REGISTRATION_MANAGER"] };
const acad1: Actor = { userId: "ac1", roles: ["ACADEMIC_APPROVER"] };
const acad2: Actor = { userId: "ac2", roles: ["ACADEMIC_APPROVER"] };
const stranger: Actor = { userId: "x", roles: ["ACADEMIC_APPROVER"] };

const at = new Date("2026-10-05T10:00:00Z");

function letter(overrides: Partial<LetterState> = {}): LetterState {
  return {
    stage: "DRAFT",
    advisorId: "adv",
    approvers: [
      { userId: "rm", slot: "REGISTRATION_MANAGER" },
      { userId: "vp", slot: "VP_REGISTRATION" },
      { userId: "ac1", slot: "ACADEMIC" },
      { userId: "ac2", slot: "ACADEMIC" },
    ],
    approvals: [],
    comments: [],
    latestVersion: 1,
    ...overrides,
  };
}

describe("explicit transitions", () => {
  it("advisor submits a draft with a version to initial review", () => {
    expect(transition(letter(), "SUBMIT_FOR_REVIEW")).toBe("INITIAL_REVIEW");
  });

  it("cannot submit without a version", () => {
    expect(() => transition(letter({ latestVersion: 0 }), "SUBMIT_FOR_REVIEW")).toThrow(WorkflowError);
  });

  it("control manager's initial approval opens the registration round", () => {
    expect(transition(letter({ stage: "INITIAL_REVIEW" }), "INITIAL_APPROVE")).toBe("REGISTRATION_ROUND");
  });

  it("control manager can return a letter for changes", () => {
    expect(transition(letter({ stage: "INITIAL_REVIEW" }), "RETURN_FOR_CHANGES")).toBe("DRAFT");
  });

  it("final approval needs every comment closed", () => {
    const l = letter({ stage: "FINAL_REVIEW", comments: [{ id: "c1", authorId: "vp", status: "OPEN" }] });
    expect(() => transition(l, "FINAL_APPROVE")).toThrow(/open comments/);
    const closed = letter({ stage: "FINAL_REVIEW", comments: [{ id: "c1", authorId: "vp", status: "RESOLVED_FIXED" }] });
    expect(transition(closed, "FINAL_APPROVE")).toBe("APPROVED");
  });

  it("force advance needs a reason and never reaches final approval", () => {
    expect(() => transition(letter({ stage: "REGISTRATION_ROUND" }), "FORCE_ADVANCE")).toThrow(/reason/);
    expect(transition(letter({ stage: "REGISTRATION_ROUND" }), "FORCE_ADVANCE", { reason: "דחוף" })).toBe(
      "ACADEMIC_ROUND",
    );
    expect(() => transition(letter({ stage: "FINAL_REVIEW" }), "FORCE_ADVANCE", { reason: "x" })).toThrow();
  });

  it("an approved letter can be reopened to final review with a reason", () => {
    expect(transition(letter({ stage: "APPROVED" }), "REOPEN", { reason: "שינוי תאריכים" })).toBe("FINAL_REVIEW");
  });
});

describe("approval rounds", () => {
  it("registration round waits for both the registration manager and the VP", () => {
    const one = letter({
      stage: "REGISTRATION_ROUND",
      approvals: [{ userId: "rm", slot: "REGISTRATION_MANAGER", versionNumber: 1, at }],
    });
    expect(autoAdvance(one)).toBeNull();
    expect(roundBlockers(one)).toEqual([{ kind: "PENDING_APPROVAL", userId: "vp", slot: "VP_REGISTRATION" }]);
  });

  it("registration round finishes only when its comments are handled", () => {
    const both = letter({
      stage: "REGISTRATION_ROUND",
      approvals: [
        { userId: "rm", slot: "REGISTRATION_MANAGER", versionNumber: 1, at },
        { userId: "vp", slot: "VP_REGISTRATION", versionNumber: 1, at },
      ],
      comments: [{ id: "c1", authorId: "vp", status: "NEEDS_CLARIFICATION" }],
    });
    expect(autoAdvance(both)).toBeNull();
    expect(autoAdvance({ ...both, comments: [{ id: "c1", authorId: "vp", status: "RESOLVED_NO_CHANGE" }] })).toBe(
      "ACADEMIC_ROUND",
    );
  });

  it("every academic approver must approve", () => {
    const l = letter({
      stage: "ACADEMIC_ROUND",
      approvals: [{ userId: "ac1", slot: "ACADEMIC", versionNumber: 2, at }],
    });
    expect(autoAdvance(l)).toBeNull();
    expect(
      autoAdvance({ ...l, approvals: [...l.approvals, { userId: "ac2", slot: "ACADEMIC", versionNumber: 2, at }] }),
    ).toBe("FINAL_REVIEW");
  });

  it("a removed approver no longer blocks the round", () => {
    const l = letter({
      stage: "ACADEMIC_ROUND",
      approvers: [
        { userId: "ac1", slot: "ACADEMIC" },
        { userId: "ac2", slot: "ACADEMIC", removedAt: at },
      ],
      approvals: [{ userId: "ac1", slot: "ACADEMIC", versionNumber: 2, at }],
    });
    expect(autoAdvance(l)).toBe("FINAL_REVIEW");
  });

  it("an academic round with nobody left is skipped", () => {
    const l = letter({
      stage: "REGISTRATION_ROUND",
      approvers: [
        { userId: "rm", slot: "REGISTRATION_MANAGER" },
        { userId: "vp", slot: "VP_REGISTRATION" },
      ],
      approvals: [
        { userId: "rm", slot: "REGISTRATION_MANAGER", versionNumber: 1, at },
        { userId: "vp", slot: "VP_REGISTRATION", versionNumber: 1, at },
      ],
    });
    expect(autoAdvance(l)).toBe("FINAL_REVIEW");
  });

  it("approvals stay valid after a new version, flagged as changed", () => {
    const l = letter({
      stage: "ACADEMIC_ROUND",
      latestVersion: 3,
      approvals: [{ userId: "vp", slot: "VP_REGISTRATION", versionNumber: 2, at }],
    });
    expect(changedSinceApproval(l, "vp", "VP_REGISTRATION")).toBe(true);
    expect(canOnLetter(vp, "APPROVE", l)).toBe(false); // already approved, nothing to redo
  });
});

describe("permissions", () => {
  it("everyone on the letter can comment until final approval", () => {
    for (const a of [cm, vp, advisor, regMgr, acad1]) {
      expect(canOnLetter(a, "COMMENT", letter({ stage: "ACADEMIC_ROUND" }))).toBe(true);
      expect(canOnLetter(a, "COMMENT", letter({ stage: "APPROVED" }))).toBe(false);
    }
  });

  it("people outside the letter cannot see it", () => {
    expect(canOnLetter(stranger, "VIEW", letter())).toBe(false);
    expect(canOnLetter(otherAdvisor, "VIEW", letter())).toBe(false);
  });

  it("only the assigned advisor or the control manager close comments", () => {
    const l = letter({ stage: "REGISTRATION_ROUND" });
    expect(canOnLetter(advisor, "SET_COMMENT_STATUS", l)).toBe(true);
    expect(canOnLetter(cm, "SET_COMMENT_STATUS", l)).toBe(true);
    expect(canOnLetter(vp, "SET_COMMENT_STATUS", l)).toBe(false);
    expect(canOnLetter(regMgr, "SET_COMMENT_STATUS", l)).toBe(false);
    expect(canOnLetter(acad1, "SET_COMMENT_STATUS", l)).toBe(false);
    expect(canOnLetter(otherAdvisor, "SET_COMMENT_STATUS", l)).toBe(false);
  });

  it("academic approvers can approve only once their round starts", () => {
    expect(canOnLetter(acad1, "APPROVE", letter({ stage: "REGISTRATION_ROUND" }))).toBe(false);
    expect(canOnLetter(acad1, "APPROVE", letter({ stage: "ACADEMIC_ROUND" }))).toBe(true);
    expect(canOnLetter(regMgr, "APPROVE", letter({ stage: "REGISTRATION_ROUND" }))).toBe(true);
  });

  it("only the control manager gives initial and final approval", () => {
    expect(canOnLetter(cm, "INITIAL_APPROVE", letter({ stage: "INITIAL_REVIEW" }))).toBe(true);
    expect(canOnLetter(vp, "INITIAL_APPROVE", letter({ stage: "INITIAL_REVIEW" }))).toBe(false);
    expect(canOnLetter(cm, "FINAL_APPROVE", letter({ stage: "FINAL_REVIEW" }))).toBe(true);
    expect(canOnLetter(advisor, "FINAL_APPROVE", letter({ stage: "FINAL_REVIEW" }))).toBe(false);
  });

  it("the advisor picks the registration manager; VP or control manager can replace them later", () => {
    expect(canOnLetter(advisor, "SET_REGISTRATION_MANAGER", letter())).toBe(true);
    expect(canOnLetter(advisor, "SET_REGISTRATION_MANAGER", letter({ stage: "REGISTRATION_ROUND" }))).toBe(false);
    expect(canOnLetter(vp, "SET_REGISTRATION_MANAGER", letter({ stage: "REGISTRATION_ROUND" }))).toBe(true);
    expect(canOnLetter(cm, "SET_REGISTRATION_MANAGER", letter({ stage: "ACADEMIC_ROUND" }))).toBe(true);
  });

  it("control manager and VP can remove an approver", () => {
    expect(canOnLetter(cm, "REMOVE_APPROVER", letter({ stage: "ACADEMIC_ROUND" }))).toBe(true);
    expect(canOnLetter(vp, "REMOVE_APPROVER", letter({ stage: "ACADEMIC_ROUND" }))).toBe(true);
    expect(canOnLetter(advisor, "REMOVE_APPROVER", letter({ stage: "ACADEMIC_ROUND" }))).toBe(false);
  });

  it("nobody uploads versions after approval for distribution", () => {
    expect(canOnLetter(advisor, "UPLOAD_VERSION", letter({ stage: "ACADEMIC_ROUND" }))).toBe(true);
    expect(canOnLetter(advisor, "UPLOAD_VERSION", letter({ stage: "APPROVED" }))).toBe(false);
  });
});

describe("comments", () => {
  it("accepts an area inside the page", () => {
    expect(() =>
      validateAnchor({ versionNumber: 2, page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, 2, 2),
    ).not.toThrow();
  });

  it("rejects an area outside the page or on a missing version", () => {
    expect(() => validateAnchor({ versionNumber: 3, page: 1, x: 0, y: 0, width: 0.1, height: 0.1 }, 2, 2)).toThrow();
    expect(() => validateAnchor({ versionNumber: 1, page: 3, x: 0, y: 0, width: 0.1, height: 0.1 }, 2, 2)).toThrow();
    expect(() => validateAnchor({ versionNumber: 1, page: 1, x: 0.95, y: 0, width: 0.1, height: 0.1 }, 2, 2)).toThrow();
  });

  it("closing as fixed names the version that fixed it", () => {
    const opts = { commentVersion: 2, latestVersion: 3 };
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_FIXED" }, opts)).toThrow();
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_FIXED", fixedInVersion: 1 }, opts)).toThrow();
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_FIXED", fixedInVersion: 3 }, opts)).not.toThrow();
  });

  it("answering without a change needs an explanation", () => {
    const opts = { commentVersion: 1, latestVersion: 1 };
    expect(() => validateStatusChange("OPEN", { to: "RESOLVED_NO_CHANGE" }, opts)).toThrow();
    expect(() =>
      validateStatusChange("OPEN", { to: "RESOLVED_NO_CHANGE", note: "הימים תקינים" }, opts),
    ).not.toThrow();
  });

  it("a closed comment can only be reopened", () => {
    const opts = { commentVersion: 1, latestVersion: 1 };
    expect(() => validateStatusChange("RESOLVED_FIXED", { to: "NEEDS_CLARIFICATION", note: "?" }, opts)).toThrow();
    expect(() => validateStatusChange("RESOLVED_FIXED", { to: "OPEN" }, opts)).not.toThrow();
  });
});
