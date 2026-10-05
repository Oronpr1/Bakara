import { Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "כניסה · מכתבי קבלה" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex flex-col gap-3 bg-brand px-7 pt-7 pb-6 text-brand-fg">
          <span className="grid size-11 place-items-center rounded-lg bg-brand-fg/15">
            <Mail aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">מכתבי קבלה</h1>
            <p className="text-sm text-brand-fg/80">הכנה, הערות ואישורים של מכתבי הקבלה, לפי עונת רישום.</p>
          </div>
        </div>
        <div className="p-7">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
