import { canGlobal } from "@al/domain";
import { CalendarPlus, ChevronLeft, CircleCheck, FilePlus2, FileSpreadsheet, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Disclosure } from "@/components/settings/Disclosure";
import { ImportPanel } from "@/components/settings/ImportPanel";
import { NewTrackForm } from "@/components/settings/NewTrackForm";
import { TracksBoard } from "@/components/settings/TracksBoard";
import { btnPrimary, card, summary as summaryClass } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { currentSeason } from "@/lib/season-context";
import { getTrackBoard, seasonFacts } from "@/lib/settings/queries";
import { canOpenTab } from "@/lib/settings/tabs";
import { bulkAssignAction, createTrackAction, importTracksAction, removeExtraAction } from "./actions";

export const metadata = { title: "מסלולים והקצאות · הגדרות · מכתבי קבלה" };

export default async function TracksSettingsPage({ searchParams }: { searchParams: Promise<{ opened?: string }> }) {
  const actor = actorOf(await requireUser());
  if (!canOpenTab(actor, "tracks")) notFound();
  const { current, seasons } = await currentSeason();

  if (!current)
    return (
      <EmptyState
        icon={CalendarPlus}
        title="עוד אין עונה"
        as="h2"
        action={
          canOpenTab(actor, "seasons") ? (
            <Link href="/settings/seasons" className={btnPrimary}>
              <CalendarPlus aria-hidden className="size-4" />
              לפתיחת עונה
            </Link>
          ) : undefined
        }
      >
        מסלולים שייכים לעונה. קודם פותחים עונה (בלשונית &quot;עונות&quot;), ואז מקימים בה מסלולים או מייבאים אותם מקובץ.
      </EmptyState>
    );

  const [board, facts] = await Promise.all([getTrackBoard(actor, current.id), seasonFacts()]);
  const opened = (await searchParams).opened === current.id;
  const source = current.sourceSeasonId ? seasons.find((s) => s.id === current.sourceSeasonId) : undefined;
  const canCreate = canGlobal(actor, "CREATE_LETTER_REQUEST");
  const empty = board.tracks.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">מסלולים והקצאות</h2>
        <p className="text-sm text-muted">
          עונה: <b className="text-fg">{current.name}</b>
          {source && <> · נפתחה על בסיס {source.name}</>}. מחליפים עונה בראש המסך.
        </p>
      </div>

      {opened && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-good/40 bg-good-soft px-3 py-2.5 text-sm">
          <CircleCheck aria-hidden className="mt-0.5 size-4 text-good" />
          <span>
            <b>העונה {current.name} נפתחה, והמערכת עברה אליה.</b>{" "}
            {source
              ? `הועתקו ${board.tracks.length} מתוך ${source.letterCount} המסלולים של ${source.name}${
                  board.tracks.length < source.letterCount ? " (מסלול בלי יועצת פעילה לא הועתק: אפשר להקים אותו כאן)" : ""
                }. עכשיו בודקים שלכל מסלול יש יועצת ומנהל רישום.`
              : "עכשיו מקימים מסלולים: אחד אחד או מקובץ."}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        {canCreate && (
          <details className={`${card} group flex flex-col`}>
            <summary className={`${summaryClass} text-base`}>
              <ChevronLeft aria-hidden className="chev size-4" />
              <FilePlus2 aria-hidden className="size-5" />
              הקמת מסלול אחד
            </summary>
            <div className="mt-4">
              <NewTrackForm
                action={createTrackAction}
                seasonId={current.id}
                campuses={board.campuses}
                faculties={board.faculties}
                advisors={board.advisors}
              />
            </div>
          </details>
        )}
        <Disclosure
          key={current.id}
          className={`${card} group flex flex-col`}
          defaultOpen={empty}
          summary={
            <summary className={`${summaryClass} text-base`}>
              <ChevronLeft aria-hidden className="chev size-4" />
              <FileSpreadsheet aria-hidden className="size-5" />
              ייבוא מסלולים מקובץ
            </summary>
          }
        >
          <div className="mt-4">
            <ImportPanel action={importTracksAction} seasonId={current.id} seasonName={current.name} />
          </div>
        </Disclosure>
      </div>

      {empty ? (
        <EmptyState icon={ListChecks} title={`אין עדיין מסלולים בעונה ${current.name}`}>
          מייבאים את רשימת המסלולים מקובץ Excel, או מקימים מסלול אחד בטופס למעלה.
          {facts.sampleCode.size > 0 && canOpenTab(actor, "seasons") && (
            <>
              {" "}
              אפשר גם לפתוח עונה חדשה{" "}
              <Link href="/settings/seasons" className="font-semibold text-accent underline">
                על בסיס עונה קודמת
              </Link>
              , עם כל המסלולים שלה.
            </>
          )}
        </EmptyState>
      ) : (
        <section aria-labelledby="tracks-table" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 id="tracks-table" className="text-lg font-bold">
              מי אחראי על כל מסלול
            </h3>
            <p className="text-sm text-muted">
              בוחרים מסלולים (למשל מחפשים &quot;MBA&quot; ובוחרים את כולם) ומקצים להם יועצת, מנהל רישום או אנשים נוספים בבת אחת. מנהל הרישום מגיע מהפקולטה,
              ואם אין לה, מהקמפוס; מנהל רישום שנקבע למסלול גובר על שניהם.
            </p>
          </div>
          <TracksBoard
            tracks={board.tracks}
            advisors={board.advisors}
            managers={board.managers}
            bulkAction={bulkAssignAction}
            removeAction={removeExtraAction}
          />
        </section>
      )}
    </div>
  );
}
