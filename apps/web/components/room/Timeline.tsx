import { History } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import type { RoomEvent } from "@/lib/letters/queries";
import { eventText, relativeDay } from "@/lib/room/view";

const DOT = { good: "bg-good", bad: "bg-bad", acad: "bg-acad", muted: "bg-line-strong" } as const;

/** Everything that happened to the letter, newest first, in plain sentences. Nothing is ever deleted. */
export function Timeline({ history, names }: { history: RoomEvent[]; names: Record<string, string> }) {
  const items = history.map((e) => ({ e, t: eventText(e, names) })).filter((x) => x.t !== null);
  if (items.length === 0)
    return (
      <EmptyState icon={History} title="עוד לא קרה כלום">
        כל פעולה על המכתב תירשם כאן.
      </EmptyState>
    );
  return (
    <ol className="relative flex flex-col gap-3 border-s-2 border-line ps-4">
      {items.map(({ e, t }) => (
        <li key={e.id} className="relative flex flex-col gap-0.5 text-sm">
          <span aria-hidden className={`absolute -start-[1.4rem] top-1.5 size-2.5 rounded-full ring-2 ring-surface ${t!.tone ? DOT[t!.tone] : "bg-accent"}`} />
          <p>
            <span className="font-semibold">{t!.who}</span> · {t!.text}
          </p>
          {t!.detail && <p className="whitespace-pre-wrap rounded-md bg-surface-2 px-2 py-1 text-muted">&quot;{t!.detail}&quot;</p>}
          <time className="text-xs text-muted" dateTime={new Date(e.at).toISOString()} title={formatDateTime(new Date(e.at))}>
            {relativeDay(e.at)} · {formatDateTime(new Date(e.at)).split(",").at(-1)?.trim()}
          </time>
        </li>
      ))}
    </ol>
  );
}
