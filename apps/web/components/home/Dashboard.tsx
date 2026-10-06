// The top of the home screen: "how many letters are mine, and where they stand". Each tile is a
// link that filters the list below (kept in the address, so a view can be shared and returned to).
import { PHASES, STATE_LABELS, type Phase } from "@al/domain";
import { Check } from "lucide-react";
import Link from "next/link";
import { PHASE_ICONS, PHASE_LABELS, PHASE_TONES } from "@/components/Pills";
import { type Filters, filterQuery, type Group, GROUP_TITLES, type HomeLetter, inGroup, oldestWait, phaseCounts, stateBreakdown } from "@/lib/home/model";
import { days, LATE_DAYS, letters, PERSONAL_ICONS, TILE_TONES } from "./meta";

const tileBase =
  "group relative flex min-h-24 flex-col gap-1 rounded-xl border border-line bg-surface p-3.5 text-start shadow-card transition-colors duration-150 hover:border-line-strong hover:bg-surface-2";
const selectedRing = "ring-2 ring-offset-2 ring-offset-bg";

/** A link to the list with this group, or back to every letter when it is the group already shown. */
const tileHref = (filters: Filters, current: Group, g: Group) => `/${filterQuery(filters, { g: current === g ? "all" : g })}#letters`;

function Selected({ on }: { on: boolean }) {
  return on ? (
    <span className="absolute end-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-fg text-bg">
      <Check aria-hidden className="size-3.5" />
      <span className="sr-only">(מסונן לפי זה; לחיצה מבטלת)</span>
    </span>
  ) : null;
}

// ---------------------------------------------------------------- personal tiles

const PERSONAL_SUB: Partial<Record<Group, (items: HomeLetter[]) => string>> = {
  todo: (items) =>
    items.length === 0
      ? "אין מה להכין או לתקן"
      : stateBreakdown(items)
          .map(([s, n]) => `${n} ${STATE_LABELS[s]}`)
          .join(" · "),
  review: (items) => (items.length ? `הכי ותיק: ${days(oldestWait(items) ?? 0)}` : "אין כרגע מכתב לבדיקה"),
  final: (items) => (items.length ? `הכי ותיק: ${days(oldestWait(items) ?? 0)}` : "אין כרגע מכתב לחתימה"),
  mine: (items) => (items.length ? `הכי ותיק: ${days(oldestWait(items) ?? 0)}` : "אין כרגע מכתב שממתין לך"),
  others: (items) => (items.length ? "אצל מנהל רישום, סמנכ״ל או גורם אקדמי" : "אין כרגע מכתב שלך אצל אחרים"),
  done: (items) => {
    const loaded = items.filter((l) => l.inGilboa).length;
    return items.length ? `${loaded === items.length ? "כולם" : loaded} הועלו לגלבוע` : "עוד אין מכתבים שאושרו";
  },
};

export function PersonalTiles({
  groups,
  items,
  me,
  filters,
  current,
}: {
  groups: Group[];
  items: HomeLetter[];
  me: string;
  filters: Filters;
  current: Group;
}) {
  if (groups.length === 0) return null;
  return (
    <ul className={`grid grid-cols-2 gap-3 ${groups.length >= 4 ? "lg:grid-cols-4" : groups.length === 3 ? "sm:grid-cols-3" : ""}`}>
      {groups.map((g) => {
        const inside = items.filter((l) => inGroup(l, g, me));
        const Icon = PERSONAL_ICONS[g]!;
        const waiting = g === "review" || g === "final" || g === "mine" || g === "todo";
        const late = waiting && (oldestWait(inside) ?? 0) >= LATE_DAYS && g !== "todo";
        const on = current === g;
        return (
          <li key={g} className={groups.length === 3 && g === groups[2] ? "col-span-2 sm:col-span-1" : ""}>
            <Link
              href={tileHref(filters, current, g)}
              aria-current={on ? "true" : undefined}
              className={`${tileBase} h-full ${on ? `${selectedRing} ring-accent` : ""}`}
            >
              <span className="flex items-center gap-2 pe-6 text-sm font-semibold">
                <span className={`grid size-7 place-items-center rounded-full ${waiting && inside.length ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent"}`}>
                  <Icon aria-hidden className="size-4" />
                </span>
                {GROUP_TITLES[g]}
              </span>
              <span className="tabular text-3xl leading-none font-extrabold">{inside.length}</span>
              <span className={`text-xs ${late ? "font-semibold text-bad" : "text-muted"}`}>{PERSONAL_SUB[g]?.(inside)}</span>
              <Selected on={on} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- the season's progress and the five phases

export function ProgressBar({ items, label }: { items: HomeLetter[]; label: string }) {
  const total = items.length;
  const counts = phaseCounts(items);
  const approved = counts.APPROVED;
  const loaded = items.filter((l) => l.inGilboa).length;
  const pct = total ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm">
          <span className="tabular text-lg font-bold">{approved}</span> מתוך <span className="tabular font-semibold">{total}</span> {label} אושרו
          להפצה
          <span className="text-muted">
            {" "}
            · <span className="tabular">{loaded}</span> הועלו לגלבוע
          </span>
        </p>
        <p className="tabular text-sm font-semibold text-good">{pct}%</p>
      </div>
      <div
        role="img"
        aria-label={`${approved} מתוך ${total} אושרו להפצה. ${PHASES.map((p) => `${PHASE_LABELS[p]}: ${counts[p]}`).join(", ")}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-line"
      >
        {PHASES.map((p) =>
          counts[p] ? (
            <span
              key={p}
              className={`h-full ${TILE_TONES[PHASE_TONES[p]].bar} border-s border-surface first:border-s-0`}
              style={{ width: `${(counts[p] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

const PHASE_SUB: Record<Phase, (items: HomeLetter[]) => string | null> = {
  DRAFT: (items) => {
    const n = items.filter((l) => l.latestVersion === 0).length;
    return n ? `${n} בלי גרסה` : null;
  },
  REVIEW: (items) => {
    const n = items.filter((l) => l.state === "FIXING").length;
    return n ? `${n} בתיקון` : null;
  },
  ACADEMIC: (items) => {
    const n = items.filter((l) => l.state === "READY_FOR_ACADEMIC").length;
    return n ? `${n} ממתינים לשליחה` : null;
  },
  FINAL: (items) => {
    const n = items.filter((l) => l.state === "FIXING").length;
    return n ? `${n} בתיקון` : null;
  },
  APPROVED: (items) => {
    const n = items.filter((l) => l.inGilboa).length;
    return items.length ? `${n} הועלו לגלבוע` : null;
  },
};

export function PhaseTiles({ items, filters, current }: { items: HomeLetter[]; filters: Filters; current: Group }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {PHASES.map((p, i) => {
        const inside = items.filter((l) => l.phase === p);
        const tone = TILE_TONES[PHASE_TONES[p]];
        const Icon = PHASE_ICONS[p];
        const on = current === p;
        const sub = PHASE_SUB[p](inside);
        return (
          <li key={p} className={i === PHASES.length - 1 ? "col-span-2 sm:col-span-1" : ""}>
            <Link
              href={tileHref(filters, current, p)}
              aria-current={on ? "true" : undefined}
              aria-label={`${PHASE_LABELS[p]}: ${letters(inside.length)}${sub ? `, ${sub}` : ""}`}
              className={`${tileBase} h-full border-t-4 ${tone.top} ${on ? `${selectedRing} ${tone.ring}` : ""}`}
            >
              <span className="flex items-center gap-1.5 pe-6 text-sm font-semibold text-muted">
                <Icon aria-hidden className={`size-4 ${tone.text}`} />
                {PHASE_LABELS[p]}
              </span>
              <span className={`tabular text-3xl leading-none font-extrabold ${tone.text}`}>{inside.length}</span>
              <span className="text-xs text-muted">{sub ?? " "}</span>
              <Selected on={on} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusSummary({
  items,
  label,
  filters,
  current,
  title,
}: {
  items: HomeLetter[];
  label: string;
  filters: Filters;
  current: Group;
  title?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {title && <h2 className="text-sm font-bold text-muted">{title}</h2>}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <ProgressBar items={items} label={label} />
      </div>
      <PhaseTiles items={items} filters={filters} current={current} />
    </div>
  );
}
