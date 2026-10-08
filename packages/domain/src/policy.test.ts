import { afterEach, describe, expect, it } from "vitest";
import { abilities, allowed, canGlobal, CAPABILITIES, DEFAULT_POLICY, flowView, getPolicy, setPolicy, type Actor, type FlowInput } from "./index";

const veronica: Actor = { userId: "ver", roles: ["CONTROL_MANAGER"] };
const yossi: Actor = { userId: "yossi", roles: ["VP_REGISTRATION"] };
const shaked: Actor = { userId: "shaked", roles: ["CONTROL_ADVISOR"] };
const admin: Actor = { userId: "admin", roles: ["ADMIN"] };

const letter = (over: Partial<FlowInput> = {}): FlowInput => ({
  phase: "ACADEMIC",
  latestVersion: 1,
  settings: { sequential: true, controlReview: false },
  people: { advisorId: "shaked", extraAdvisorIds: [], rmIds: ["oron"], commenterIds: [], vpIds: ["yossi"], controlIds: ["ver"] },
  academics: [],
  decisions: [],
  openComments: 0,
  advisorHold: false,
  inGilboa: false,
  ...over,
});

afterEach(() => setPolicy(null));

describe("the rules the control manager can change", () => {
  it("start as the process says", () => {
    expect(getPolicy()).toEqual(DEFAULT_POLICY);
    expect(allowed(veronica, "SKIP_ACADEMIC")).toBe(true);
    expect(allowed(yossi, "SKIP_ACADEMIC")).toBe(true);
    expect(allowed(shaked, "SKIP_ACADEMIC")).toBe(false);
    expect(canGlobal(veronica, "MANAGE_USERS")).toBe(true);
    expect(canGlobal(yossi, "MANAGE_USERS")).toBe(false);
  });

  it("changing a rule changes what people can do, in the same abilities the screens use", () => {
    expect(abilities(yossi, letter()).skipAcademic).toBe(true);
    setPolicy({ SKIP_ACADEMIC: ["CONTROL_MANAGER"] });
    expect(abilities(yossi, letter()).skipAcademic).toBe(false);
    expect(abilities(veronica, letter()).skipAcademic).toBe(true);
    setPolicy({ SKIP_ACADEMIC: ["CONTROL_MANAGER", "CONTROL_ADVISOR"] });
    expect(abilities(shaked, letter()).skipAcademic).toBe(true);
  });

  it("who may act in another person's place is a rule too", () => {
    const final = letter({ phase: "FINAL" });
    expect(abilities(veronica, final).decide).toEqual([{ seat: "FINAL", onBehalfOf: "yossi" }]);
    setPolicy({ ACT_FOR_OTHERS: [] });
    expect(abilities(veronica, final).decide).toEqual([]);
    expect(abilities(yossi, final).decide).toEqual([{ seat: "FINAL", onBehalfOf: null }]); // his own seat is never a rule
    expect(flowView(final).holder.userIds).toEqual(["yossi"]);
  });

  it("the system administrator can never be locked out of users and rules", () => {
    setPolicy({ MANAGE_USERS: ["VP_REGISTRATION"], MANAGE_RULES: ["VP_REGISTRATION"] });
    expect(canGlobal(admin, "MANAGE_USERS")).toBe(true);
    expect(canGlobal(admin, "MANAGE_RULES")).toBe(true);
    expect(canGlobal(veronica, "MANAGE_USERS")).toBe(false);
  });

  it("every capability has a Hebrew label and default roles", () => {
    for (const c of CAPABILITIES) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.defaults.length).toBeGreaterThan(0);
    }
  });
});
