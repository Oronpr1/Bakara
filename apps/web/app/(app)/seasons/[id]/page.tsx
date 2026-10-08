import { ArrowRightLeft, CalendarRange } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { switchSeasonAction } from "@/app/(app)/actions";
import { EmptyState } from "@/components/EmptyState";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { currentSeason } from "@/lib/season-context";

/**
 * The old season dashboard now lives on the home screen. A link to the current season goes
 * straight home; a link to another season asks once whether to move the system to it.
 */
export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const { current, seasons } = await currentSeason();
  const season = seasons.find((s) => s.id === id);
  if (!season) notFound();
  if (current?.id === id) redirect("/");

  return (
    <EmptyState as="h1" icon={CalendarRange} title={`מעבר לעונה ${season.name}`}>
      <p>המערכת עובדת כרגע על {current?.name}. אפשר לעבור לעונה הזאת, וכל המסכים יציגו אותה.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <form action={switchSeasonAction}>
          <input type="hidden" name="seasonId" value={season.id} />
          <input type="hidden" name="from" value="/" />
          <button className={btnPrimary}>
            <ArrowRightLeft aria-hidden className="size-4" />
            עבור לעונה {season.name}
          </button>
        </form>
        <Link href="/" className={btnSecondary}>
          הישאר ב{current?.name}
        </Link>
      </div>
    </EmptyState>
  );
}
