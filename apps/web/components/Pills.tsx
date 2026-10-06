import { COMMENT_STATUS_LABELS, PHASE_LABELS, STATE_LABELS, STATE_TONES, type CommentStatus, type FlowState, type Phase, type Tone } from "@al/domain";
import {
  BadgeCheck,
  BookOpenCheck,
  CircleAlert,
  FilePen,
  Hourglass,
  type LucideIcon,
  PenLine,
  ScanSearch,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

const pill = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

/** One calm colour per family, readable in light and dark mode. Never the only signal: an icon and text go with it. */
export const TONE_STYLES: Record<Tone, string> = {
  prep: "bg-prep-soft text-prep ring-prep/25",
  review: "bg-review-soft text-review ring-review/25",
  acad: "bg-acad-soft text-acad ring-acad/25",
  final: "bg-final-soft text-final ring-final/25",
  good: "bg-good-soft text-good ring-good/30",
  warn: "bg-warn-soft text-warn ring-warn/30",
  bad: "bg-bad-soft text-bad ring-bad/30",
};

/** A solid marker per family (a thin stripe or dot next to a tile). */
export const TONE_MARKS: Record<Tone, string> = {
  prep: "bg-prep",
  review: "bg-review",
  acad: "bg-acad",
  final: "bg-final",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
};

/** The text colour of each family, for numbers and headings. */
export const TONE_TEXT: Record<Tone, string> = {
  prep: "text-prep",
  review: "text-review",
  acad: "text-acad",
  final: "text-final",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

export const STATE_ICONS: Record<FlowState, LucideIcon> = {
  PREPARING: FilePen,
  IN_REVIEW: ScanSearch,
  FIXING: PenLine,
  READY_FOR_ACADEMIC: Send,
  WITH_ACADEMIC: BookOpenCheck,
  AWAITING_FINAL: ShieldCheck,
  LOADING: Hourglass,
  APPROVED: BadgeCheck,
  BLOCKED: CircleAlert,
};

/** The phases as tiles on a dashboard: label, family, icon. */
export const PHASE_TONES: Record<Phase, Tone> = { DRAFT: "prep", REVIEW: "review", ACADEMIC: "acad", FINAL: "final", APPROVED: "good" };
export const PHASE_ICONS: Record<Phase, LucideIcon> = {
  DRAFT: FilePen,
  REVIEW: ScanSearch,
  ACADEMIC: BookOpenCheck,
  FINAL: ShieldCheck,
  APPROVED: BadgeCheck,
};
export { PHASE_LABELS, STATE_LABELS };

/** The status of a letter in one chip: "בתיקון", "אצל גורם אקדמי"… */
export function StatusChip({ state, label }: { state: FlowState; label?: string }) {
  const Icon = STATE_ICONS[state];
  return (
    <span className={`${pill} ${TONE_STYLES[STATE_TONES[state]]} gap-1`}>
      <Icon aria-hidden className="size-3.5" />
      {label ?? STATE_LABELS[state]}
    </span>
  );
}

/** "אצל יוסי ואורון · 3 ימים": who holds the letter and for how long. */
export function holderText(names: readonly string[], waitingDays: number | null): string {
  const who = names.length === 0 ? "" : names.length === 1 ? `אצל ${names[0]}` : `אצל ${names.slice(0, -1).join(", ")} ו${names.at(-1)}`;
  const days = waitingDays === null ? "" : waitingDays === 0 ? "מהיום" : waitingDays === 1 ? "יום אחד" : `${waitingDays} ימים`;
  return [who, days].filter(Boolean).join(" · ");
}

export function Holder({ names, waitingDays, late = 5 }: { names: readonly string[]; waitingDays: number | null; late?: number }) {
  const text = holderText(names, waitingDays);
  if (!text) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${waitingDays !== null && waitingDays >= late ? "font-semibold text-bad" : "text-muted"}`}>
      <UserCheck aria-hidden className="size-4" />
      {text}
    </span>
  );
}

const COMMENT_STYLES: Record<CommentStatus, string> = {
  OPEN: "bg-warn-soft text-warn ring-warn/30",
  NEEDS_CLARIFICATION: "bg-warn-soft text-warn ring-warn/30",
  RESOLVED_FIXED: "bg-good-soft text-good ring-good/30",
  RESOLVED_NO_CHANGE: "bg-bg text-muted ring-line",
};

export function CommentStatusPill({ status }: { status: CommentStatus }) {
  return <span className={`${pill} ${COMMENT_STYLES[status]}`}>{COMMENT_STATUS_LABELS[status]}</span>;
}

export function Tag({
  tone = "muted",
  icon: Icon,
  children,
}: {
  tone?: "muted" | "accent" | "good" | "warn" | "bad";
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const tones = {
    muted: "bg-bg text-muted ring-line",
    accent: "bg-accent-soft text-accent ring-accent/30",
    good: "bg-good-soft text-good ring-good/30",
    warn: "bg-warn-soft text-warn ring-warn/30",
    bad: "bg-bad-soft text-bad ring-bad/30",
  };
  return (
    <span className={`${pill} ${tones[tone]} gap-1`}>
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}
