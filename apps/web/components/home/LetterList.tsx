"use client";

import { BellRing, CalendarX2, ChevronLeft, CircleAlert, CircleCheck, MessageSquare, ShieldCheck, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Holder, holderText, StatusChip, Tag } from "@/components/Pills";
import { Spinner } from "@/components/Spinner";
import { btnGood, btnSecondary } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { approveFinalAction, remindLettersAction } from "@/lib/home/actions";
import { finalEligible, type HomeLetter } from "@/lib/home/model";
import { LATE_DAYS } from "./meta";

/** The track name is the row's link; this stretches its hit area over the whole row or card. */
const stretched = "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";
const focusRing = "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-accent";
const checkbox = "relative z-10 size-5 cursor-pointer accent-[var(--accent)]";

function Due({ l }: { l: HomeLetter }) {
  if (!l.dueDate) return null;
  return l.overdue ? (
    <Tag tone="bad" icon={CalendarX2}>
      באיחור · <span className="tabular">{formatDate(l.dueDate)}</span>
    </Tag>
  ) : (
    <span className="text-sm whitespace-nowrap text-muted">
      יעד <span className="tabular">{formatDate(l.dueDate)}</span>
    </span>
  );
}

function Comments({ n }: { n: number }) {
  return n > 0 ? (
    <Tag tone="warn" icon={MessageSquare}>
      <span className="tabular">{n}</span> {n === 1 ? "הערה פתוחה" : "הערות פתוחות"}
    </Tag>
  ) : null;
}

/** One bulk action: a button that sends the selected ids, optionally after a confirmation. */
function BulkButton({
  ids,
  action,
  label,
  icon,
  className,
  confirm,
  onDone,
}: {
  ids: string[];
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  label: string;
  icon: React.ReactNode;
  className: string;
  confirm?: string;
  onDone: (r: ActionResult) => void;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  const [asking, setAsking] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state) onDone(state);
  }, [state, onDone]);
  const send = () => {
    const data = new FormData();
    for (const id of ids) data.append("ids", id);
    startTransition(() => dispatch(data));
  };
  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm) setAsking(true);
        else send();
      }}
    >
      <button className={className} disabled={pending || ids.length === 0}>
        {pending ? <Spinner /> : icon}
        {label}
      </button>
      {confirm && (
        <ConfirmDialog
          open={asking}
          message={confirm}
          confirmLabel={label}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            send();
          }}
        />
      )}
    </form>
  );
}

const plural = (n: number) => (n === 1 ? "מכתב אחד" : `${n} מכתבים`);

/**
 * The letters as a table on wide screens and cards on phones; each opens the letter. When the
 * person can act on several at once (the control manager reminds; the final signer approves),
 * rows get a checkbox and a bar with the bulk actions appears.
 */
export function LetterList({
  items,
  canRemind,
  showManager,
  showAdvisor,
  me,
  empty,
}: {
  items: HomeLetter[];
  /** Bulk reminders (the control manager). */
  canRemind: boolean;
  /** Show the registration manager under the advisor (for the control manager). */
  showManager: boolean;
  /** An advisor looking at her own letters does not need her name on every row. */
  showAdvisor: boolean;
  me: string;
  empty: React.ReactNode;
}) {
  /** "אצלך · 3 ימים" when the letter waits for the viewer alone; otherwise the shared chip. */
  const holder = (l: HomeLetter) =>
    l.holderIds.length === 1 && l.holderIds[0] === me ? (
      <span className={`inline-flex items-center gap-1 text-sm ${l.waitingDays !== null && l.waitingDays >= LATE_DAYS ? "font-semibold text-bad" : "font-semibold text-fg"}`}>
        <UserCheck aria-hidden className="size-4" />
        {["אצלך", holderText([], l.waitingDays)].filter(Boolean).join(" · ")}
      </span>
    ) : (
      <Holder names={l.holderNames} waitingDays={l.waitingDays} late={LATE_DAYS} />
    );
  const people = (l: HomeLetter) =>
    [showAdvisor ? `יועצת: ${l.advisorName}` : null, showManager ? `רישום: ${l.rmNames.length ? l.rmNames.join(", ") : "חסר"}` : null].filter(Boolean).join(" · ");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ActionResult>(null);
  const remindable = (l: HomeLetter) => canRemind && l.canRemind;
  const selectable = (l: HomeLetter) => remindable(l) || finalEligible(l);
  const eligible = useMemo(() => items.filter(selectable), [items, canRemind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ids that left the list (filtered away, or approved meanwhile) drop out of the selection.
  const chosen = eligible.filter((l) => picked.has(l.id));
  const toRemind = chosen.filter(remindable).map((l) => l.id);
  const toApprove = chosen.filter(finalEligible);
  const behalf = [...new Set(toApprove.map((l) => l.finalOnBehalfOf).filter(Boolean))];
  const anySelectable = eligible.length > 0;
  const allOn = anySelectable && chosen.length === eligible.length;

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(eligible.map((l) => l.id)));
  const done = useMemo(
    () => (r: ActionResult) => {
      setResult(r);
      if (r && "ok" in r) setPicked(new Set());
    },
    [],
  );

  if (items.length === 0) return <>{empty}</>;

  const box = (l: HomeLetter) =>
    selectable(l) ? (
      <input
        type="checkbox"
        className={checkbox}
        checked={picked.has(l.id)}
        onChange={() => toggle(l.id)}
        aria-label={`בחירת ${l.trackName} (${l.trackNumber})`}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {result && (
        <p
          role={"error" in result ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-lg p-3 text-sm font-semibold ${"error" in result ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}
        >
          {"error" in result ? <CircleAlert aria-hidden className="mt-0.5 size-4" /> : <CircleCheck aria-hidden className="mt-0.5 size-4" />}
          <span className="flex-1">{"error" in result ? result.error : result.message}</span>
          <button type="button" onClick={() => setResult(null)} aria-label="סגירת ההודעה" className="-m-1 rounded p-1 hover:bg-surface/50">
            <X aria-hidden className="size-4" />
          </button>
        </p>
      )}

      {anySelectable && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted lg:hidden">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-fg">
            <input type="checkbox" className={checkbox} checked={allOn} onChange={toggleAll} />
            בחירת הכול ({eligible.length})
          </label>
        </div>
      )}

      {/* Wide screens: a table. */}
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-xs text-muted">
            <tr>
              {anySelectable && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input type="checkbox" className={checkbox} checked={allOn} onChange={toggleAll} aria-label={`בחירת כל ${plural(eligible.length)} שאפשר לפעול עליהם`} />
                </th>
              )}
              {["מסלול", "קמפוס · פקולטה", ...(showAdvisor || showManager ? [showAdvisor ? "יועצת" : "מנהל רישום"] : []), "מצב", "אצל", "הערות", "יעד"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr
                key={l.id}
                className={`relative border-t border-line transition-colors duration-150 first:border-t-0 hover:bg-accent-soft/40 ${focusRing} has-[a:focus-visible]:-outline-offset-2 ${picked.has(l.id) ? "bg-accent-soft/50" : ""}`}
              >
                {anySelectable && <td className="px-3 py-3 align-top">{box(l)}</td>}
                <td className="px-3 py-3 align-top">
                  <Link href={`/letters/${l.id}`} className={`font-semibold text-accent ${stretched}`}>
                    {l.trackName}
                  </Link>
                  <span className="tabular block text-xs text-muted">{l.trackNumber}</span>
                </td>
                <td className="px-3 py-3 align-top">
                  {l.campus}
                  <span className="block text-xs text-muted">{l.faculty}</span>
                </td>
                {(showAdvisor || showManager) && (
                  <td className="px-3 py-3 align-top">
                    {showAdvisor && <span className="block">{l.advisorName}</span>}
                    {showManager && (
                      <span className={showAdvisor ? "block text-xs text-muted" : "block"}>
                        {showAdvisor && "רישום: "}
                        {l.rmNames.length ? l.rmNames.join(", ") : <span className="font-semibold text-bad">חסר</span>}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-3 align-top">
                  <StatusChip state={l.state} />
                </td>
                <td className="px-3 py-3 align-top">{holder(l)}</td>
                <td className="px-3 py-3 align-top">
                  <Comments n={l.openComments} />
                </td>
                <td className="px-3 py-3 align-top">
                  <Due l={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones and narrow windows: cards. */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {items.map((l) => (
          <li
            key={l.id}
            className={`relative flex gap-3 rounded-xl border bg-surface p-4 shadow-card transition-colors duration-150 hover:border-line-strong ${focusRing} has-[a:focus-visible]:outline-offset-2 ${
              picked.has(l.id) ? "border-accent/60 bg-accent-soft/40" : "border-line"
            }`}
          >
            {anySelectable && <div className="pt-0.5">{box(l)}</div>}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <Link href={`/letters/${l.id}`} className={`font-semibold break-words text-accent ${stretched}`}>
                    {l.trackName}
                  </Link>
                  <span className="text-sm break-words text-muted">
                    <span className="tabular">{l.trackNumber}</span> · {l.campus} · {l.faculty}
                  </span>
                </span>
                <ChevronLeft aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip state={l.state} />
                <Comments n={l.openComments} />
                <Due l={l} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {holder(l)}
                {people(l) && <span className={showManager && l.rmNames.length === 0 ? "text-bad" : ""}>{people(l)}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {chosen.length > 0 && (
        <div
          role="region"
          aria-label="פעולות על המכתבים שנבחרו"
          className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-surface p-3 shadow-pop"
        >
          <p className="me-auto text-sm font-semibold" aria-live="polite">
            נבחרו {plural(chosen.length)}
          </p>
          {toRemind.length > 0 && (
            <BulkButton
              ids={toRemind}
              action={remindLettersAction}
              label={`תזכיר למסומנים (${toRemind.length})`}
              icon={<BellRing aria-hidden className="size-4" />}
              className={btnSecondary}
              onDone={done}
            />
          )}
          {toApprove.length > 0 && (
            <BulkButton
              ids={toApprove.map((l) => l.id)}
              action={approveFinalAction}
              label={`אשר סופית למסומנים (${toApprove.length})`}
              icon={<ShieldCheck aria-hidden className="size-4" />}
              className={btnGood}
              confirm={`לאשר סופית ${plural(toApprove.length)}? הם יעברו ל"מאושר להפצה", והיועצות יקבלו הודעה.${
                behalf.length ? ` האישור יירשם במקום ${behalf.join(", ")}, ${behalf.length === 1 ? "שיקבל" : "שיקבלו"} הודעה.` : ""
              }`}
              onDone={done}
            />
          )}
          <button type="button" className={btnSecondary} onClick={() => setPicked(new Set())}>
            <X aria-hidden className="size-4" />
            נקה בחירה
          </button>
        </div>
      )}
    </div>
  );
}
