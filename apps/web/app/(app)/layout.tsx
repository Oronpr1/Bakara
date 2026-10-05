import { canGlobal, ROLE_LABELS } from "@al/domain";
import Link from "next/link";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = [
    { href: "/", label: "העבודה שלי" },
    { href: "/seasons", label: "עונות רישום" },
    ...(canGlobal(actorOf(user), "MANAGE_USERS") ? [{ href: "/admin/users", label: "משתמשים" }] : []),
  ];
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-10 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        דלג לתוכן
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link href="/" className="text-lg font-bold">
              מכתבי קבלה
            </Link>
            <nav aria-label="ניווט ראשי">
              <ul className="flex flex-wrap gap-x-4 text-sm">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="text-muted hover:text-fg">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="font-semibold">{user.name}</span>
              <span className="text-muted"> · {user.roles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
            </span>
            <form action={logoutAction}>
              <button className="text-accent underline-offset-4 hover:underline">יציאה</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
