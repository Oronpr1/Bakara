"use client";

// A thin wrapper around @al/pdf-review's workspace viewer (tools: note, X, line; colours; draft
// editing; the zoom bar), so the room does not depend on its details.
import {
  configurePdfWorker,
  PdfReviewViewer,
  type CreateResult,
  type DraftPatch,
  type ReviewComment,
  type ViewerTool,
} from "@al/pdf-review";
import "@al/pdf-review/styles.css";

configurePdfWorker("/pdf.worker.min.mjs");

export type { DraftPatch, ReviewComment, ViewerTool };
/** A mark just placed on the page: its kind, colour, area (and the line's points) and a picture of the area. */
export type MarkResult = CreateResult;

export interface ViewerProps {
  src: string;
  versionNumber: number;
  comments: ReviewComment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection?: () => void;
  /** Show the marking tools. */
  canDraw: boolean;
  tool?: ViewerTool;
  onToolChange?: (tool: ViewerTool) => void;
  onCreate: (result: MarkResult) => void;
  /** My saved drafts can be moved, recoloured and removed in place. */
  onUpdateDraft?: (id: string, patch: DraftPatch) => void;
  onDelete?: (id: string) => void;
  showResolved: boolean;
  className?: string;
}

export function Viewer(props: ViewerProps) {
  // The size goes on a wrapper: the viewer's own stylesheet is not in a CSS layer and its
  // "height: 100%" would beat Tailwind's size classes if they were put on the viewer itself.
  return (
    <div className={props.className}>
      <PdfReviewViewer
        src={props.src}
        versionNumber={props.versionNumber}
        comments={props.comments}
        selectedCommentId={props.selectedId}
        onSelectComment={props.onSelect}
        onClearSelection={props.onClearSelection}
        resolvedComments={props.showResolved ? "faint" : "hidden"}
        canDraw={props.canDraw}
        tool={props.tool}
        onToolChange={props.onToolChange}
        onCreate={props.onCreate}
        onUpdateDraft={props.onUpdateDraft}
        onDelete={props.onDelete}
      />
    </div>
  );
}
