"use client";

import { CircleCheck, Clock3, Hourglass, Layers, Link2Off, Mail, SendHorizontal, Trash2, TriangleAlert, Undo2, UserRound } from "lucide-react";
import { useState } from "react";
import { Tag } from "@/components/Pills";
import { btnQuiet, btnSecondary } from "@/components/ui";
import { removeAcademicAction, retractAction } from "@/app/(app)/letters/[id]/actions";
import type { RoomAcademic, RoomSeat } from "@/lib/letters/queries";
import type { AcademicChoice } from "@/lib/room/queries";
import { eventText, joinNames, relativeDay, shortName, type RoomProps } from "@/lib/room/view";
import { QuickAction } from "./Dialog";
import { ReissueLink, SendToAcademicDialog } from "./SendToAcademic";

/** Who is on the track, who decided what on which version, who is waiting, and the academic approvers. */
export function PeoplePanel({
  room,
  choices,
  onShowVersions,
}: {
  room: RoomProps;
  choices: { suggested: AcademicChoice[]; others: AcademicChoice[] };
  onShowVersions: () => void;
}) {
  const [sending, setSending] = useState(false);
  const extraAdvisors = room.extraPeople.filter((p) => p.kind === "ADVISOR").map((p) => p.name);
  const commenters = room.extraPeople.filter((p) => p.kind === "COMMENTER").map((p) => p.name);
  const currentSeats = new Set(room.seats.map((s) => s.key));
  // Decisions of earlier steps (the seats of the current step are shown above them).
  const earlier = room.history.filter((e) => {
    if (e.type !== "APPROVED" && e.type !== "RETURNED" && e.type !== "APPROVAL_RETRACTED") return false;
    return !currentSeats.has(String(e.data.seat ?? "") as RoomSeat["key"]);
  });
  const showAcademics = room.phase === "ACADEMIC" || room.academics.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2" aria-labelledby="ppl-team">
        <h3 id="ppl-team" className="text-sm font-bold text-muted">
          במסלול
        </h3>
        <dl className="flex flex-col divide-y divide-line rounded-lg border border-line">
          <Row
            label="יועצת"
            value={room.advisorId ? joinNames([room.advisorName, ...extraAdvisors]) : extraAdvisors.length ? joinNames(extraAdvisors) : "לא שויכה"}
            warn={!room.advisorId && extraAdvisors.length === 0}
          />
          <Row
            label="מנהל רישום"
            value={room.managerNames.length ? joinNames(room.managerNames) : "לא שויך"}
            warn={room.managerNames.length === 0}
          />
          {commenters.length > 0 && <Row label="מעירים (בלי אישור)" value={joinNames(commenters)} />}
        </dl>
      </section>

      {/* The academic step is shown once, with the links, in the section below. */}
      {room.phase !== "ACADEMIC" && (
        <section className="flex flex-col gap-2" aria-labelledby="ppl-now">
          <h3 id="ppl-now" className="text-sm font-bold text-muted">
            {room.phase === "DRAFT" ? "מי יבדוק" : room.phase === "REVIEW" ? "הבדיקה" : "האישור הסופי"}
          </h3>
          {room.seats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-2 p-3 text-sm text-muted">
              {room.phase === "DRAFT"
                ? room.managerNames.includes(room.advisorName)
                  ? 'אחרי השליחה לבדיקה: הסמנכ"ל. שלב מנהל הרישום מאושר בהגשה.'
                  : `אחרי השליחה לבדיקה: ${room.managerNames.length ? `${joinNames(room.managerNames.map(shortName))}, ואחר כך ` : ""}הסמנכ"ל.`
                : "אין החלטות בשלב הזה."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {room.seats.map((s) => (
                <SeatRow key={s.key} seat={s} room={room} onShowVersions={onShowVersions} />
              ))}
            </ul>
          )}
        </section>
      )}

      {showAcademics && (
        <section className="flex flex-col gap-2" aria-labelledby="ppl-acad">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="ppl-acad" className="text-sm font-bold text-muted">
              {room.academics.length > 1 ? "הגורמים האקדמיים" : "הגורם האקדמי"}
            </h3>
            {room.can.sendToAcademic && (
              <button type="button" className={btnSecondary} onClick={() => setSending(true)}>
                <SendHorizontal aria-hidden className="size-4" />
                {room.academics.length ? "הוסף גורם אקדמי" : "שלח לגורם אקדמי"}
              </button>
            )}
          </div>
          {room.academics.length === 0 ? (
            <p className="text-sm text-muted">אין עדיין גורם אקדמי במכתב.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {room.academics.map((a) => (
                <AcademicRow key={a.userId} a={a} room={room} />
              ))}
            </ul>
          )}
        </section>
      )}

      {earlier.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="ppl-earlier">
          <h3 id="ppl-earlier" className="text-sm font-bold text-muted">
            החלטות בשלבים קודמים
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {earlier.map((e) => {
              const t = eventText(e, room.names);
              if (!t) return null;
              return (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                  {e.type === "APPROVED" ? (
                    <CircleCheck aria-hidden className="size-3.5 self-center text-good" />
                  ) : (
                    <Undo2 aria-hidden className="size-3.5 self-center text-bad" />
                  )}
                  <span className="font-semibold">{t.who}</span>
                  <span>{t.text}</span>
                  <span className="text-xs text-muted">{relativeDay(e.at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SendToAcademicDialog
        open={sending}
        onClose={() => setSending(false)}
        letterId={room.id}
        trackName={room.trackName}
        choices={choices}
        title={room.academics.length ? "הוספת גורם אקדמי" : "שליחה לגורם אקדמי"}
      />
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <dt className="flex items-center gap-1.5 text-muted">
        <UserRound aria-hidden className="size-4" />
        {label}
      </dt>
      <dd className={`font-semibold ${warn ? "text-bad" : ""}`}>{value}</dd>
    </div>
  );
}

function SeatRow({ seat, room, onShowVersions }: { seat: RoomSeat; room: RoomProps; onShowVersions: () => void }) {
  // Once the letter is approved for distribution the way back is "פתח מחדש", not taking back a signature.
  const mine = room.can.retract.includes(seat.key) && room.phase !== "APPROVED";
  const who = seat.decidedByName ? shortName(seat.decidedByName) : null;
  const behalf = seat.onBehalfOfName ? ` (במקום ${shortName(seat.onBehalfOfName)})` : "";
  const holders = seat.role === "ACADEMIC" ? "" : joinNames(seat.holderNames.map(shortName));

  let status: React.ReactNode;
  if (seat.status === "approved") {
    status = seat.auto ? (
      <Tag tone="good" icon={CircleCheck}>
        אושר בהגשה
      </Tag>
    ) : (
      <Tag tone="good" icon={CircleCheck}>
        אישר · גרסה {seat.decidedVersion}
      </Tag>
    );
  } else if (seat.status === "returned") {
    status = (
      <Tag tone="bad" icon={Undo2}>
        החזיר לתיקון · גרסה {seat.decidedVersion}
      </Tag>
    );
  } else if (seat.turn === "now") {
    status = (
      <Tag tone="accent" icon={Hourglass}>
        ממתין עכשיו
      </Tag>
    );
  } else {
    status = (
      <Tag tone="muted" icon={Clock3}>
        אחר כך
      </Tag>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{seat.label}</p>
          {holders && <p className="text-xs text-muted">{holders}</p>}
        </div>
        {status}
      </div>
      {seat.auto && <p className="text-xs text-muted">היועצת היא גם מנהלת הרישום של המסלול, ולכן השלב שלה אושר בהגשה.</p>}
      {seat.decidedAt && !seat.auto && (
        <p className="text-xs text-muted">
          {/* Who pressed the button only when it was not the seat's own holder (a stand-in). */}
          {who && (behalf || !seat.holderNames.some((n) => shortName(n) === who)) ? `${who}${behalf} · ` : ""}
          {relativeDay(seat.decidedAt)}
        </p>
      )}
      {seat.note && <p className="whitespace-pre-wrap rounded-md bg-surface-2 px-2 py-1.5 text-sm">&quot;{seat.note}&quot;</p>}
      {seat.changedSince && (
        <div className="flex flex-col gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          <p className="flex items-start gap-1.5 font-semibold">
            <TriangleAlert aria-hidden className="mt-0.5 size-4" />
            יש גרסה חדשה מאז {mine ? "שאישרת" : "האישור"} (גרסה {seat.decidedVersion} ← {room.latestVersion}).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`${btnQuiet} bg-surface text-accent hover:border-accent hover:text-accent`} onClick={onShowVersions}>
              <Layers aria-hidden className="size-4" />
              מה השתנה
            </button>
            {mine && (
              <QuickAction
                action={retractAction}
                hidden={{ letterId: room.id, seat: seat.key }}
                label="בטל את האישור שלי"
                icon={<Undo2 aria-hidden className="size-4" />}
                className={`${btnQuiet} bg-surface`}
                confirm={{ message: "לבטל את האישור שלך? המכתב יחזור אליך לבדיקה, ואפשר יהיה לאשר שוב או להחזיר לתיקון.", label: "בטל את האישור" }}
              />
            )}
          </div>
        </div>
      )}
      {!seat.changedSince && mine && seat.status === "approved" && (
        <QuickAction
          action={retractAction}
          hidden={{ letterId: room.id, seat: seat.key }}
          label="בטל את האישור שלי"
          icon={<Undo2 aria-hidden className="size-4" />}
          className={`${btnQuiet} self-start`}
          confirm={{ message: "לבטל את האישור שלך? המכתב יחזור אליך לבדיקה.", label: "בטל את האישור" }}
        />
      )}
    </li>
  );
}

function AcademicRow({ a, room }: { a: RoomAcademic; room: RoomProps }) {
  const link =
    a.link === "active" ? (
      <Tag tone="good">קישור פעיל</Tag>
    ) : a.link === "expired" ? (
      <Tag tone="bad" icon={Link2Off}>
        הקישור פג
      </Tag>
    ) : (
      <Tag tone="muted">אין קישור</Tag>
    );
  const decision =
    a.decision === "APPROVED" ? (
      <Tag tone="good" icon={CircleCheck}>
        אישר
      </Tag>
    ) : a.decision === "CHANGES" ? (
      <Tag tone="bad" icon={Undo2}>
        ביקש תיקון
      </Tag>
    ) : room.phase === "ACADEMIC" ? (
      <Tag tone="accent" icon={Hourglass}>
        ממתין
      </Tag>
    ) : null;
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{a.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted" dir="ltr">
            <Mail aria-hidden className="size-3.5" />
            {a.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {decision}
          {link}
        </div>
      </div>
      <p className="text-xs text-muted">{a.lastOpenedAt ? `פתח את הקישור ${relativeDay(a.lastOpenedAt)}` : "עוד לא פתח את הקישור"}</p>
      {room.can.sendToAcademic && (
        <div className="flex flex-col gap-1 border-t border-line pt-1.5">
          <ReissueLink letterId={room.id} userId={a.userId} name={a.name} trackName={room.trackName} />
          <QuickAction
            action={removeAcademicAction}
            hidden={{ letterId: room.id, userId: a.userId }}
            label="הסר"
            icon={<Trash2 aria-hidden className="size-4" />}
            className={`${btnQuiet} self-start`}
            ariaLabel={`הסר את ${a.name} מהמכתב`}
            confirm={{ message: `להסיר את ${a.name} מהמכתב? הקישור שלו יפסיק לעבוד.`, label: "הסר" }}
          />
        </div>
      )}
    </li>
  );
}
