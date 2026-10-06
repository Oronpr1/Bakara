import { canGlobal, ROLE_LABELS } from "@al/domain";
import { LogOut, Mail } from "lucide-react";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { actorOf } from "@/lib/actor";
import { SeasonSwitcher } from "@/components/SeasonSwitcher";
import { requireUser } from "@/lib/auth/session";
import { currentSeason } from "@/lib/season-context";
import { logoutAction } from "./actions";

function initials(name: string) {
  const parts = name.replace(/["'׳״.]/g, "").split(/\s+/).filter((p) => p && !/^(ד"?ר|פרופ)$/.test(p));
  return parts.slice(0, 2).map((p) => p[0]).join("");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { current, seasons } = await currentSeason();
  const actor = actorOf(user);
  const linkOnly = Boolean(user.linkLetterId); // opened from a personal email link: one letter, no menu
  const homeLabel = actor.roles.includes("CONTROL_MANAGER") ? "מגדל פיקוח" : actor.roles.some((r) => r === "VP_REGISTRATION" || r === "REGISTRATION_MANAGER") ? "ממתין לי" : "המכתבים שלי";
  const manage = canGlobal(actor, "MANAGE_UNITS") || canGlobal(actor, "MANAGE_USERS") || canGlobal(actor, "MANAGE_SEASONS");
  const nav = linkOnly
    ? []
    : [
        { href: "/", label: homeLabel, icon: "home" as const },
        ...(manage ? [{ href: "/settings", label: "הגדרות", icon: "settings" as const }] : []),
      ];
  const roles = user.roles.map((r) => ROLE_LABELS[r]).join(", ");
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        דלג לתוכן
      </a>
      <header className="bg-brand text-brand-fg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <span className="grid size-8 place-items-center rounded-md bg-brand-fg/15">
              <Mail aria-hidden className="size-4" />
            </span>
            <span className="text-lg font-bold">מכתבי קבלה</span>
          </Link>
          <div className="flex items-center gap-3">
            {current && !linkOnly && (
              <SeasonSwitcher
                seasons={seasons.map((s) => ({ id: s.id, name: s.name, archived: s.status === "ARCHIVED" }))}
                currentId={current.id}
              />
            )}
            <span className="hidden flex-col items-end leading-tight sm:flex">
              <span className="text-sm font-semibold">{user.name}</span>
              <span className="text-xs text-brand-fg/70">{roles}</span>
            </span>
            <span
              aria-hidden
              title={`${user.name} · ${roles}`}
              className="grid size-9 place-items-center rounded-full bg-brand-fg/15 text-sm font-bold"
            >
              {initials(user.name)}
            </span>
            <form action={logoutAction}>
              <button
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-brand-fg/80 transition-colors duration-150 hover:bg-brand-fg/10 hover:text-brand-fg"
                aria-label={`יציאה (${user.name})`}
                title="יציאה"
              >
                <LogOut aria-hidden className="size-5 rtl:-scale-x-100" />
              </button>
            </form>
          </div>
        </div>
        {nav.length > 0 ? (
          <nav aria-label="ניווט ראשי" className="mx-auto max-w-6xl px-2 sm:px-3">
            <NavLinks items={nav} />
          </nav>
        ) : (
          <div className="h-3" />
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
