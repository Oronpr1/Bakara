import type { LucideIcon } from "lucide-react";

const TONES = { accent: "bg-accent-soft text-accent", good: "bg-good-soft text-good", bad: "bg-bad-soft text-bad" };

/** What a list shows when it has nothing in it: an icon, one line of why, and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = "accent",
  as: Heading = "p",
}: {
  icon: LucideIcon;
  tone?: "accent" | "good" | "bad";
  /** Render the title as a heading when the empty state is the whole page. */
  as?: "p" | "h1" | "h2";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center">
      <span className={`grid size-11 place-items-center rounded-full ${TONES[tone]}`}>
        <Icon aria-hidden className="size-5" />
      </span>
      <Heading className={Heading === "h1" ? "text-xl font-bold" : "text-base font-semibold"}>{title}</Heading>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
