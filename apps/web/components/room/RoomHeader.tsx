import { PHASES, type Phase } from "@al/domain";
import { Building2, Check, ChevronLeft, GraduationCap, Layers, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { Holder, PHASE_ICONS, PHASE_TONES, StatusChip, TONE_MARKS, TONE_TEXT } from "@/components/Pills";
import { STEP_LABELS, plural, type RoomProps } from "@/lib/room/view";

/** Track, code, campus and faculty, season, version; one status chip with who holds it; the five steps. */
export function RoomHeader({ room, backHref = "/" }: { room: RoomProps; backHref?: string | null }) {
  const lateDays = 5;
  return (
    <header className="flex flex-col gap-3">
      {backHref && (
        <nav aria-label="מיקום" className="text-sm text-muted">
          <Link href={backHref} className="inline-flex min-h-9 items-center gap-1 rounded-md hover:text-fg hover:underline">
            {room.seasonName}
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-bold leading-tight text-balance sm:text-2xl">{room.trackName}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="tabular font-semibold text-fg" dir="ltr">
              {room.trackNumber}
            </span>
            <span className="inline-flex items-center gap-1">
              <Building2 aria-hidden className="size-4" />
              {room.campus}
            </span>
            <span className="inline-flex items-center gap-1">
              <GraduationCap aria-hidden className="size-4" />
              {room.faculty}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers aria-hidden className="size-4" />
              {room.latestVersion ? `גרסה ${room.latestVersion}` : "אין גרסה עדיין"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusChip state={room.state} />
          <Holder names={room.holderNames} waitingDays={room.waitingDays} late={lateDays} />
          {room.openComments > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-warn">
              <MessageSquareWarning aria-hidden className="size-4" />
              {plural(room.openComments, "הערה פתוחה", "הערות פתוחות")}
            </span>
          )}
        </div>
      </div>
      <PhaseRail phase={room.phase} done={room.state === "APPROVED"} />
    </header>
  );
}

/** Five steps; the current one in its colour, past ones ticked. Text and icon, never colour alone. */
export function PhaseRail({ phase, done }: { phase: Phase; done: boolean }) {
  const at = PHASES.indexOf(phase);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="שלבי המכתב">
      {PHASES.map((p, i) => {
        const past = i < at || (done && i === at);
        const now = i === at && !done;
        const tone = PHASE_TONES[p];
        const Icon = past ? Check : PHASE_ICONS[p];
        return (
          <li key={p} aria-current={now ? "step" : undefined} className="flex min-w-0 flex-col gap-1">
            <span className={`h-1.5 rounded-full ${past ? "bg-good" : now ? TONE_MARKS[tone] : "bg-line"}`} aria-hidden />
            <span
              className={`flex items-center justify-center gap-1 truncate text-xs sm:text-sm ${
                now ? `font-bold ${TONE_TEXT[tone]}` : past ? "text-good" : "text-muted"
              }`}
            >
              <Icon aria-hidden className="hidden size-3.5 sm:block" />
              {STEP_LABELS[p]}
              {past && <span className="sr-only"> (הושלם)</span>}
              {now && <span className="sr-only"> (השלב הנוכחי)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
