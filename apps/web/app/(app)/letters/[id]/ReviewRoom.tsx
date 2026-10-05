"use client";

import { isOpenComment, type CommentStatus } from "@al/domain";
import { configurePdfWorker, PdfReviewViewer, type DrawResult, type ReviewComment } from "@al/pdf-review";
import "@al/pdf-review/styles.css";
import {
  CircleCheck,
  Eye,
  FileDown,
  FileText,
  History,
  MessageSquare,
  MessageSquarePlus,
  Reply,
  SquareDashedMousePointer,
  SlidersHorizontal,
} from "lucide-react";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, FormMessage } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { EmptyState } from "@/components/EmptyState";
import { CommentStatusPill } from "@/components/Pills";
import { Spinner } from "@/components/Spinner";
import { btnLink, btnPrimary, btnQuiet, card, input, summary } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { formatDateTime } from "@/lib/format";
import { createCommentAction, replyAction } from "./actions";
import { btnSmall, SummaryChevron } from "./bits";
import { CommentStatusForm } from "./CommentStatusForm";

configurePdfWorker("/pdf.worker.min.mjs");

export interface ReviewVersion {
  id: string;
  number: number;
}

export interface ReviewRoomComment {
  id: string;
  /** Stable number in creation order, shown on the box and in the list. */
  n: number;
  versionNumber: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: CommentStatus;
  body: string;
  author: string;
  createdAt: string;
  hasSnapshot: boolean;
  fixedInVersion: number | null;
  replies: { id: string; author: string; body: string; createdAt: string }[];
}

interface Draft extends DrawResult {
  previewUrl: string;
}

const DRAFT_ID = "__draft__";

/** The PDF of a version with its comment boxes, and the comment list beside it. */
export function ReviewRoom({
  letterId,
  versions,
  comments,
  canComment,
  canReply,
  canSetStatus,
}: {
  letterId: string;
  /** Newest first. */
  versions: ReviewVersion[];
  comments: ReviewRoomComment[];
  canComment: boolean;
  canReply: boolean;
  canSetStatus: boolean;
}) {
  const latest = versions[0];
  const [versionNumber, setVersionNumber] = useState(latest?.number ?? 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A new upload moves the room to the new version.
  useEffect(() => {
    if (latest) setVersionNumber(latest.number);
  }, [latest?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.previewUrl);
  }, [draft]);

  const version = versions.find((v) => v.number === versionNumber) ?? latest;
  const onThis = comments.filter((c) => c.versionNumber === version?.number);
  const visible = onThis.filter((c) => showResolved || isOpenComment(c.status) || c.id === selectedId);
  const sorted = [...visible].sort(
    (a, b) => Number(isOpenComment(b.status)) - Number(isOpenComment(a.status)) || a.n - b.n,
  );
  const openElsewhere = comments.filter((c) => c.versionNumber !== version?.number && isOpenComment(c.status));
  const hiddenResolved = onThis.length - visible.length;
  const openHere = onThis.filter((c) => isOpenComment(c.status)).length;

  const boxes: ReviewComment[] = useMemo(() => {
    const list: ReviewComment[] = onThis.map((c) => ({
      id: c.id,
      page: c.page,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      status: c.status,
      label: String(c.n),
    }));
    if (draft && draft.anchor.versionNumber === version?.number)
      list.push({ ...draft.anchor, id: DRAFT_ID, status: "OPEN", label: "חדשה" });
    return list;
  }, [onThis, draft, version?.number]);

  function select(id: string) {
    if (id === DRAFT_ID) return;
    setSelectedId(id);
    requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-comment="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }

  function goTo(c: ReviewRoomComment) {
    setVersionNumber(c.versionNumber);
    setSelectedId(c.id);
  }

  function onDraw(result: DrawResult) {
    setDraft({ ...result, previewUrl: URL.createObjectURL(result.snapshot) });
    setDrawMode(false);
    setSelectedId(null);
  }

  if (!version)
    return (
      <section className={`${card} flex flex-col gap-3`} aria-labelledby="letter-h">
        <h2 id="letter-h" className="font-bold">
          המכתב
        </h2>
        <EmptyState icon={FileText} title="עדיין אין גרסה להצגה">
          אחרי העלאת Word ו-PDF המכתב יוצג כאן להערות.
        </EmptyState>
      </section>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="המכתב" className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-semibold">גרסה</span>
            <select
              className={`${input} w-auto py-1.5`}
              value={version.number}
              onChange={(e) => {
                setVersionNumber(Number(e.currentTarget.value));
                setSelectedId(null);
              }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.number}>
                  גרסה {v.number}
                  {v.number === latest?.number ? " (אחרונה)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-accent"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.currentTarget.checked)}
            />
            הצג הערות שנסגרו
          </label>
          <div className="flex flex-wrap gap-2 sm:ms-auto">
            <a href={`/api/versions/${version.id}/pdf`} className={btnSmall} target="_blank" rel="noopener">
              <FileText aria-hidden className="size-4" />
              פתח PDF
              <span className="sr-only">(נפתח בלשונית חדשה)</span>
            </a>
            <a href={`/api/versions/${version.id}/docx`} className={btnSmall}>
              <FileDown aria-hidden className="size-4" />
              הורד Word
            </a>
          </div>
        </div>
        {canComment && version.number !== latest?.number && (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <History aria-hidden className="mt-0.5 size-4" />
            אפשר להעיר גם על גרסה קודמת, אבל רוב ההערות שייכות לגרסה האחרונה.
          </p>
        )}
        <div className="h-[75vh] min-h-[480px] overflow-hidden rounded-xl border border-line bg-bg">
          <PdfReviewViewer
            key={version.id}
            src={`/api/versions/${version.id}/pdf`}
            versionNumber={version.number}
            comments={boxes}
            selectedCommentId={selectedId}
            onSelectComment={select}
            resolvedComments={showResolved ? "faint" : "hidden"}
            canDraw={canComment}
            drawMode={drawMode}
            onDrawModeChange={setDrawMode}
            onDrawComplete={onDraw}
          />
        </div>
      </section>

      <section aria-labelledby="comments-h" className={`${card} flex min-w-0 flex-col gap-4 self-start`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="comments-h" className="flex items-center gap-2 font-bold">
            <MessageSquare aria-hidden className="size-5 text-muted" />
            הערות על גרסה {version.number}
          </h2>
          {onThis.length > 0 && (
            <span className="tabular rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">
              {openHere} פתוחות מתוך {onThis.length}
            </span>
          )}
        </div>

        {canComment && !draft && onThis.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-2.5 text-sm text-muted">
            <SquareDashedMousePointer aria-hidden className="mt-0.5 size-4 text-accent" />
            <span>
              להערה חדשה לחצו על &quot;סימון אזור&quot; בסרגל של המכתב וגררו מסגרת סביב המקום במסמך.
            </span>
          </p>
        )}
        {draft && (
          <NewComment
            key={draft.previewUrl}
            letterId={letterId}
            draft={draft}
            onDone={() => setDraft(null)}
          />
        )}

        <div ref={listRef} className="flex flex-col gap-3">
          {onThis.length === 0 && !draft ? (
            <EmptyState icon={MessageSquare} title="אין הערות על גרסה זו">
              {canComment
                ? "כדי להעיר, לחצו על \"סימון אזור\" בסרגל של המכתב וגררו מסגרת סביב המקום במסמך."
                : "הערות שהמאשרים יסמנו על המכתב יופיעו כאן."}
            </EmptyState>
          ) : sorted.length === 0 ? (
            onThis.length > 0 && (
              <p className="flex items-center gap-2 rounded-lg bg-good-soft p-3 text-sm font-semibold text-good">
                <CircleCheck aria-hidden className="size-4" />
                אין הערות פתוחות על הגרסה הזו.
              </p>
            )
          ) : (
            <ul className="flex flex-col gap-3">
              {sorted.map((c) => (
                <CommentCard
                  key={c.id}
                  c={c}
                  letterId={letterId}
                  latestVersion={latest!.number}
                  selected={c.id === selectedId}
                  onSelect={() => setSelectedId(c.id)}
                  canReply={canReply}
                  canSetStatus={canSetStatus}
                />
              ))}
            </ul>
          )}
          {hiddenResolved > 0 && (
            <button type="button" className={`${btnQuiet} self-start hover:border-line-strong hover:text-fg`} onClick={() => setShowResolved(true)}>
              <Eye aria-hidden className="size-4" />
              הצג הערות שנסגרו ({hiddenResolved})
            </button>
          )}
        </div>

        {openElsewhere.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h3 className="text-sm font-bold">פתוחות מגרסאות אחרות</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {openElsewhere.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`${btnLink} flex min-h-9 w-full items-start gap-2 rounded-md px-1 py-1 text-start hover:bg-accent-soft hover:no-underline`}
                    onClick={() => goTo(c)}
                  >
                    <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">
                      {c.n}
                    </span>
                    <span>
                      <span className="font-semibold">
                        גרסה {c.versionNumber}, עמוד {c.page}:
                      </span>{" "}
                      {c.body.slice(0, 60)}
                      {c.body.length > 60 ? "…" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function NewComment({ letterId, draft, onDone }: { letterId: string; draft: Draft; onDone: () => void }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(createCommentAction, null);

  useEffect(() => {
    if (state && "ok" in state) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { anchor } = draft;
    form.set("letterId", letterId);
    for (const k of ["versionNumber", "page", "x", "y", "width", "height"] as const) form.set(k, String(anchor[k]));
    form.set("snapshot", new File([draft.snapshot], "snapshot.png", { type: "image/png" }));
    startTransition(() => dispatch(form));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-accent bg-accent-soft/30 p-3" aria-label="הערה חדשה">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquarePlus aria-hidden className="size-4 text-accent" />
        הערה חדשה · עמוד {draft.anchor.page}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={draft.previewUrl} alt="האזור שסומן" className="max-h-40 self-start rounded border border-line bg-white" />
      <TextAreaField label="מה צריך לתקן" name="body" required maxLength={4000} rows={3} autoFocus />
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>
          {pending ? <Spinner /> : <MessageSquarePlus aria-hidden className="size-4" />}
          {pending ? "שומר…" : "הוסף הערה"}
        </button>
        <button type="button" className={`${btnQuiet} hover:border-line-strong hover:text-fg`} onClick={onDone} disabled={pending}>
          ביטול
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function CommentCard({
  c,
  letterId,
  latestVersion,
  selected,
  onSelect,
  canReply,
  canSetStatus,
}: {
  c: ReviewRoomComment;
  letterId: string;
  latestVersion: number;
  selected: boolean;
  onSelect: () => void;
  canReply: boolean;
  canSetStatus: boolean;
}) {
  const open = isOpenComment(c.status);
  return (
    <li
      data-comment={c.id}
      className={`flex flex-col gap-2.5 rounded-lg border p-3 transition-colors duration-150 ${
        selected ? "border-accent ring-2 ring-accent/30" : "border-line"
      } ${open ? "bg-surface" : "bg-surface-2"}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onSelect}
          className={`tabular grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-sm font-bold transition-colors duration-150 ${
            open ? "bg-accent text-accent-fg hover:bg-accent/85" : "bg-surface text-muted ring-1 ring-line-strong hover:bg-accent-soft"
          }`}
          aria-label={`הצג את הערה ${c.n} במסמך`}
          title="הצג במסמך"
        >
          {c.n}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold leading-tight">{c.author}</span>
          <span className="text-xs text-muted">
            עמוד {c.page} · {formatDateTime(new Date(c.createdAt))}
          </span>
        </div>
        <CommentStatusPill status={c.status} />
      </div>
      <p className="whitespace-pre-wrap">{c.body}</p>
      {c.status === "RESOLVED_FIXED" && c.fixedInVersion && (
        <p className="flex items-center gap-1.5 text-sm text-good">
          <CircleCheck aria-hidden className="size-4" />
          תוקן בגרסה {c.fixedInVersion}
        </p>
      )}
      {c.hasSnapshot && !open && (
        <details className="group text-sm">
          <summary className={`${summary} text-sm`}>
            <Eye aria-hidden className="size-4" />
            מה היה מסומן
            <SummaryChevron />
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/comments/${c.id}/snapshot`}
            alt={`האזור שסומן בהערה ${c.n}`}
            loading="lazy"
            className="mt-1 max-h-48 rounded border border-line bg-white"
          />
        </details>
      )}
      {c.replies.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-md border-s-2 border-line-strong bg-surface-2 py-2 ps-3 pe-2" aria-label="תגובות">
          {c.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-semibold">{r.author}</span>{" "}
              <span className="text-xs text-muted">{formatDateTime(new Date(r.createdAt))}</span>
              <p className="whitespace-pre-wrap">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {((canReply && open) || canSetStatus) && (
        <div className="flex flex-wrap gap-x-3 border-t border-line pt-1">
          {canReply && open && (
            <details className="group open:basis-full">
              <summary className={`${summary} text-sm`}>
                <Reply aria-hidden className="size-4" />
                תגובה
                <SummaryChevron />
              </summary>
              <ActionForm
                action={replyAction}
                submitLabel="שלח תגובה"
                submitIcon={<Reply aria-hidden className="size-4" />}
                className="mt-1 flex flex-col gap-2"
                inline
              >
                <input type="hidden" name="letterId" value={letterId} />
                <input type="hidden" name="commentId" value={c.id} />
                <TextAreaField label="תגובה" name="body" required maxLength={4000} rows={3} />
              </ActionForm>
            </details>
          )}
          {canSetStatus && (
            <details className="group open:basis-full">
              <summary className={`${summary} text-sm`}>
                <SlidersHorizontal aria-hidden className="size-4" />
                {open ? "סגירה או בקשת הבהרה" : "פתיחה מחדש"}
                <SummaryChevron />
              </summary>
              <div className="mt-1">
                <CommentStatusForm
                  key={c.status}
                  letterId={letterId}
                  commentId={c.id}
                  from={c.status}
                  versionNumbers={Array.from({ length: Math.max(0, latestVersion - c.versionNumber + 1) }, (_, i) => c.versionNumber + i)}
                />
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
