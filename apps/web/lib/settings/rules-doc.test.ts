// The rules table is documentation; these checks keep it honest against the core. A row says "no"
// for a role exactly when the core never lets that role do it, in any of the situations below.
import { abilities, canGlobal, DEFAULT_SETTINGS, type Abilities, type Actor, type FlowInput, type Phase, type Role } from "@al/domain";
import { describe, expect, it } from "vitest";
import { RULE_GROUPS, RULE_ROLES } from "./rules-doc";

const ID: Record<Role, string> = {
  ADMIN: "admin",
  CONTROL_MANAGER: "cm",
  VP_REGISTRATION: "vp",
  CONTROL_ADVISOR: "adv",
  REGISTRATION_MANAGER: "rm",
  ACADEMIC_APPROVER: "acad",
};
const actor = (role: Role): Actor => ({ userId: ID[role], roles: [role] });

function input(phase: Phase, extra: Partial<FlowInput> = {}): FlowInput {
  return {
    phase,
    latestVersion: 1,
    settings: { ...DEFAULT_SETTINGS, sequential: false },
    people: { advisorId: "adv", extraAdvisorIds: [], rmIds: ["rm"], onlyVp: false, vpIds: ["vp"], controlIds: ["cm"] },
    academics: phase === "ACADEMIC" ? ["acad"] : [],
    decisions: [],
    openComments: 0,
    advisorHold: false,
    inGilboa: false,
    ...extra,
  };
}

/** For each letter-level row: the situations to try, and the ability that answers it. */
const LETTER_ROWS: Record<string, { cases: FlowInput[]; can: (a: Abilities) => boolean }> = {
  comment: { cases: [input("REVIEW"), input("ACADEMIC"), input("FINAL")], can: (a) => a.comment },
  upload: { cases: [input("DRAFT"), input("REVIEW", { advisorHold: true })], can: (a) => a.uploadVersion },
  submit: { cases: [input("DRAFT")], can: (a) => a.submit },
  "handle-comments": { cases: [input("REVIEW")], can: (a) => a.handleComments },
  resubmit: { cases: [input("REVIEW", { advisorHold: true })], can: (a) => a.resubmit },
  decide: {
    cases: [input("REVIEW"), input("REVIEW", { settings: { sequential: false, controlReview: true } }), input("ACADEMIC")],
    can: (a) => a.decide.length > 0,
  },
  "send-academic": { cases: [input("ACADEMIC", { academics: [] })], can: (a) => a.sendToAcademic },
  "skip-academic": { cases: [input("ACADEMIC")], can: (a) => a.skipAcademic },
  final: { cases: [input("FINAL")], can: (a) => a.decide.some((d) => d.seat === "FINAL") },
  reset: { cases: [input("REVIEW")], can: (a) => a.resetApprovals },
  remind: { cases: [input("REVIEW")], can: (a) => a.remind },
  gilboa: { cases: [input("APPROVED")], can: (a) => a.markInGilboa },
  reopen: { cases: [input("APPROVED")], can: (a) => a.reopen },
  advisor: { cases: [input("DRAFT")], can: (a) => a.reassignAdvisor },
  retract: {
    cases: (["CONTROL", "RM", "VP"] as const).map((seat) =>
      input("REVIEW", {
        settings: { sequential: false, controlReview: true },
        decisions: [{ seat, kind: "APPROVED", userId: seat === "CONTROL" ? "cm" : seat === "RM" ? "rm" : "vp", versionNumber: 1, at: new Date() }],
      }),
    ).concat(
      input("ACADEMIC", { decisions: [{ seat: "ACADEMIC:acad", kind: "APPROVED", userId: "acad", versionNumber: 1, at: new Date() }] }),
    ),
    can: (a) => a.retract.length > 0,
  },
};

const rows = RULE_GROUPS.flatMap((g) => g.rows);

describe("rules table", () => {
  it("has a cell for every role in every row", () => {
    for (const r of rows) for (const { role } of RULE_ROLES) expect(r.cells[role], `${r.id} / ${role}`).toBeDefined();
  });

  it("matches the core for system-wide actions", () => {
    for (const r of rows.filter((x) => x.global))
      for (const { role } of RULE_ROLES)
        expect(r.cells[role].level === "yes", `${r.id} / ${role}`).toBe(canGlobal(actor(role), r.global!));
  });

  it("matches the core for actions on a letter", () => {
    for (const r of rows.filter((x) => !x.global)) {
      const check = LETTER_ROWS[r.id];
      expect(check, `no check for row ${r.id}`).toBeDefined();
      for (const { role } of RULE_ROLES) {
        const possible = check!.cases.some((c) => check!.can(abilities(actor(role), c)));
        expect(r.cells[role].level !== "no", `${r.id} / ${role}`).toBe(possible);
      }
    }
  });
});
