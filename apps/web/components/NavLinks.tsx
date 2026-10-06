"use client";

import { Building2, CalendarRange, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = { home: Inbox, seasons: CalendarRange, units: Building2, users: Users };

/** The main navigation, marking the section the user is in (aria-current + underline). */
export function NavLinks({ items }: { items: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/seasons" && path.startsWith("/letters/"));
  return (
    <ul className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((n) => {
        const Icon = ICONS[n.icon];
        const active = isActive(n.href);
        return (
          <li key={n.href} className="shrink-0">
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors duration-150 ${
                active ? "border-brand-fg text-brand-fg" : "border-transparent text-brand-fg/70 hover:text-brand-fg"
              }`}
            >
              <Icon aria-hidden className="size-4" />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
