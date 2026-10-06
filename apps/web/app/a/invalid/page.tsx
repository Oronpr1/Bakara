import { LinkIcon } from "lucide-react";
import { RequestLink } from "./RequestLink";

export const metadata = { title: "הקישור לא תקף · מכתבי קבלה", referrer: "no-referrer" as const };

const SECRET = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * An expired, replaced or wrong personal link. When the link looked real (`?t=`), the visitor can
 * ask for a new one; the advisor and the control manager are told.
 */
export default async function InvalidLinkPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" && SECRET.test(t) ? t : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-pop">
        <span className="grid size-12 place-items-center rounded-full bg-bad-soft text-bad">
          <LinkIcon aria-hidden className="size-6" />
        </span>
        <h1 className="text-xl font-bold">הקישור לא תקף</h1>
        <p className="text-sm text-muted">
          ייתכן שפג תוקפו (הקישור תקף 14 יום), או שנשלח אליך קישור חדש יותר.
          {token ? " אפשר לבקש קישור חדש בלחיצה:" : " אפשר לבקש מאיש הקשר שלך במחלקת הרישום קישור חדש."}
        </p>
        {token && <RequestLink token={token} />}
      </div>
    </main>
  );
}
