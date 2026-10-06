"use client";
import { useId, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { NormRect, Point, Size } from "./geometry";
import { previewPlacement } from "./stickers";

export interface StickerNoteProps {
  id: string;
  /** The marked area, fractions of the page. */
  area: NormRect;
  /** Top-left of the sticker, page px. */
  pos: Point;
  page: Size;
  size: Size;
  face: string;
  heading: string;
  body?: string;
  open: boolean;
  selected: boolean;
  resolved: boolean;
  draft: boolean;
  ariaLabel: string;
  onActivate: () => void;
  onHover: (on: boolean) => void;
  onKeyboardFocus: (on: boolean) => void;
}

/**
 * One comment in sticker style: a faint tint over the marked area, a small
 * folded-corner note with its number beside it, and — while hovered, focused
 * from the keyboard, or opened with a click/tap — a preview card.
 *
 * State is never colour alone: a closed comment's sticker also carries a
 * check mark, a draft's a dashed outline, the selected one a ring.
 */
export function StickerNote(p: StickerNoteProps) {
  const previewId = useId();
  const place = p.open
    ? previewPlacement({ left: p.pos.x, top: p.pos.y, width: p.size.width, height: p.size.height }, p.page)
    : null;
  const hover = (on: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch") p.onHover(on);
  };

  return (
    <div
      className="alpr-note"
      data-open={p.open || undefined}
      data-selected={p.selected || undefined}
      data-resolved={p.resolved || undefined}
      data-draft={p.draft || undefined}
    >
      <div
        className="alpr-note-area"
        style={percentBox(p.area)}
        aria-hidden="true"
        onClick={p.onActivate}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      />
      <button
        type="button"
        className="alpr-sticker"
        data-comment-id={p.id}
        aria-label={p.ariaLabel}
        aria-pressed={p.selected}
        aria-expanded={p.open}
        aria-describedby={place ? previewId : undefined}
        style={{ left: p.pos.x, top: p.pos.y, width: p.size.width, height: p.size.height }}
        onClick={p.onActivate}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        onFocus={(e: FocusEvent<HTMLButtonElement>) => {
          if (e.currentTarget.matches(":focus-visible")) p.onKeyboardFocus(true);
        }}
        onBlur={() => p.onKeyboardFocus(false)}
      >
        <span className="alpr-sticker-face" dir="auto">
          {p.face}
        </span>
        {p.resolved && (
          <svg className="alpr-sticker-check" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {place && (
        <div
          id={previewId}
          role="tooltip"
          className="alpr-preview"
          dir="rtl"
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
        >
          <strong className="alpr-preview-head">{p.heading}</strong>
          {p.body && (
            <span className="alpr-preview-text" dir="auto">
              {p.body}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function percentBox(r: NormRect): CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}
