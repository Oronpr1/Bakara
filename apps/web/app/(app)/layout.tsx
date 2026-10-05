import { ROLE_LABELS } from "@al/domain";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            מכתבי קבלה
          </Link>
          <div className="flex items-center gap-4 text-sm">
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
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
