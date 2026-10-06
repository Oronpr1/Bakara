"use client";

import { Building2, CalendarRange, ListChecks, Scale, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsTabKey } from "@/lib/settings/tabs";

const ICONS = { people: Users, tracks: ListChecks, units: Building2, seasons: CalendarRange, rules: Scale } as const;

/** The settings area's own tabs, under the page title. Scrolls sideways on a phone, never the page. */
export function SettingsTabs({ tabs }: { tabs: { key: SettingsTabKey; href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="לשוניות ההגדרות" className="-mx-4 border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = ICONS[t.key];
          const active = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-b-[3px] px-3 text-sm font-semibold transition-colors duration-150 ${
                  active ? "border-accent text-accent" : "border-transparent text-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                <Icon aria-hidden className="size-4" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
