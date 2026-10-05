import type { LucideIcon } from "lucide-react";

/** What a list shows when it has nothing in it: an icon, one line of why, and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
