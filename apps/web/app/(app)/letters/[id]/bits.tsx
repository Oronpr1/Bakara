import { ChevronDown, type LucideIcon } from "lucide-react";

/** A chevron for a <summary> inside <details className="group">; turns when the details opens. */
export function SummaryChevron() {
  return <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-180" />;
}

/** A compact link-styled button for downloads and secondary links in dense panels. */
export const btnSmall =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-accent transition-colors duration-150 hover:border-accent/40 hover:bg-accent-soft";

const tones = {
  muted: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent ring-accent/30",
  good: "bg-good-soft text-good ring-good/30",
  warn: "bg-warn-soft text-warn ring-warn/30",
  bad: "bg-bad-soft text-bad ring-bad/30",
};

/** A pill with an icon, so the state never depends on color alone. */
export function IconTag({
  icon: Icon,
  tone = "muted",
  children,
}: {
  icon: LucideIcon;
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}
