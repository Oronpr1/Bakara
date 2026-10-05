import { STAGE_LABELS, STAGES, stageIndex, type Stage } from "@al/domain";
import { Check } from "lucide-react";

/** The six stages in order: done ones carry a check, the current one is ringed and named "עכשיו". */
export function StageStrip({ stage }: { stage: Stage }) {
  const current = stageIndex(stage);
  const approved = stage === "APPROVED";
  return (
    <ol aria-label="שלבי המכתב" className="flex rounded-xl border border-line bg-surface px-1 py-3 shadow-card sm:px-2">
      {STAGES.map((s, i) => {
        const done = i < current || approved;
        const now = i === current && !approved;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 px-0.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-3.5 -start-1/2 h-0.5 w-full ${i <= current || approved ? "bg-good" : "bg-line"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 grid size-7 place-items-center rounded-full text-xs font-bold tabular ${
                done
                  ? "bg-good text-surface"
                  : now
                    ? "bg-accent text-accent-fg ring-4 ring-accent-soft"
                    : "bg-surface text-muted ring-1 ring-line-strong"
              }`}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-xs leading-tight sm:text-sm ${now ? "font-bold text-fg" : done ? "text-fg" : "text-muted"}`}>
              {STAGE_LABELS[s]}
              <span className="sr-only">{done ? " (הושלם)" : now ? " (השלב הנוכחי)" : " (עוד לא)"}</span>
            </span>
            {now && (
              <span aria-hidden className="rounded-full bg-accent-soft px-2 text-[11px] font-semibold text-accent">
                עכשיו
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
