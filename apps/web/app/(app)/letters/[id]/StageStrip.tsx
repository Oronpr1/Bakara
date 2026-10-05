import { STAGE_LABELS, STAGES, stageIndex, type Stage } from "@al/domain";

/** The six stages in order, with the current one marked. */
export function StageStrip({ stage }: { stage: Stage }) {
  const current = stageIndex(stage);
  const approved = stage === "APPROVED";
  return (
    <ol aria-label="שלבי המכתב" className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      {STAGES.map((s, i) => {
        const done = i < current || approved;
        const now = i === current && !approved;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs sm:text-sm ${
              now
                ? "border-accent bg-accent-soft font-bold text-accent"
                : done
                  ? "border-good/30 bg-good-soft text-good"
                  : "border-line bg-surface text-muted"
            }`}
          >
            <span
              aria-hidden
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                now ? "bg-accent text-accent-fg" : done ? "bg-good text-surface" : "bg-bg ring-1 ring-line"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span>
              {STAGE_LABELS[s]}
              <span className="sr-only">{done ? " (הושלם)" : now ? " (השלב הנוכחי)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
