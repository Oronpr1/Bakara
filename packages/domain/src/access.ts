// Who may do what, for one letter. Everything is computed from the same plain input the flow uses,
// so the server enforces exactly what the screens show. The control manager (ורוניקה) can act in
// anyone's place; such actions record "on behalf of".
import { flowView, seatsOf, type FlowInput, type FlowView, type Phase, type SeatKey } from "./flow";
import { allowed } from "./policy";
import type { Actor } from "./types";

/** Actions that do not belong to a single letter. */
export type GlobalAction =
  | "MANAGE_USERS"
  | "MANAGE_SEASONS" // פתיחת עונה, הגדרות עונה, תזכורות
  | "MANAGE_UNITS" // מנהל רישום ויועצת לקמפוס ולפקולטה, ייבוא מסלולים, שיוכים
  | "CREATE_LETTER_REQUEST"
  | "VIEW_ALL_LETTERS" // מגדל הפיקוח המלא
  | "MANAGE_RULES"; // מסך הכללים

export function canGlobal(actor: Actor, action: GlobalAction): boolean {
  switch (action) {
    case "VIEW_ALL_LETTERS":
      return allowed(actor, "VIEW_ALL");
    default:
      return allowed(actor, action);
  }
}

/** A seat the actor may decide on now, and for whom they would be acting when it is not themselves. */
export interface DecidableSeat {
  seat: SeatKey;
  onBehalfOf: string | null;
}

export interface Abilities {
  view: boolean;
  comment: boolean;
  /** Mark a comment as fixed / not accepted, and reply as the advisor. */
  handleComments: boolean;
  uploadVersion: boolean;
  submit: boolean;
  resubmit: boolean;
  /** Seats the actor may approve or return right now. */
  decide: DecidableSeat[];
  /** Seats where the actor may take back their own approval. */
  retract: SeatKey[];
  sendToAcademic: boolean;
  skipAcademic: boolean;
  resetApprovals: boolean;
  reopen: boolean;
  markInGilboa: boolean;
  reassignAdvisor: boolean;
  remind: boolean;
  /** Sign off although comments are still open. */
  overrideOpenComments: boolean;
  /** The acting person is the control manager standing in for someone. */
  actsForOthers: boolean;
  /** The flow view, so a screen does not compute it twice. */
  flow: FlowView;
}

export function abilities(actor: Actor, input: FlowInput): Abilities {
  const { people, phase } = input;
  const view = flowView(input);
  // What the control manager's rules (the policy) decide, by capability and not by role name.
  const actsFor = allowed(actor, "ACT_FOR_OTHERS");
  const vp = people.vpIds.includes(actor.userId);
  const advisor = actor.userId === people.advisorId || people.extraAdvisorIds.includes(actor.userId);
  const rm = people.rmIds.includes(actor.userId);
  const academic = input.academics.includes(actor.userId);
  const inWorkspace = advisor || rm || actsFor || vp;
  const seeAll = allowed(actor, "VIEW_ALL");

  const canSee = seeAll || advisor || rm || academic;
  const commentPhase: Phase[] = ["REVIEW", "ACADEMIC", "FINAL"];
  // The advisor holds the letter in DRAFT and while fixing; the control manager can always upload.
  const advisorTurn = advisor && (phase === "DRAFT" || view.holder.kind === "ADVISOR") && phase !== "APPROVED";
  const uploadVersion = canSee && phase !== "APPROVED" && (advisorTurn || actsFor);

  const decide: DecidableSeat[] = [];
  if (canSee && !view.fixing) {
    for (const seat of view.seats) {
      if (seat.turn !== "now") continue;
      if (seat.role === "ACADEMIC") {
        if (seat.holderIds.includes(actor.userId)) decide.push({ seat: seat.key, onBehalfOf: null });
      } else if (seat.holderIds.includes(actor.userId)) {
        decide.push({ seat: seat.key, onBehalfOf: null });
      } else if (actsFor) {
        decide.push({ seat: seat.key, onBehalfOf: seat.holderIds[0] ?? null });
      }
    }
  }

  const retract: SeatKey[] = canSee
    ? seatsOf(input)
        .filter((s) => s.status === "approved" && !s.auto && s.decision && s.decision.userId === actor.userId)
        .map((s) => s.key)
    : [];

  return {
    view: canSee,
    comment: canSee && commentPhase.includes(phase),
    handleComments: canSee && (advisor || actsFor) && phase !== "APPROVED",
    uploadVersion,
    submit: canSee && phase === "DRAFT" && (advisor || actsFor) && view.blockers.length === 0,
    resubmit: canSee && view.fixing && input.openComments === 0 && (advisor || actsFor),
    decide,
    retract,
    sendToAcademic: canSee && phase === "ACADEMIC" && inWorkspace,
    skipAcademic: canSee && phase === "ACADEMIC" && allowed(actor, "SKIP_ACADEMIC"),
    resetApprovals: canSee && commentPhase.includes(phase) && allowed(actor, "RESET_APPROVALS"),
    reopen: canSee && phase === "APPROVED" && allowed(actor, "REOPEN"),
    markInGilboa: canSee && phase === "APPROVED" && !input.inGilboa && (advisor || actsFor),
    reassignAdvisor: canSee && allowed(actor, "REASSIGN_ADVISOR"),
    remind: canSee && allowed(actor, "REMIND") && phase !== "APPROVED" && phase !== "DRAFT",
    overrideOpenComments: canSee && allowed(actor, "OVERRIDE_OPEN_COMMENTS"),
    actsForOthers: actsFor && !advisor,
    flow: view,
  };
}
