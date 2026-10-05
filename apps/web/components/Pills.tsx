import { COMMENT_STATUS_LABELS, STAGE_LABELS, type CommentStatus, type Stage } from "@al/domain";
import { BadgeCheck, BookOpenCheck, ClipboardList, FilePen, type LucideIcon, ScanSearch, ShieldCheck } from "lucide-react";

/** One calm color per stage, readable in light and dark mode. */
export const STAGE_STYLES: Record<Stage, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600",
  INITIAL_REVIEW: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  REGISTRATION_ROUND:
    "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
  ACADEMIC_ROUND: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  FINAL_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
};

/** An icon per stage, so the stage reads without relying on its color. */
export const STAGE_ICONS: Record<Stage, LucideIcon> = {
  DRAFT: FilePen,
  INITIAL_REVIEW: ScanSearch,
  REGISTRATION_ROUND: ClipboardList,
  ACADEMIC_ROUND: BookOpenCheck,
  FINAL_REVIEW: ShieldCheck,
  APPROVED: BadgeCheck,
};

/** A solid marker color per stage (a thin stripe or dot next to the stage's tile). */
export const STAGE_MARKS: Record<Stage, string> = {
  DRAFT: "bg-slate-400 dark:bg-slate-500",
  INITIAL_REVIEW: "bg-sky-500",
  REGISTRATION_ROUND: "bg-indigo-500",
  ACADEMIC_ROUND: "bg-violet-500",
  FINAL_REVIEW: "bg-amber-500",
  APPROVED: "bg-emerald-500",
};

const pill = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

export function StagePill({ stage }: { stage: Stage }) {
  return <span className={`${pill} ${STAGE_STYLES[stage]}`}>{STAGE_LABELS[stage]}</span>;
}

const COMMENT_STYLES: Record<CommentStatus, string> = {
  OPEN: "bg-warn-soft text-warn ring-warn/30",
  NEEDS_CLARIFICATION: "bg-accent-soft text-accent ring-accent/30",
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
