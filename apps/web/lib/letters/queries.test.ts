import type { Actor, LetterState } from "@al/domain";
import { describe, expect, it } from "vitest";
import { isOverdue, queueReason, waitingOn } from "./queries";

const cm: Actor = { userId: "cm", roles: ["CONTROL_MANAGER"] };
const adv: Actor = { userId: "adv", roles: ["CONTROL_ADVISOR"] };
const rm: Actor = { userId: "rm", roles: ["REGISTRATION_MANAGER"] };
const ac: Actor = { userId: "ac", roles: ["ACADEMIC_APPROVER"] };
const names = new Map([
  ["adv", "דנה"],
  ["rm", "רון"],
  ["vp", "ורד"],
]);

const letter = (o: Partial<LetterState> = {}): LetterState => ({
  stage: "DRAFT",
  advisorId: "adv",
  latestVersion: 1,
  approvers: [
    { userId: "rm", slot: "REGISTRATION_MANAGER" },
    { userId: "vp", slot: "VP_REGISTRATION" },
    { userId: "ac", slot: "ACADEMIC" },
  ],
  approvals: [],
  comments: [],
  ...o,
});

describe("work queue", () => {
  it("puts each letter in front of whoever has to act on it", () => {
    expect(queueReason(adv, letter())).toBe("DRAFT");
    expect(queueReason(cm, letter())).toBeNull();
    expect(queueReason(cm, letter({ stage: "INITIAL_REVIEW" }))).toBe("INITIAL_REVIEW");
    expect(queueReason(rm, letter({ stage: "REGISTRATION_ROUND" }))).toBe("APPROVE");
    expect(queueReason(ac, letter({ stage: "REGISTRATION_ROUND" }))).toBeNull();
    expect(queueReason(cm, letter({ stage: "FINAL_REVIEW" }))).toBe("FINAL_REVIEW");
    const commented = letter({ stage: "ACADEMIC_ROUND", comments: [{ id: "c", authorId: "ac", status: "OPEN" }] });
    expect(queueReason(adv, commented)).toBe("OPEN_COMMENTS");
    expect(queueReason(adv, letter({ stage: "ACADEMIC_ROUND" }))).toBeNull();
  });

  it("names who the letter waits on", () => {
    expect(waitingOn(letter(), names)).toBe("דנה");
    expect(waitingOn(letter({ stage: "REGISTRATION_ROUND" }), names)).toBe("רון, ורד");
    expect(waitingOn(letter({ stage: "FINAL_REVIEW" }), names)).toBe("מנהלת הבקרה");
  });

  it("flags a due date in the past until the letter is approved", () => {
    const today = new Date("2026-10-05T09:00:00Z");
    expect(isOverdue({ dueDate: "2026-10-04", stage: "DRAFT" }, today)).toBe(true);
    expect(isOverdue({ dueDate: "2026-10-05", stage: "DRAFT" }, today)).toBe(false);
    expect(isOverdue({ dueDate: "2026-10-04", stage: "APPROVED" }, today)).toBe(false);
  });
});
