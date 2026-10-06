// The home screen, shaped by role: the control manager's tower ("מגדל פיקוח"), the advisor's
// "המכתבים שלי", the reviewers' "ממתין לי". On top, a dashboard of the person's own letters; below,
// the letters themselves with filters kept in the address. No rules here: everything comes ready
// from the shared queries (who holds a letter, for how long, what the actor may do).
import { canGlobal } from "@al/domain";
import { CalendarRange, Download, FileInput, Settings } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Tag } from "@/components/Pills";
import { btnSecondary } from "@/components/ui";
import { PersonalTiles, ProgressBar, StatusSummary } from "@/components/home/Dashboard";
import { FilterBar } from "@/components/home/FilterBar";
import { LetterList } from "@/components/home/LetterList";
import { ListEmpty } from "@/components/home/ListEmpty";
import { letters as lettersText } from "@/components/home/meta";
import { Attention, Holders } from "@/components/home/Tower";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import {
  applyFilters,
  defaultGroup,
  filterOptions,
  filterQuery,
  GROUP_TITLES,
  type HomeLetter,
  parseFilters,
  personaOf,
  personalGroups,
  sortItems,
} from "@/lib/home/model";
import { getHomeView } from "@/lib/home/queries";
import { currentSeason } from "@/lib/season-context";

export const metadata = { title: "העבודה שלי · מכתבי קבלה" };

/** "קמפוס אונו · מנהל עסקים", or "קמפוסים חרדיים (4 פקולטות)" when there are several. */
function scopeText(items: HomeLetter[]): string {
  const campuses = new Map<string, Set<string>>();
  for (const l of items) campuses.set(l.campus, (campuses.get(l.campus) ?? new Set()).add(l.faculty));
  const parts = [...campuses].map(([c, f]) => (f.size === 1 ? `${c} · ${[...f][0]}` : `${c} (${f.size} פקולטות)`));
  return parts.length > 2 ? `${parts.slice(0, 2).join(", ")} ועוד ${parts.length - 2}` : parts.join(", ");
}

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const actor = actorOf(user);
  const { current } = await currentSeason();

  if (!current)
    return (
      <EmptyState
        as="h1"
        icon={CalendarRange}
        title="עדיין לא נפתחה עונת רישום"
        action={
          canGlobal(actor, "MANAGE_SEASONS") ? (
            <Link href="/seasons" className={btnSecondary}>
              פתיחת עונה
            </Link>
          ) : undefined
        }
      >
        {canGlobal(actor, "MANAGE_SEASONS")
          ? "פותחים עונה (אפשר על בסיס עונה קודמת), ואז מקימים בה את המסלולים שצריכים מכתב."
          : "כשוורוניקה תפתח את העונה, המכתבים שלך יופיעו כאן."}
      </EmptyState>
    );

  const [view, params] = await Promise.all([getHomeView(actor, current.id), searchParams]);
  const all = view.letters;
  const me = user.id;
  const persona = personaOf(user.roles, me, all);
  const filters = parseFilters(params);
  const group = filters.g ?? defaultGroup(persona);
  // A registration manager who is also the advisor of every letter in the unit (שולי) needs no
  // second, unit-wide summary: her own tiles already say it all.
  const unitSummary = persona.control || persona.vp || (persona.rm && (!persona.advisor || all.some((l) => !l.advisorIds.includes(me))));
  const onlyMine = !persona.control && !persona.vp && !persona.rm;
  const shown = sortItems(applyFilters(all, filters, me, group), filters.sort);
  const personal = personalGroups(persona);
  const canImport = canGlobal(actor, "MANAGE_UNITS");
  const holderIndex = filters.holder ? all.find((l) => l.holderIds.includes(filters.holder!)) : undefined;
  const holderName = holderIndex ? holderIndex.holderNames[holderIndex.holderIds.indexOf(filters.holder!)] : undefined;

  const title = persona.control ? "מגדל פיקוח" : persona.advisor ? "המכתבים שלי" : "ממתין לי";
  const scope = persona.control || persona.vp ? `${lettersText(all.length)} בעונה` : scopeText(all);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            <CalendarRange aria-hidden className="size-4" />
            {view.season.name}
            {view.season.status === "ARCHIVED" && <Tag>בארכיון</Tag>}
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          <p className="text-muted">
            שלום {firstName(user.name)}
            {scope && <> · {scope}</>}
          </p>
        </div>
        {persona.control && (
          <nav aria-label="פעולות ניהול" className="flex flex-wrap gap-2">
            {canImport && (
              <Link href={`/seasons/${view.season.id}/import`} className={btnSecondary}>
                <FileInput aria-hidden className="size-4" />
                ייבוא מסלולים
              </Link>
            )}
            <Link href="/settings" className={btnSecondary}>
              <Settings aria-hidden className="size-4" />
              הגדרות
            </Link>
          </nav>
        )}
      </header>

      {/* The person's own dashboard: how many letters, and where they stand. */}
      <section aria-label="תמונת מצב" className="flex flex-col gap-4">
        {personal.length > 0 && (
          <div className="flex flex-col gap-2">
            {unitSummary && <h2 className="text-sm font-bold text-muted">שלך</h2>}
            <PersonalTiles groups={personal} items={all} me={me} filters={filters} current={group} />
          </div>
        )}
        {unitSummary ? (
          <StatusSummary
            items={all}
            label="מכתבים"
            filters={filters}
            current={group}
            title={persona.control || persona.vp ? "כל המכתבים בעונה" : "המכתבים ביחידה שלך"}
          />
        ) : (
          all.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <ProgressBar items={all} label="המכתבים שלך" />
            </div>
          )
        )}
      </section>

      {persona.control && view.tower && (
        <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
          <Holders tower={view.tower} items={all} me={me} seasonId={view.season.id} filters={filters} />
          <Attention tower={view.tower} items={all} filters={filters} />
        </div>
      )}

      <section id="letters" aria-labelledby="letters-h" className="flex scroll-mt-4 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="letters-h" className="text-lg font-bold">
            {GROUP_TITLES[group]}
            <span className="tabular text-base font-normal text-muted" role="status">
              {" "}
              · {shown.length}
              {shown.length !== all.length && <> מתוך {all.length}</>}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {group !== "all" && (
              <Link href={`/${filterQuery(filters, { g: "all" })}#letters`} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-accent hover:bg-accent-soft">
                כל המכתבים ({all.length})
              </Link>
            )}
            {shown.length > 0 && (
              <a href={`/season/export${filterQuery({ ...filters, g: group })}`} className={btnSecondary} download>
                <Download aria-hidden className="size-4" />
                ייצוא לאקסל
              </a>
            )}
          </div>
        </div>
        {all.length > 0 && <FilterBar filters={filters} options={filterOptions(all)} byPeople={persona.control} holderName={holderName} />}
        <LetterList
          items={shown}
          canRemind={persona.control}
          showManager={persona.control}
          showAdvisor={!onlyMine || all.some((l) => l.advisorId !== me)}
          me={me}
          empty={<ListEmpty group={group} filters={filters} persona={persona} total={all.length} canImport={canImport} seasonId={view.season.id} />}
        />
      </section>
    </div>
  );
}
