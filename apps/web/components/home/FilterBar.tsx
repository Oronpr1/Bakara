"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/Spinner";
import { input, label as labelClass } from "@/components/ui";
import { type Filters, filterQuery, type Option, SORT_LABELS, SORTS } from "@/lib/home/model";

function Select({
  label,
  name,
  value,
  options,
  all,
}: {
  label: string;
  name: string;
  value: string | undefined;
  options: Option[];
  all?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        key={value ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`${input} cursor-pointer`}
      >
        {all !== undefined && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Filters for the letter list. It is a plain GET form (so it works before the page's script
 * loads); with script, it updates the address in place: selects at once, the search as you type.
 * Everything is in the address, so a filtered view can be shared and returned to.
 */
export function FilterBar({
  filters,
  options,
  byPeople,
  holderName,
}: {
  filters: Filters;
  options: { campuses: Option[]; faculties: Option[]; advisors: Option[]; managers: Option[] };
  /** The control manager also filters by advisor and registration manager. */
  byPeople: boolean;
  /** When the list shows one person's letters (from "הגורמים"). */
  holderName?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchId = useId();

  // When the address changes from elsewhere (a tile, "נקה"), show its search text, unless typing.
  useEffect(() => {
    if (search.current && document.activeElement !== search.current) search.current.value = filters.q ?? "";
  }, [filters.q]);

  function go(form: HTMLFormElement) {
    clearTimeout(timer.current);
    const next: Filters = { ...filters, campus: undefined, faculty: undefined, advisor: undefined, rm: undefined, q: undefined, sort: undefined };
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v.trim()) (next as Record<string, string>)[k] = v.trim();
    start(() => router.replace(`${path}${filterQuery(next)}`, { scroll: false }));
  }

  const showCampus = options.campuses.length > 1 || Boolean(filters.campus);
  const showFaculty = options.faculties.length > 1 || Boolean(filters.faculty);
  const narrowed = Boolean(filters.campus || filters.faculty || filters.q || filters.advisor || filters.rm || filters.holder);
  // The search takes twice a select's width on wide screens; every select gets an equal share.
  const selects = 1 + Number(showCampus) + Number(showFaculty) + (byPeople ? 2 : 0);
  const activeSelects = [filters.campus, filters.faculty, filters.advisor, filters.rm, filters.sort && filters.sort !== "wait"].filter(Boolean).length;
  const [open, setOpen] = useState(activeSelects > 0);
  const moreId = useId();

  return (
    <div className="flex flex-col gap-2">
      <form
        role="search"
        aria-label="סינון המכתבים"
        onSubmit={(e) => {
          e.preventDefault();
          go(e.currentTarget);
        }}
        style={{ "--selects": selects } as React.CSSProperties}
        className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line bg-surface-2 p-3 sm:p-4 md:grid-cols-3 lg:[grid-template-columns:minmax(0,2fr)_repeat(var(--selects),minmax(0,1fr))]"
      >
        {filters.g && <input type="hidden" name="g" value={filters.g} />}
        {filters.holder && <input type="hidden" name="holder" value={filters.holder} />}
        <div className={`col-span-2 flex min-w-0 flex-col gap-1 lg:col-span-1 ${selects >= 3 ? "md:col-span-3" : selects === 2 ? "md:col-span-1" : "md:col-span-2"}`}>
          <label htmlFor={searchId} className={labelClass}>
            חיפוש מסלול
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={search}
                id={searchId}
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="שם מסלול או קוד"
                autoComplete="off"
                enterKeyHint="search"
                className={`${input} ps-9`}
                onChange={(e) => {
                  const form = e.currentTarget.form;
                  clearTimeout(timer.current);
                  timer.current = setTimeout(() => form && go(form), 350);
                }}
              />
            </div>
            {/* Phones: the selects fold away behind one button, so the letters come sooner. */}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={moreId}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold md:hidden"
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              סינון
              {activeSelects > 0 && <span className="tabular grid size-5 place-items-center rounded-full bg-accent text-xs text-accent-fg">{activeSelects}</span>}
            </button>
          </div>
        </div>
        <div id={moreId} className={`${open ? "grid" : "hidden"} col-span-2 grid-cols-2 gap-3 md:contents`}>
          {showCampus && <Select label="קמפוס" name="campus" value={filters.campus} options={options.campuses} all="כל הקמפוסים" />}
          {showFaculty && <Select label="פקולטה" name="faculty" value={filters.faculty} options={options.faculties} all="כל הפקולטות" />}
          {byPeople && <Select label="יועצת" name="advisor" value={filters.advisor} options={options.advisors} all="כל היועצות" />}
          {byPeople && <Select label="מנהל רישום" name="rm" value={filters.rm} options={options.managers} all="כל מנהלי הרישום" />}
          <Select label="מיון" name="sort" value={filters.sort} options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))} />
        </div>
        <button className="sr-only">החל סינון</button>
      </form>

      {(narrowed || pending) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {holderName && (
            <Link
              href={`${path}${filterQuery(filters, { holder: undefined })}`}
              scroll={false}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 font-semibold text-accent hover:bg-accent-soft/70"
              aria-label={`הסר סינון: אצל ${holderName}`}
            >
              אצל {holderName}
              <X aria-hidden className="size-3.5" />
            </Link>
          )}
          {narrowed && (
            <Link
              href={`${path}${filterQuery({ g: filters.g, sort: filters.sort })}`}
              scroll={false}
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 font-semibold text-muted hover:bg-accent-soft hover:text-fg"
            >
              <X aria-hidden className="size-4" />
              נקה סינון
            </Link>
          )}
          {pending && (
            <span className="inline-flex items-center gap-1.5 text-muted" role="status">
              <Spinner />
              מעדכן…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
