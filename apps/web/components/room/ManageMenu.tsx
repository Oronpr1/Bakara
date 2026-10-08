"use client";

import { Bell, ChevronDown, RefreshCcw, RotateCcw, Settings2, SkipForward, Trash2, UserPlus, UserRoundCog, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TextAreaField } from "@/components/Field";
import { btnDanger, btnQuiet, btnSecondary, input, label } from "@/components/ui";
import {
  addPersonAction,
  changeAdvisorAction,
  remindAction,
  removePersonAction,
  reopenAction,
  resetApprovalsAction,
  skipAcademicAction,
} from "@/app/(app)/letters/[id]/actions";
import { joinNames, shortName, type RoomProps } from "@/lib/room/view";
import { Dialog, DialogForm, QuickAction } from "./Dialog";

type Item = "remind" | "reset" | "skip" | "reopen" | "advisor" | "people";

/** "פעולות ניהול": shown only to someone who has at least one of them. Risky ones ask first. */
export function ManageMenu({ room }: { room: RoomProps }) {
  const { can } = room;
  const [open, setOpen] = useState<Item | null>(null);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasPeople = room.addable.advisors.length + room.addable.commenters.length > 0;
  const items: { key: Item; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: "remind", label: "תזכיר", icon: <Bell aria-hidden className="size-4" />, show: can.remind && room.holderNames.length > 0 },
    { key: "reset", label: "אשרו מחדש", icon: <RefreshCcw aria-hidden className="size-4" />, show: can.resetApprovals },
    { key: "skip", label: "דלג על הגורם האקדמי", icon: <SkipForward aria-hidden className="size-4 rtl:-scale-x-100" />, show: can.skipAcademic },
    { key: "reopen", label: "פתח מחדש", icon: <RotateCcw aria-hidden className="size-4" />, show: can.reopen },
    { key: "advisor", label: "החלף יועצת", icon: <UserRoundCog aria-hidden className="size-4" />, show: can.reassignAdvisor && room.advisors.length > 0 },
    { key: "people", label: "אנשים נוספים במסלול", icon: <Users aria-hidden className="size-4" />, show: hasPeople },
  ];
  const visible = items.filter((i) => i.show);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  if (visible.length === 0) return null;
  const hidden = { letterId: room.id };
  const close = () => setOpen(null);
  const holders = joinNames(room.holderNames.map(shortName));

  return (
    <div ref={ref} className="relative">
      <button type="button" className={btnSecondary} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)}>
        <Settings2 aria-hidden className="size-4" />
        פעולות ניהול
        <ChevronDown aria-hidden className={`size-4 transition-transform duration-150 ${menu ? "rotate-180" : ""}`} />
      </button>
      {menu && (
        <ul role="menu" className="absolute end-0 top-full z-40 mt-1 flex w-64 flex-col rounded-xl border border-line bg-surface p-1 shadow-pop">
          {visible.map((i) => (
            <li key={i.key} role="none">
              <button
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-start text-sm font-semibold hover:bg-accent-soft"
                onClick={() => {
                  setMenu(false);
                  setOpen(i.key);
                }}
              >
                {i.icon}
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open === "remind"} onClose={close} title="תזכורת">
        <DialogForm action={remindAction} onDone={close} hidden={hidden} submitLabel="שלח תזכורת" submitIcon={<Bell aria-hidden className="size-4" />} pendingLabel="שולח…">
          <p className="text-sm">
            תישלח הודעה ל<b>{holders}</b> שהמכתב מחכה{room.waitingDays ? ` כבר ${room.waitingDays === 1 ? "יום" : `${room.waitingDays} ימים`}` : ""}.
          </p>
        </DialogForm>
      </Dialog>

      <Dialog open={open === "reset"} onClose={close} title="אשרו מחדש">
        <DialogForm action={resetApprovalsAction} onDone={close} hidden={hidden} submitLabel="בטל את כל האישורים" submitClassName={btnDanger} submitIcon={<RefreshCcw aria-hidden className="size-4" />}>
          <p className="text-sm">
            כל האישורים שניתנו יבוטלו, והמכתב יחזור לבדיקה מההתחלה. מתאים כשהיה שינוי מהותי במכתב. הכול נשמר בציר הזמן.
          </p>
          <TextAreaField label="מה השתנה? (יירשם ויוצג למבקרים)" name="note" rows={2} maxLength={2000} />
        </DialogForm>
      </Dialog>

      <Dialog open={open === "skip"} onClose={close} title="דילוג על הגורם האקדמי">
        <DialogForm action={skipAcademicAction} onDone={close} hidden={hidden} submitLabel="דלג ועבור לאישור סופי" submitIcon={<SkipForward aria-hidden className="size-4 rtl:-scale-x-100" />}>
          <p className="text-sm">המכתב יעבור ישר לאישור הסופי, בלי גורם אקדמי. זה בסמכותך, וזה יירשם בציר הזמן.</p>
          <TextAreaField label="סיבה (לא חובה)" name="note" rows={2} maxLength={2000} />
        </DialogForm>
      </Dialog>

      <Dialog open={open === "reopen"} onClose={close} title="פתיחה מחדש">
        <DialogForm action={reopenAction} onDone={close} hidden={hidden} submitLabel="פתח מחדש" submitClassName={btnDanger} submitIcon={<RotateCcw aria-hidden className="size-4" />}>
          <p className="text-sm">
            המכתב חוזר לאישור סופי, והסימון &quot;הועלה לגלבוע&quot; מתבטל. אפשר יהיה להעיר, לתקן ולאשר שוב.
          </p>
          <TextAreaField label="למה? (יירשם בציר הזמן)" name="note" rows={2} maxLength={2000} />
        </DialogForm>
      </Dialog>

      <Dialog open={open === "advisor"} onClose={close} title="החלפת יועצת">
        <DialogForm action={changeAdvisorAction} onDone={close} hidden={hidden} submitLabel="החלף" submitIcon={<UserRoundCog aria-hidden className="size-4" />}>
          <p className="text-sm text-muted">היועצת עכשיו: {room.advisorName}. היועצת החדשה תקבל הודעה, והמכתב יעבור לרשימה שלה.</p>
          <label className="flex flex-col gap-1.5">
            <span className={label}>יועצת</span>
            <select name="advisorId" required defaultValue="" className={input}>
              <option value="" disabled>
                בחרו
              </option>
              {room.advisors
                .filter((a) => a.id !== room.advisorId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        </DialogForm>
      </Dialog>

      <Dialog open={open === "people"} onClose={close} title="אנשים נוספים במסלול" wide>
        <PeopleManager room={room} />
      </Dialog>
    </div>
  );
}

/** Another advisor (prepares and fixes like the main one) or a commenter (looks, comments and suggests; approves nothing). */
function PeopleManager({ room }: { room: RoomProps }) {
  const taken = new Set(room.extraPeople.map((p) => `${p.kind}:${p.userId}`));
  const groups = [
    { kind: "ADVISOR" as const, title: "יועצות נוספות", hint: "מכינות ומתקנות כמו היועצת האחראית.", people: room.addable.advisors.filter((p) => p.id !== room.advisorId) },
    {
      kind: "COMMENTER" as const,
      title: "מעירים",
      hint: "רואים את המכתב, מעירים ומציעים הצעות עד האישור הסופי. לא חייבים להגיב או לאשר, והמכתב לא מחכה להם.",
      people: room.addable.commenters.filter((p) => p.id !== room.me.id),
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const current = room.extraPeople.filter((p) => p.kind === g.kind);
        const free = g.people.filter((p) => !taken.has(`${g.kind}:${p.id}`));
        return (
          <section key={g.kind} className="flex flex-col gap-2">
            <h3 className="font-bold">{g.title}</h3>
            <p className="text-sm text-muted">{g.hint}</p>
            {current.length === 0 ? (
              <p className="text-sm text-muted">אין.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {current.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="font-semibold">{p.name}</span>
                    <QuickAction
                      action={removePersonAction}
                      hidden={{ letterId: room.id, userId: p.userId, kind: g.kind }}
                      label="הסר"
                      icon={<Trash2 aria-hidden className="size-4" />}
                      className={btnQuiet}
                      ariaLabel={`הסר את ${p.name} מהמסלול`}
                      confirm={{ message: `להסיר את ${p.name} מהמסלול?`, label: "הסר" }}
                    />
                  </li>
                ))}
              </ul>
            )}
            {free.length > 0 && <AddPerson letterId={room.id} kind={g.kind} people={free} />}
          </section>
        );
      })}
    </div>
  );
}

const WHO = { ADVISOR: ["יועצת להוספה", "בחרו יועצת"], COMMENTER: ["מעיר להוספה", "בחרו מעיר"] } as const;

function AddPerson({ letterId, kind, people }: { letterId: string; kind: "ADVISOR" | "COMMENTER"; people: { id: string; name: string }[] }) {
  const [userId, setUserId] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="sr-only">{WHO[kind][0]}</span>
        <select value={userId} onChange={(e) => setUserId(e.currentTarget.value)} className={input}>
          <option value="">{WHO[kind][1]}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <QuickAction
        key={userId}
        action={addPersonAction}
        hidden={{ letterId, userId, kind }}
        label="הוסף"
        icon={<UserPlus aria-hidden className="size-4" />}
        disabled={!userId}
      />
    </div>
  );
}
