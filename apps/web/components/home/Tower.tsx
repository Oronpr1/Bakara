// The control manager's tower: who holds how many letters ("הגורמים"), and what needs her attention.
import { BLOCKER_LABELS, STATE_LABELS, type Blocker } from "@al/domain";
import {
  CalendarX2,
  ChevronLeft,
  CircleCheckBig,
  FileX2,
  Hourglass,
  Link2Off,
  type LucideIcon,
  Settings,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { STATE_ICONS } from "@/components/Pills";
import type { Tower as TowerData } from "@/lib/letters/queries";
import { type Filters, filterQuery, holderRows, type HomeLetter } from "@/lib/home/model";
import { days, LATE_DAYS, letters } from "./meta";
import { RemindButton } from "./RemindButton";

const panel = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5";
const linkSm = "inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-accent hover:bg-accent-soft sm:min-h-9";
const listHref = (filters: Filters, change: Filters) => `/${filterQuery({ sort: filters.sort }, change)}#letters`;

function initials(name: string) {
  const parts = name.replace(/["'׳״.()]/g, "").split(/\s+/).filter((p) => p && !/^(ד"?ר|פרופ|דמו)$/.test(p));
  return parts.slice(0, 2).map((p) => p[0]).join("");
}

/** "הגורמים": one line per person who holds letters now. Factual, longest wait first. */
export function Holders({ tower, items, me, seasonId, filters }: { tower: TowerData; items: HomeLetter[]; me: string; seasonId: string; filters: Filters }) {
  const rows = holderRows(tower.holders, items);
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6);
  const row = (r: (typeof rows)[number]) => {
    const late = r.oldestDays >= LATE_DAYS;
    return (
      <li key={r.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">
          {initials(r.name)}
        </span>
        <span className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="font-bold">
            {r.name}
            {r.userId === me && <span className="font-normal text-muted"> (את/ה)</span>}
          </span>
          <span className="text-sm text-muted">
            <span className="font-semibold text-fg">{letters(r.count)}</span>
            {" · "}
            <span className={late ? "font-semibold text-bad" : ""}>הכי ותיק: {days(r.oldestDays)}</span>
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {r.states.map(([s, n]) => {
              const Icon = STATE_ICONS[s];
              return (
                <span key={s} className="inline-flex items-center gap-1">
                  <Icon aria-hidden className="size-3.5" />
                  <span className="tabular">{n}</span> {STATE_LABELS[s]}
                </span>
              );
            })}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Link href={listHref(filters, { g: "all", holder: r.userId })} className={linkSm}>
            המכתבים
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
          {r.userId !== me && r.remindable > 0 && <RemindButton userId={r.userId} seasonId={seasonId} name={r.name} count={r.remindable} />}
        </span>
      </li>
    );
  };
  return (
    <section aria-labelledby="holders-h" className={panel}>
      <div className="flex flex-col gap-0.5">
        <h2 id="holders-h" className="flex items-center gap-2 text-lg font-bold">
          <Users aria-hidden className="size-5 text-muted" />
          הגורמים
        </h2>
        <p className="text-sm text-muted">כמה מכתבים נמצאים עכשיו אצל כל אחד, ומאז מתי. "תזכיר" שולח לו הודעה על כל מכתב שממתין לו.</p>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-good-soft p-3 text-sm font-semibold text-good">
          <CircleCheckBig aria-hidden className="size-4" />
          אין כרגע מכתבים שממתינים לאף אחד.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">{shown.map(row)}</ul>
          {rest.length > 0 && (
            <details className="border-t border-line pt-2">
              <summary className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent">
                <ChevronLeft aria-hidden className="chev size-4" />
                עוד {rest.length} גורמים
              </summary>
              <ul className="flex flex-col divide-y divide-line pt-2">{rest.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- what needs attention

function Item({
  icon: Icon,
  tone,
  title,
  count,
  href,
  children,
}: {
  icon: LucideIcon;
  tone: "bad" | "warn" | "muted";
  title: string;
  count: number;
  href?: string;
  children?: React.ReactNode;
}) {
  const calm = count === 0;
  const tones = { bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", muted: "bg-bg text-muted" };
  return (
    <li className={`flex flex-col gap-2 rounded-lg border p-3 ${calm ? "border-line" : tone === "bad" ? "border-bad/40 bg-bad-soft/40" : "border-line"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full ${calm ? "bg-good-soft text-good" : tones[tone]}`}>
          {calm ? <CircleCheckBig aria-hidden className="size-4" /> : <Icon aria-hidden className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`font-semibold ${!calm && tone === "bad" ? "text-bad" : ""}`}>{title}</span>
          <span className="text-sm text-muted">{calm ? "אין" : letters(count)}</span>
        </span>
        {!calm && href && (
          <Link href={href} className={linkSm} aria-label={`הצג: ${title}`}>
            הצג
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {!calm && children}
    </li>
  );
}

/** Groups blocked letters by campus + faculty, with what is missing. */
function blockedUnits(blocked: TowerData["blocked"]) {
  const units = new Map<string, { campus: string; faculty: string; count: number; missing: Set<Blocker> }>();
  for (const l of blocked) {
    const key = `${l.campus}\u0000${l.faculty}`;
    const u = units.get(key) ?? { campus: l.campus, faculty: l.faculty, count: 0, missing: new Set<Blocker>() };
    u.count++;
    for (const b of l.blockers) if (b === "NO_REGISTRATION_MANAGER" || b === "NO_VP") u.missing.add(b as Blocker);
    units.set(key, u);
  }
  return [...units.values()];
}

export function Attention({ tower, items, filters }: { tower: TowerData; items: HomeLetter[]; filters: Filters }) {
  const loading = items.filter((l) => l.state === "LOADING");
  const units = blockedUnits(tower.blocked);
  return (
    <section aria-labelledby="attention-h" className={panel}>
      <h2 id="attention-h" className="flex items-center gap-2 text-lg font-bold">
        <TriangleAlert aria-hidden className="size-5 text-muted" />
        דורש תשומת לב
      </h2>
      <ul className="flex flex-col gap-2">
        <Item icon={TriangleAlert} tone="bad" title="חסר בעל תפקיד" count={tower.blocked.length} href={listHref(filters, { g: "blocked" })}>
          <ul className="flex flex-col gap-1.5 text-sm">
            {units.map((u) => (
              <li key={`${u.campus}-${u.faculty}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">
                  {u.campus} · {u.faculty}
                </span>
                <span className="text-muted">
                  ({letters(u.count)}): {[...u.missing].map((b) => BLOCKER_LABELS[b]).join(", ")}
                </span>
                <Link href="/settings" className="inline-flex min-h-9 items-center gap-1 font-semibold text-bad underline-offset-4 hover:underline">
                  <Settings aria-hidden className="size-3.5" />
                  להקמה
                </Link>
              </li>
            ))}
          </ul>
        </Item>
        <Item icon={CalendarX2} tone="bad" title="באיחור (עבר תאריך היעד)" count={tower.overdue} href={listHref(filters, { g: "overdue" })} />
        <Item icon={Link2Off} tone="warn" title="קישור אקדמי שפג או לא נפתח" count={tower.academicLinkProblems.length} href={listHref(filters, { g: "link" })}>
          <ul className="flex flex-col gap-1 text-sm">
            {tower.academicLinkProblems.slice(0, 5).map((l) => (
              <li key={l.id}>
                <Link href={`/letters/${l.id}`} className="font-semibold text-accent hover:underline">
                  {l.trackName}
                </Link>{" "}
                <span className="text-muted">
                  · {l.holderNames.join(", ")} · {l.academicLinkProblem === "expired" ? "הקישור פג" : `לא נפתח ${days(l.waitingDays ?? 0)}`}
                </span>
              </li>
            ))}
          </ul>
        </Item>
        <Item
          icon={FileX2}
          tone="muted"
          title="לא התחילו (אין גרסה)"
          count={tower.notStarted.reduce((n, s) => n + s.count, 0)}
          href={listHref(filters, { g: "notstarted" })}
        >
          <ul className="flex flex-col gap-0.5 text-sm">
            {tower.notStarted.map((s) => (
              <li key={s.advisorId}>
                <Link href={listHref(filters, { g: "notstarted", advisor: s.advisorId })} className="inline-flex min-h-9 items-center gap-1 hover:underline">
                  <span className="font-semibold">{s.name}</span>
                  <span className="tabular text-muted">· {letters(s.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Item>
        <Item icon={Hourglass} tone="warn" title="מאושרים שטרם עלו לגלבוע" count={loading.length} href={listHref(filters, { g: "gilboa" })} />
      </ul>
    </section>
  );
}
