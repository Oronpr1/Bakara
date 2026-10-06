"use client";
import { useId, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { PixelRect, Point, Size } from "./geometry";
import { inkOn, lineBar, shade, withAlpha, type Corner, type MarkKind } from "./marks";
import { STICKER_SIZE, previewPlacement } from "./stickers";

/** What a press on a mark grabbed: its body, a corner of its area, or an end of its line. */
export type Grip = "body" | Corner | 0 | 1;

export interface MarkViewProps {
  id: string;
  kind: MarkKind;
  /** The mark's area, page px. */
  rect: PixelRect;
  /** A line's ends, page px. */
  points?: Point[];
  page: Size;
  color: string;
  number: string;
  heading: string;
  body?: string;
  /** A note's sticker, top-left in page px. */
  stickerPos?: Point;
  open: boolean;
  selected: boolean;
  resolved: boolean;
  draft: boolean;
  /** Draggable, with handles while selected. */
  editable: boolean;
  /** Ignore the pointer (a drawing tool is active). */
  inert: boolean;
  ariaLabel: string;
  onPress: (e: ReactPointerEvent, grip: Grip) => void;
  onActivate: () => void;
  onHover: (on: boolean) => void;
  onKeyboardFocus: (on: boolean) => void;
}

const BADGE = 18;

/**
 * One mark on a page. A note is a tinted area with a folded-corner sticker
 * beside it; an X is a cross over its area; a line is a bar from end to end.
 * Each carries its number, opens a preview card (its text) on hover, keyboard
 * focus or click, and — when it is a draft of mine and selected — shows
 * handles to move and resize it.
 *
 * State is never colour alone: a closed comment is faded and carries a check,
 * a draft is dashed, the selected mark has a ring and handles.
 */
export function MarkView(p: MarkViewProps) {
  const previewId = useId();
  const hover = (on: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch") p.onHover(on);
  };
  const press = (grip: Grip) => (e: ReactPointerEvent) => p.onPress(e, grip);
  const common = {
    "data-comment-id": p.id,
    "aria-label": p.ariaLabel,
    "aria-pressed": p.selected,
    "aria-expanded": p.open,
    "aria-describedby": p.open ? previewId : undefined,
    onClick: p.onActivate,
    onPointerDown: press("body"),
    onPointerEnter: hover(true),
    onPointerLeave: hover(false),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(":focus-visible")) p.onKeyboardFocus(true);
    },
    onBlur: () => p.onKeyboardFocus(false),
  };

  const style = {
    "--mark": p.color,
    "--mark-soft": withAlpha(p.color, 0.14),
    "--mark-strong": withAlpha(p.color, 0.2),
    "--mark-ink": inkOn(p.color),
    "--mark-fold": shade(p.color, 0.3),
  } as CSSProperties;

  let shape: ReactNode;
  let anchorBox: PixelRect; // where the preview hangs from
  const handles: Array<{ grip: Grip; at: Point }> = [];
  const { rect: r } = p;

  if (p.kind === "LINE" && p.points && p.points.length >= 2) {
    const a = p.points[0]!;
    const b = p.points[1]!;
    const bar = lineBar(a, b);
    // the number sits just before the line's start, kept on the page
    const ux = bar.length ? (a.x - b.x) / bar.length : -1;
    const uy = bar.length ? (a.y - b.y) / bar.length : 0;
    const bx = clamp(a.x + ux * 14 - BADGE / 2, 0, p.page.width - BADGE);
    const by = clamp(a.y + uy * 14 - BADGE / 2, 0, p.page.height - BADGE);
    anchorBox = { left: bx, top: by, width: BADGE, height: BADGE };
    shape = (
      <>
        <button
          type="button"
          className="alpr-line alpr-grip"
          style={{ left: bar.x, top: bar.y, width: Math.max(1, bar.length), transform: `translateY(-50%) rotate(${bar.angle}deg)` }}
          {...common}
        >
          <span className="alpr-line-stroke" />
        </button>
        <span className="alpr-badge" style={{ left: bx, top: by }} aria-hidden="true">
          {p.number}
          {p.resolved && <Check />}
        </span>
      </>
    );
    handles.push({ grip: 0, at: a }, { grip: 1, at: b });
  } else if (p.kind === "X") {
    anchorBox = { left: r.left + r.width - BADGE / 2, top: r.top - BADGE / 2, width: BADGE, height: BADGE };
    shape = (
      <button type="button" className="alpr-x alpr-grip" style={pxBox(r)} {...common}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 0L100 100M100 0L0 100" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="alpr-badge alpr-badge-corner" aria-hidden="true">
          {p.number}
          {p.resolved && <Check />}
        </span>
      </button>
    );
  } else {
    // NOTE
    const s = p.stickerPos ?? { x: r.left + r.width, y: r.top };
    anchorBox = { left: s.x, top: s.y, width: STICKER_SIZE.width, height: STICKER_SIZE.height };
    shape = (
      <>
        <div
          className="alpr-note-area alpr-grip"
          style={pxBox(r)}
          aria-hidden="true"
          onClick={p.onActivate}
          onPointerDown={press("body")}
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
        />
        <button
          type="button"
          className="alpr-sticker alpr-grip"
          style={{ left: s.x, top: s.y, width: STICKER_SIZE.width, height: STICKER_SIZE.height }}
          {...common}
        >
          <span className="alpr-sticker-face" dir="auto">
            {p.number}
          </span>
          {p.resolved && <Check className="alpr-sticker-check" />}
        </button>
      </>
    );
  }

  if (p.kind !== "LINE")
    handles.push(
      { grip: "nw", at: { x: r.left, y: r.top } },
      { grip: "ne", at: { x: r.left + r.width, y: r.top } },
      { grip: "sw", at: { x: r.left, y: r.top + r.height } },
      { grip: "se", at: { x: r.left + r.width, y: r.top + r.height } },
    );

  const place = p.open ? previewPlacement(anchorBox, p.page) : null;
  return (
    <div
      className="alpr-mark"
      data-kind={p.kind}
      data-open={p.open || undefined}
      data-selected={p.selected || undefined}
      data-resolved={p.resolved || undefined}
      data-draft={p.draft || undefined}
      data-editable={p.editable || undefined}
      data-inert={p.inert || undefined}
      style={style}
    >
      {shape}
      {p.selected &&
        p.editable &&
        !p.inert &&
        handles.map((h) => (
          <span
            key={String(h.grip)}
            className="alpr-handle"
            data-grip={String(h.grip)}
            style={{ left: h.at.x, top: h.at.y }}
            aria-hidden="true"
            onPointerDown={press(h.grip)}
          />
        ))}
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

function Check({ className }: { className?: string }) {
  return (
    <svg className={className ?? "alpr-badge-check"} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(lo, hi), Math.max(lo, v));

export function pxBox(r: PixelRect): CSSProperties {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function percentBox(r: { x: number; y: number; width: number; height: number }): CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}
