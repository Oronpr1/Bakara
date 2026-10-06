"use client";

import { CalendarRange } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { switchSeasonAction } from "@/app/(app)/actions";

/** The season picker in the header. Choosing a season moves the whole system to it. */
export function SeasonSwitcher({
  seasons,
  currentId,
}: {
  seasons: { id: string; name: string; archived: boolean }[];
  currentId: string;
}) {
  const path = usePathname();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={switchSeasonAction} className="flex items-center gap-1.5">
      <input type="hidden" name="from" value={path} />
      <label className="flex items-center gap-1.5 text-sm">
        <CalendarRange aria-hidden className="size-4 text-brand-fg/70" />
        <span className="sr-only">עונת רישום</span>
        <select
          name="seasonId"
          defaultValue={currentId}
          onChange={() => form.current?.requestSubmit()}
          className="min-h-9 cursor-pointer rounded-md border border-brand-fg/25 bg-brand-fg/10 px-2 text-sm font-semibold text-brand-fg"
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id} className="text-fg">
              {s.name}
              {s.archived ? " (ארכיון)" : ""}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
