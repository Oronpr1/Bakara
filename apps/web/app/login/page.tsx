import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "כניסה · מכתבי קבלה" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-7 shadow-sm">
        <h1 className="text-2xl font-bold">מכתבי קבלה</h1>
        <p className="mt-1 mb-6 text-sm text-muted">הכנה, הערות ואישורים של מכתבי הקבלה, לפי עונת רישום.</p>
        <LoginForm />
      </div>
    </main>
  );
}
