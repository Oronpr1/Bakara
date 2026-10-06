"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { deleteDraftMarkAction, updateDraftAction } from "@/app/(app)/letters/[id]/actions";
import type { RoomComment } from "@/lib/letters/queries";
import type { DraftMark } from "./CommentsPanel";
import { toast } from "./Toast";
import type { DraftPatch, ReviewComment } from "./Viewer";

export const PENDING_ID = "__draft__";

/** The marks of one version as the viewer draws them (a note's number is its place in the list). */
export function reviewComments(comments: RoomComment[], numbers: Map<string, number>, versionNumber: number | undefined, pending: DraftMark | null): ReviewComment[] {
  const list: ReviewComment[] = comments
    .filter((c) => c.versionNumber === versionNumber)
    .map((c) => ({
      id: c.id,
      page: c.page,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      status: c.status,
      kind: c.kind,
      color: c.color,
      points: c.points ? c.points.map(([x, y]) => ({ x, y })) : null,
      label: c.body || undefined,
      number: numbers.get(c.id),
      draft: c.isDraft,
    }));
  // A mark just placed, waiting for its text: shown but not editable (cancel and place it again to move it).
  if (pending && pending.anchor.versionNumber === versionNumber)
    list.push({ ...pending.anchor, id: PENDING_ID, status: "OPEN", kind: pending.kind, color: pending.color, points: pending.points ?? null, label: "חדשה", number: "+" });
  return list;
}

/** Moving, recolouring and deleting my saved drafts straight on the page. */
export function useDraftMarks(letterId: string) {
  const router = useRouter();
  const done = useCallback(
    (r: { ok: true } | { error: string } | null) => {
      if (r && "error" in r) toast(r.error);
      router.refresh();
    },
    [router],
  );
  const onUpdateDraft = useCallback(
    (id: string, patch: DraftPatch) => {
      if (id === PENDING_ID) return;
      void updateDraftAction({ letterId, commentId: id, patch }).then(done);
    },
    [letterId, done],
  );
  const onDelete = useCallback(
    (id: string) => {
      if (id === PENDING_ID) return;
      void deleteDraftMarkAction({ letterId, commentId: id }).then(done);
    },
    [letterId, done],
  );
  return { onUpdateDraft, onDelete };
}
