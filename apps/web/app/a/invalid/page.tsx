import { LinkIcon } from "lucide-react";

export const metadata = { title: "הקישור לא תקף · מכתבי קבלה" };

export default function InvalidLinkPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center shadow-pop">
        <span className="grid size-12 place-items-center rounded-full bg-bad-soft text-bad">
          <LinkIcon aria-hidden className="size-6" />
        </span>
        <h1 className="text-xl font-bold">הקישור לא תקף</h1>
        <p className="text-sm text-muted">
          ייתכן שפג תוקפו או שנשלח אליך קישור חדש יותר. אפשר לבקש מאיש הקשר שלך במחלקת הרישום קישור חדש.
        </p>
      </div>
    </main>
  );
}
