"use client";

import { isOpenComment, type CommentStatus } from "@al/domain";
import { configurePdfWorker, PdfReviewViewer, type DrawResult, type ReviewComment } from "@al/pdf-review";
import "@al/pdf-review/styles.css";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, FormMessage } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { CommentStatusPill } from "@/components/Pills";
import { btnLink, btnPrimary, btnQuiet, card, input } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { formatDateTime } from "@/lib/format";
import { createCommentAction, replyAction } from "./actions";
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
      <section className={`${card} flex flex-col gap-2`} aria-label="המכתב">
        <h2 className="font-bold">המכתב</h2>
        <p className="text-sm text-muted">עדיין לא הועלתה גרסה. אחרי העלאת Word ו-PDF המכתב יוצג כאן להערות.</p>
      </section>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="המכתב" className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-semibold">גרסה</span>
            <select
              className={`${input} w-auto py-1`}
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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.currentTarget.checked)} />
            הצג הערות שנסגרו
          </label>
          <a href={`/api/versions/${version.id}/pdf`} className={btnLink} target="_blank" rel="noopener">
            פתח PDF
          </a>
          <a href={`/api/versions/${version.id}/docx`} className={btnLink}>
            הורד Word
          </a>
        </div>
        {canComment && version.number !== latest?.number && (
          <p className="text-sm text-muted">אפשר להעיר גם על גרסה קודמת, אבל רוב ההערות שייכות לגרסה האחרונה.</p>
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
        <h2 id="comments-h" className="font-bold">
          הערות על גרסה {version.number}{" "}
          <span className="text-sm font-normal text-muted">
            ({onThis.filter((c) => isOpenComment(c.status)).length} פתוחות מתוך {onThis.length})
          </span>
        </h2>

        {canComment && !draft && (
          <p className="text-sm text-muted">
            להערה חדשה לחצו על &quot;סימון אזור&quot; בסרגל של המכתב וגררו מסגרת סביב המקום במסמך.
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
          {sorted.length === 0 ? (
            <p className="text-sm text-muted">אין הערות פתוחות על הגרסה הזו.</p>
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
            <button type="button" className={`${btnLink} self-start text-sm`} onClick={() => setShowResolved(true)}>
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
                  <button type="button" className={`${btnLink} text-start`} onClick={() => goTo(c)}>
                    #{c.n} · גרסה {c.versionNumber}, עמוד {c.page}: {c.body.slice(0, 60)}
                    {c.body.length > 60 ? "…" : ""}
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-accent p-3" aria-label="הערה חדשה">
      <p className="text-sm font-semibold">
        הערה חדשה · עמוד {draft.anchor.page}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={draft.previewUrl} alt="האזור שסומן" className="max-h-40 self-start rounded border border-line bg-white" />
      <TextAreaField label="מה צריך לתקן" name="body" required maxLength={4000} rows={3} autoFocus />
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>
          {pending ? "שומר…" : "הוסף הערה"}
        </button>
        <button type="button" className={btnQuiet} onClick={onDone} disabled={pending}>
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
      className={`flex flex-col gap-2 rounded-lg border p-3 ${selected ? "border-accent ring-2 ring-accent/30" : "border-line"} ${
        open ? "" : "opacity-80"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <button
          type="button"
          onClick={onSelect}
          className="rounded bg-accent px-1.5 font-bold text-accent-fg tabular"
          aria-label={`הצג את הערה ${c.n} במסמך`}
        >
          {c.n}
        </button>
        <CommentStatusPill status={c.status} />
        <span className="font-semibold">{c.author}</span>
        <span className="text-muted">עמוד {c.page}</span>
        <span className="text-xs text-muted">{formatDateTime(new Date(c.createdAt))}</span>
      </div>
      <p className="whitespace-pre-wrap">{c.body}</p>
      {c.hasSnapshot && !open && (
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">מה היה מסומן</summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/comments/${c.id}/snapshot`}
            alt={`האזור שסומן בהערה ${c.n}`}
            loading="lazy"
            className="mt-2 max-h-48 rounded border border-line bg-white"
          />
        </details>
      )}
      {c.status === "RESOLVED_FIXED" && c.fixedInVersion && (
        <p className="text-sm text-good">תוקן בגרסה {c.fixedInVersion}</p>
      )}
      {c.replies.length > 0 && (
        <ul className="flex flex-col gap-2 border-s-2 border-line ps-3" aria-label="תגובות">
          {c.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-semibold">{r.author}</span>{" "}
              <span className="text-xs text-muted">{formatDateTime(new Date(r.createdAt))}</span>
              <p className="whitespace-pre-wrap">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canReply && open && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-accent">תגובה</summary>
          <ActionForm action={replyAction} submitLabel="שלח תגובה" className="mt-2 flex flex-col gap-2" inline>
            <input type="hidden" name="letterId" value={letterId} />
            <input type="hidden" name="commentId" value={c.id} />
            <TextAreaField label="תגובה" name="body" required maxLength={4000} />
          </ActionForm>
        </details>
      )}
      {canSetStatus && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-accent">{open ? "סגירה או בקשת הבהרה" : "פתיחה מחדש"}</summary>
          <div className="mt-2">
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
    </li>
  );
}
