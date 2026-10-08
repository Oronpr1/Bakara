// What happens after every change to a letter: move it along by itself when a step is complete,
// note since when the current holder has had it, and tell the people whose turn it now is.
import { schema } from "@al/db";
import { flowView, type FlowView, type Phase } from "@al/domain";
import { eq } from "drizzle-orm";
import { audit, notify } from "../notify";
import { loadLetter, type LoadedLetter, type Tx } from "./state";

const { letterRequests } = schema;

const holderKey = (v: FlowView) => `${v.phase}|${v.holder.kind}|${[...v.holder.userIds].sort().join(",")}`;

/**
 * Re-reads the letter, applies automatic moves (everyone approved: next phase), and records a new
 * "holder since" when the holder changed from what it was `before`. Returns the final view.
 */
export async function afterChange(tx: Tx, letterId: string, before: FlowView, actorId: string | null): Promise<LoadedLetter & { view: FlowView }> {
  let loaded = await loadLetter(tx, letterId, { lock: true });
  let view = flowView(loaded.input);
  for (let i = 0; i < 4 && view.advanceTo; i++) {
    const to: Phase = view.advanceTo;
    await tx
      .update(letterRequests)
      .set({ phase: to, advisorHold: false, ...(to === "APPROVED" ? { approvedAt: new Date() } : {}) })
      .where(eq(letterRequests.id, letterId));
    await audit(tx, actorId, "PHASE_CHANGED", { letterId, seasonId: loaded.row.seasonId }, { from: view.phase, to });
    loaded = await loadLetter(tx, letterId, { lock: true });
    view = flowView(loaded.input);
  }
  if (holderKey(view) !== holderKey(before)) {
    await tx.update(letterRequests).set({ holderSince: new Date() }).where(eq(letterRequests.id, letterId));
    loaded = await loadLetter(tx, letterId, { lock: true });
    await tellNewHolders(tx, loaded, before, view, actorId);
  }
  return { ...loaded, view };
}

const advisorsOf = (l: LoadedLetter) => [l.input.people.advisorId, ...l.input.people.extraAdvisorIds].filter((id): id is string => Boolean(id));

async function tellNewHolders(tx: Tx, l: LoadedLetter, before: FlowView, after: FlowView, actorId: string | null) {
  const id = l.row.id;
  if (after.phase !== before.phase) {
    if (after.phase === "APPROVED") {
      await notify(tx, [...advisorsOf(l), ...l.input.people.controlIds], "APPROVED_FOR_DISTRIBUTION", id, actorId);
      return;
    }
    if (after.state === "READY_FOR_ACADEMIC") {
      await notify(tx, advisorsOf(l), "READY_FOR_ACADEMIC", id, actorId);
      return;
    }
  }
  // A new set of reviewers, a signer or an academic approver has the letter: it is their turn.
  if (after.holder.kind === "REVIEWERS" || after.holder.kind === "SIGNER") {
    await notify(tx, after.holder.userIds, "YOUR_TURN", id, actorId);
  }
}
