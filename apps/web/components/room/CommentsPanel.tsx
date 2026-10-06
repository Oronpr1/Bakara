"use client";

import { CircleCheck, Eye, EyeOff, Image as ImageIcon, MessageSquare, MessageSquarePlus, PenLine, Reply, RotateCcw, SquareDashedMousePointer, Trash2, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";
import { FormMessage } from "@/components/ActionForm";
import { EmptyState } from "@/components/EmptyState";
import { CommentStatusPill, Tag } from "@/components/Pills";
import { Spinner } from "@/components/Spinner";
import { btnPrimary, btnQuiet, btnSecondary, hint, input, label } from "@/components/ui";
import { commentStatusAction, createCommentAction, deleteDraftAction, replyAction } from "@/app/(app)/letters/[id]/actions";
import type { ActionResult } from "@/lib/action-result";
import type { RoomComment } from "@/lib/letters/queries";
import { formatDateTime } from "@/lib/format";
import { parseSuggestion, plural, relativeDay, shortName } from "@/lib/room/view";
import { Dialog } from "./Dialog";
import { toast } from "./Toast";
import type { MarkResult } from "./Viewer";

export type DraftMark = MarkResult & { previewUrl: string };

const KIND_WORDS = { NOTE: "פתק", X: "סימון X", LINE: "קו" } as const;

export interface CommentAbilities {
  /** May write new comments and replies. */
  comment: boolean;
  /** Mark "תוקן" / "לא מקובל" (the advisor, or the control manager). */
  handle: boolean;
  /** May reopen a resolved comment written by someone else (the control manager). */
  reopenAny: boolean;
  /** The letter is approved: comments are closed. */
  closed: boolean;
}

/** The comments: open first, each with who, version, text, the suggested wording, the marked area, the thread. */
export function CommentsPanel({
  letterId,
  meId,
  comments,
  numbers,
  selectedId,
  onSelect,
  draft,
  onDraftDone,
  onStartMark,
  can,
  draftNotice,
  isDesktop,
}: {
  letterId: string;
  meId: string;
  comments: RoomComment[];
  numbers: Map<string, number>;
  selectedId: string | null;
  onSelect: (c: RoomComment) => void;
  draft: DraftMark | null;
  onDraftDone: () => void;
  onStartMark: () => void;
  can: CommentAbilities;
  /** What happens to a new comment: kept as a draft, or published at once (and to whom). */
  draftNotice: string;
  isDesktop: boolean;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const open = comments.filter((c) => c.status === "OPEN");
  const resolved = comments.filter((c) => c.status !== "OPEN");
  const visible = [...open, ...(showResolved ? resolved : [])];

  const form = draft && (
    <NewCommentForm key={draft.previewUrl} letterId={letterId} draft={draft} onDone={onDraftDone} notice={draftNotice} />
  );

  return (
    <div className="flex flex-col gap-3">
      {draft && isDesktop && form}
      {draft && !isDesktop && (
        <Dialog open onClose={onDraftDone} title={`הערה חדשה · עמוד ${draft.anchor.page}`}>
          {form}
        </Dialog>
      )}

      {can.comment && !draft && (
        <button type="button" onClick={onStartMark} className={`${btnSecondary} w-full justify-start text-start`}>
          <SquareDashedMousePointer aria-hidden className="size-4 text-accent" />
          <span className="flex flex-col leading-tight">
            סמנו אזור במכתב להערה
            <span className="text-xs font-normal text-muted">גוררים מסגרת, או מקישים בטלפון</span>
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold">{open.length > 0 ? plural(open.length, "הערה פתוחה אחת", "הערות פתוחות") : ""}</p>
        {resolved.length > 0 && (
          <button type="button" className={`${btnQuiet} hover:border-line-strong hover:text-fg`} onClick={() => setShowResolved((v) => !v)} aria-pressed={showResolved}>
            {showResolved ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            {showResolved ? "הסתר הערות שטופלו" : `הצג הערות שטופלו (${resolved.length})`}
          </button>
        )}
      </div>

      {comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="אין הערות עדיין">
          {can.comment ? "מסמנים אזור במכתב (גרירה, או הקשה בטלפון) וכותבים מה לתקן." : "הערות שהמבקרים יסמנו על המכתב יופיעו כאן."}
        </EmptyState>
      ) : visible.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-good-soft p-3 text-sm font-semibold text-good">
          <CircleCheck aria-hidden className="size-4" />
          כל ההערות טופלו.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((c) => (
            <CommentCard
              key={c.id}
              c={c}
              n={numbers.get(c.id) ?? 0}
              letterId={letterId}
              mine={c.authorId === meId}
              selected={c.id === selectedId}
              onSelect={() => onSelect(c)}
              can={can}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewCommentForm({ letterId, draft, onDone, notice }: { letterId: string; draft: DraftMark; onDone: () => void; notice: string }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(createCommentAction, null);
  const [suggest, setSuggest] = useState(false);

  useEffect(() => {
    if (state && "ok" in state) {
      toast(state.message ?? "ההערה נשמרה");
      onDone();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { anchor } = draft;
    form.set("letterId", letterId);
    for (const k of ["versionNumber", "page", "x", "y", "width", "height"] as const) form.set(k, String(anchor[k]));
    form.set("snapshot", new File([draft.snapshot], "snapshot.png", { type: "image/png" }));
    if (draft.kind) form.set("kind", draft.kind);
    if (draft.color) form.set("color", draft.color);
    if (draft.points?.length) form.set("points", JSON.stringify(draft.points));
    startTransition(() => dispatch(form));
  }

  // An X or a line can stand alone (a mark only); a note needs its text.
  const markOnly = draft.kind === "X" || draft.kind === "LINE";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-accent/60 bg-accent-soft/40 p-3" aria-label="הערה חדשה">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {draft.color ? (
            <span aria-hidden className="size-3.5 rounded-full ring-1 ring-line-strong" style={{ background: draft.color }} />
          ) : (
            <MessageSquarePlus aria-hidden className="size-4 text-accent" />
          )}
          {draft.kind ? KIND_WORDS[draft.kind] : "הערה"} חדשה · עמוד {draft.anchor.page}
        </p>
        <button type="button" onClick={onDone} className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface" aria-label="ביטול ההערה">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={draft.previewUrl} alt="האזור שסומן" className="max-h-32 self-start rounded border border-line bg-white" />
      <label className="flex flex-col gap-1.5">
        <span className={label}>{markOnly ? "הסבר (לא חובה)" : "מה צריך לתקן?"}</span>
        <textarea name="body" required={!markOnly} maxLength={4000} rows={3} className={input} autoFocus />
      </label>
      {suggest ? (
        <fieldset className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2.5">
          <legend className="px-1 text-sm font-semibold">הצעה לנוסח</legend>
          <label className="flex flex-col gap-1">
            <span className={hint}>במקום</span>
            <textarea name="from" maxLength={1500} rows={2} className={input} placeholder="הנוסח שכתוב עכשיו" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={hint}>כתבו</span>
            <textarea name="to" maxLength={1500} rows={2} className={input} placeholder="הנוסח המוצע" />
          </label>
        </fieldset>
      ) : (
        <button type="button" onClick={() => setSuggest(true)} className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md text-sm font-semibold text-accent hover:underline">
          <PenLine aria-hidden className="size-4" />
          הוסף הצעה לנוסח: במקום ___ כתבו ___
        </button>
      )}
      <p className={hint}>{notice}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={pending}>
          {pending ? <Spinner /> : <MessageSquarePlus aria-hidden className="size-4" />}
          {pending ? "שומר…" : markOnly ? "שמור סימון" : "שמור הערה"}
        </button>
        <button type="button" className={btnSecondary} onClick={onDone} disabled={pending}>
          ביטול
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function CommentCard({
  c,
  n,
  letterId,
  mine,
  selected,
  onSelect,
  can,
}: {
  c: RoomComment;
  n: number;
  letterId: string;
  mine: boolean;
  selected: boolean;
  onSelect: () => void;
  can: CommentAbilities;
}) {
  const [showArea, setShowArea] = useState(false);
  const [mode, setMode] = useState<null | "reply" | "fixed" | "declined">(null);
  const open = c.status === "OPEN";
  const s = parseSuggestion(c.suggestion);
  const mayReopen = !open && !c.isDraft && !can.closed && (mine || can.reopenAny);
  // Marks of the coming viewer carry a kind and a colour; older comments have neither.
  const mark = c as RoomComment & { kind?: string | null; color?: string | null };
  const markKind = mark.kind === "X" || mark.kind === "LINE" || mark.kind === "NOTE" ? mark.kind : null;

  return (
    <li
      data-comment={c.id}
      className={`flex flex-col gap-2.5 rounded-lg border p-3 transition-colors duration-150 ${
        selected ? "border-accent ring-2 ring-accent/30" : c.isDraft ? "border-dashed border-accent/60" : "border-line"
      } ${open ? "bg-surface" : "bg-surface-2"}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onSelect}
          className={`tabular grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-sm font-bold transition-colors duration-150 ${
            open ? "bg-accent text-accent-fg hover:bg-accent/85" : "bg-surface text-muted ring-1 ring-line-strong hover:bg-accent-soft"
          }`}
          aria-label={`הצג את הערה ${n} במכתב`}
          title="הצג במכתב"
          style={mark.color ? { boxShadow: `0 0 0 3px ${mark.color}` } : undefined}
        >
          {n}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold leading-tight">{shortName(c.authorName)}</span>
          <span className="text-xs text-muted" title={formatDateTime(new Date(c.createdAt))}>
            גרסה {c.versionNumber} · עמוד {c.page} · {relativeDay(c.createdAt)}
          </span>
        </div>
        {c.isDraft ? <Tag tone="accent">טיוטה</Tag> : <CommentStatusPill status={c.status} />}
      </div>

      {c.body ? (
        <p className="whitespace-pre-wrap break-words">{c.body}</p>
      ) : (
        <p className="text-sm text-muted">{markKind === "X" || markKind === "LINE" ? `${KIND_WORDS[markKind]} על המכתב, בלי הסבר` : "סימון על המכתב"}</p>
      )}

      {(s.from || s.to || s.raw) && (
        <div className="flex flex-col gap-1 rounded-md border-s-4 border-accent bg-accent-soft/50 px-3 py-2 text-sm">
          <span className="text-xs font-semibold text-muted">הצעה לנוסח</span>
          {s.raw ? (
            <p className="whitespace-pre-wrap">{s.raw}</p>
          ) : (
            <>
              {s.from && (
                <p>
                  <span className="font-semibold">במקום: </span>
                  <del className="text-bad decoration-bad/60">{s.from}</del>
                </p>
              )}
              {s.to && (
                <p>
                  <span className="font-semibold">כתבו: </span>
                  <ins className="font-semibold text-good no-underline">{s.to}</ins>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {c.isDraft && <p className="text-xs font-semibold text-accent">טיוטה, תפורסם כשתחליט (אשר או החזר לתיקון). עד אז רק לך היא גלויה.</p>}

      {c.hasSnapshot && (
        <div>
          <button type="button" onClick={() => setShowArea((v) => !v)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-semibold text-accent hover:underline" aria-expanded={showArea}>
            <ImageIcon aria-hidden className="size-4" />
            {showArea ? "הסתר את האזור שסומן" : "הצג את האזור שסומן"}
          </button>
          {showArea && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/comments/${c.id}/snapshot`} alt={`האזור שסומן בהערה ${n}`} loading="lazy" className="mt-1 max-h-48 rounded border border-line bg-white" />
          )}
        </div>
      )}

      {c.replies.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-md border-s-2 border-line-strong bg-surface-2 py-2 ps-3 pe-2" aria-label="תגובות">
          {c.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-semibold">{shortName(r.authorName)}</span>{" "}
              <span className="text-xs text-muted" title={formatDateTime(new Date(r.createdAt))}>
                {relativeDay(r.createdAt)}
              </span>
              <p className="whitespace-pre-wrap break-words">{r.body}</p>
            </li>
          ))}
        </ul>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-2">
          {open && !c.isDraft && can.handle && (
            <>
              <button type="button" className={`${btnQuiet} border-good/40 text-good hover:border-good hover:text-good`} onClick={() => setMode("fixed")}>
                <CircleCheck aria-hidden className="size-4" />
                תוקן
              </button>
              <button type="button" className={`${btnQuiet} hover:border-line-strong hover:text-fg`} onClick={() => setMode("declined")}>
                <X aria-hidden className="size-4" />
                לא מקובל
              </button>
            </>
          )}
          {can.comment && !c.isDraft && (
            <button type="button" className={`${btnQuiet} hover:border-line-strong hover:text-fg`} onClick={() => setMode("reply")}>
              <Reply aria-hidden className="size-4" />
              תגובה
            </button>
          )}
          {mayReopen && (
            <StatusButton letterId={letterId} commentId={c.id} to="OPEN" label="פתח מחדש" icon={<RotateCcw aria-hidden className="size-4" />} />
          )}
          {c.isDraft && mine && <DeleteDraft letterId={letterId} commentId={c.id} />}
        </div>
      )}
      {mode === "reply" && (
        <InlineForm
          action={replyAction}
          hidden={{ letterId, commentId: c.id }}
          field={{ name: "body", label: "תגובה", required: true }}
          submit="שלח תגובה"
          onDone={() => setMode(null)}
        />
      )}
      {mode === "fixed" && (
        <InlineForm
          action={commentStatusAction}
          hidden={{ letterId, commentId: c.id, to: "RESOLVED_FIXED" }}
          field={{ name: "note", label: "מה תוקן? (לא חובה)", required: false }}
          submit="סמן: תוקן"
          onDone={() => setMode(null)}
        />
      )}
      {mode === "declined" && (
        <InlineForm
          action={commentStatusAction}
          hidden={{ letterId, commentId: c.id, to: "RESOLVED_NO_CHANGE" }}
          field={{ name: "note", label: "למה לא? (חובה; מי שכתב את ההערה יראה את ההסבר)", required: true }}
          submit="סמן: לא מקובל"
          onDone={() => setMode(null)}
        />
      )}
    </li>
  );
}

function InlineForm({
  action,
  hidden,
  field,
  submit,
  onDone,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  field: { name: string; label: string; required: boolean };
  submit: string;
  onDone: () => void;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(action, null);
  useEffect(() => {
    if (state && "ok" in state) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => dispatch(form));
      }}
      className="flex flex-col gap-2 border-t border-line pt-2"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex flex-col gap-1">
        <span className={label}>{field.label}</span>
        <textarea name={field.name} required={field.required} maxLength={4000} rows={2} className={input} autoFocus />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={pending}>
          {pending && <Spinner />}
          {submit}
        </button>
        <button type="button" className={btnSecondary} onClick={onDone} disabled={pending}>
          ביטול
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function StatusButton({ letterId, commentId, to, label: text, icon }: { letterId: string; commentId: string; to: string; label: string; icon: React.ReactNode }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(commentStatusAction, null);
  return (
    <form action={dispatch} className="inline-flex flex-col gap-1">
      <input type="hidden" name="letterId" value={letterId} />
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="to" value={to} />
      <button className={`${btnQuiet} hover:border-line-strong hover:text-fg`} disabled={pending}>
        {pending ? <Spinner /> : icon}
        {text}
      </button>
      {state && "error" in state && <FormMessage state={state} />}
    </form>
  );
}

function DeleteDraft({ letterId, commentId }: { letterId: string; commentId: string }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(deleteDraftAction, null);
  return (
    <form action={dispatch} className="inline-flex flex-col gap-1">
      <input type="hidden" name="letterId" value={letterId} />
      <input type="hidden" name="commentId" value={commentId} />
      <button className={btnQuiet} disabled={pending}>
        {pending ? <Spinner /> : <Trash2 aria-hidden className="size-4" />}
        מחק טיוטה
      </button>
      {state && "error" in state && <FormMessage state={state} />}
    </form>
  );
}
