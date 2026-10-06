"use client";

import { CircleCheck, FileText, Hourglass, Mail, MessageSquare, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { btnGood, btnSecondary } from "@/components/ui";
import type { RoomComment } from "@/lib/letters/queries";
import { myDrafts, plural, shortName, type RoomProps } from "@/lib/room/view";
import { CommentsPanel, type DraftMark } from "./CommentsPanel";
import { DecideDialog, type DecideTarget } from "./DecideDialog";
import { Toaster } from "./Toast";
import { Viewer, type DrawResult, type ReviewComment } from "./Viewer";

const DRAFT_ID = "__draft__";

/**
 * The academic approver's page, opened from a personal link: no menus and no management. The
 * letter, its comments, and two buttons: "אשר" and "בקש תיקון".
 */
export function AcademicRoom({ room }: { room: RoomProps }) {
  const latest = room.versions[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<DraftMark | null>(null);
  const [decide, setDecide] = useState<DecideTarget | null>(null);
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const seat = room.can.decide.find((d) => d.seat.startsWith("ACADEMIC:")) ?? null;
  const me = room.academics.find((a) => a.userId === room.me.id);
  const drafts = myDrafts(room.comments, room.me.id).length;
  const advisor = shortName(room.advisorName);
  const numbers = useMemo(() => new Map(room.comments.map((c, i) => [c.id, i + 1])), [room.comments]);

  const boxes: ReviewComment[] = useMemo(() => {
    const list: ReviewComment[] = room.comments
      .filter((c) => c.versionNumber === latest?.number)
      .map((c) => ({ id: c.id, page: c.page, x: c.x, y: c.y, width: c.width, height: c.height, status: c.status, label: String(numbers.get(c.id)) }));
    if (draft) list.push({ ...draft.anchor, id: DRAFT_ID, status: "OPEN", label: "חדשה" });
    return list;
  }, [room.comments, numbers, draft, latest?.number]);

  function onDraw(result: DrawResult) {
    setDraft({ ...result, previewUrl: URL.createObjectURL(result.snapshot) });
    setDrawMode(false);
  }

  let status: React.ReactNode;
  if (seat) {
    status = (
      <>
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-bold">המכתב ממתין להחלטה שלך</p>
          <p className="text-xs text-muted sm:text-sm">
            {drafts > 0 ? `כתבת ${plural(drafts, "הערה אחת", "הערות")}. ${drafts === 1 ? "היא תישלח" : "הן יישלחו"} עם ההחלטה.` : "אפשר לסמן אזור במכתב ולהעיר, ואז להחליט."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGood} onClick={() => setDecide({ seat: seat.seat, kind: "APPROVED", onBehalfOf: null })}>
            <CircleCheck aria-hidden className="size-4" />
            אשר
          </button>
          <button type="button" className={btnSecondary} onClick={() => setDecide({ seat: seat.seat, kind: "CHANGES", onBehalfOf: null })}>
            <Undo2 aria-hidden className="size-4" />
            בקש תיקון
          </button>
        </div>
      </>
    );
  } else if (me?.decision === "APPROVED") {
    status = (
      <p className="flex items-center gap-2 font-bold text-good">
        <CircleCheck aria-hidden className="size-5" />
        תודה, האישור שלך התקבל. אין צורך בפעולה נוספת.
      </p>
    );
  } else if (me?.decision === "CHANGES") {
    status = (
      <p className="flex items-center gap-2 font-bold text-warn">
        <Undo2 aria-hidden className="size-5" />
        בקשת התיקון נשלחה ל{advisor}. אם יידרש, תקבל/י קישור לבדיקה חוזרת.
      </p>
    );
  } else {
    status = (
      <p className="flex items-center gap-2 font-semibold text-muted">
        <Hourglass aria-hidden className="size-5" />
        {room.state === "FIXING" ? `המכתב בתיקון אצל ${advisor}. אין צורך בפעולה ממך כרגע.` : "אין צורך בפעולה ממך כרגע."}
      </p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 pb-40 lg:pb-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-acad">מכתב קבלה לבדיקתך</p>
        <h1 className="text-xl font-bold leading-tight text-balance sm:text-2xl">{room.trackName}</h1>
        <p className="text-sm text-muted">
          <span className="tabular" dir="ltr">
            {room.trackNumber}
          </span>{" "}
          · {room.campus} · {room.faculty}
          {latest ? ` · גרסה ${latest.number}` : ""}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Mail aria-hidden className="size-4" />
          נכנסת בתור <b className="text-fg">{room.me.name}</b> · נשלח אליך על ידי {advisor}
        </p>
      </header>

      <section
        aria-label="ההחלטה שלך"
        className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-t-2 border-acad/50 bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-pop backdrop-blur lg:sticky lg:top-2 lg:rounded-xl lg:border-2 lg:bg-surface lg:py-3 lg:shadow-card"
      >
        {status}
      </section>

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <section aria-label="המכתב" id="room-letter" className="min-w-0">
          {latest ? (
            <Viewer
              className="h-[calc(100dvh-8rem)] min-h-[420px] overflow-hidden rounded-xl border border-line bg-bg lg:h-[calc(100dvh-9rem)]"
              src={`/api/versions/${latest.id}/pdf`}
              versionNumber={latest.number}
              comments={boxes}
              selectedId={selectedId}
              onSelect={(id) => id !== DRAFT_ID && setSelectedId(id)}
              canDraw={room.can.comment}
              drawMode={drawMode}
              onDrawModeChange={setDrawMode}
              onDraw={onDraw}
              showResolved={Boolean(selectedId)}
            />
          ) : (
            <EmptyState icon={FileText} title="אין עדיין קובץ להצגה" />
          )}
        </section>
        <section aria-labelledby="acad-comments" className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-card lg:order-first lg:sticky lg:top-24">
          <h2 id="acad-comments" className="flex items-center gap-2 font-bold">
            <MessageSquare aria-hidden className="size-5 text-muted" />
            הערות
          </h2>
          <CommentsPanel
            letterId={room.id}
            meId={room.me.id}
            comments={room.comments}
            numbers={numbers}
            selectedId={selectedId}
            onSelect={(c: RoomComment) => {
              setSelectedId(c.id);
              if (!desktop) document.getElementById("room-letter")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            draft={draft}
            onDraftDone={() => setDraft(null)}
            onStartMark={() => {
              setDrawMode(true);
              if (!desktop) document.getElementById("room-letter")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            can={{ comment: room.can.comment && Boolean(latest), handle: false, reopenAny: false, closed: room.phase === "APPROVED" }}
            draftNotice={seat ? "ההערה נשמרת כטיוטה, ותישלח כשתלחצו \"אשר\" או \"בקש תיקון\"." : "ההערה תישלח מיד."}
            isDesktop={desktop}
          />
        </section>
      </div>

      <DecideDialog target={decide} onClose={() => setDecide(null)} letterId={room.id} drafts={drafts} advisor={advisor} />
      <Toaster />
    </div>
  );
}
