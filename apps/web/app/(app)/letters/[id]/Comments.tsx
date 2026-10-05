import { isOpenComment } from "@al/domain";
import { CommentStatusPill } from "@/components/Pills";
import { btnLink, card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { LetterDetail } from "@/lib/letters/queries";
import { CommentStatusForm } from "./CommentStatusForm";

/** Read-only list of comments, open ones first. Status controls for the advisor / control manager. */
export function Comments({ detail, canSetStatus }: { detail: LetterDetail; canSetStatus: boolean }) {
  const { comments, names, row } = detail;
  const sorted = [...comments].sort((a, b) => Number(isOpenComment(b.status)) - Number(isOpenComment(a.status)));
  const open = comments.filter((c) => isOpenComment(c.status)).length;
  const name = (id: string | null) => (id && names.get(id)) || "—";

  return (
    <section aria-labelledby="comments-h" className={`${card} flex flex-col gap-4`}>
      <h2 id="comments-h" className="font-bold">
        הערות{" "}
        <span className="text-sm font-normal text-muted">
          ({open} פתוחות מתוך {comments.length})
        </span>
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">אין הערות על המכתב.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <CommentStatusPill status={c.status} />
                <span className="font-semibold">{name(c.authorId)}</span>
                <span className="text-muted">
                  גרסה {c.versionNumber} · עמוד {c.page}
                </span>
                <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                {c.snapshotKey && (
                  <a href={`/api/comments/${c.id}/snapshot`} target="_blank" rel="noopener" className={`${btnLink} text-xs`}>
                    מה היה מסומן
                  </a>
                )}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
              {c.status === "RESOLVED_FIXED" && c.fixedInVersion && (
                <p className="text-sm text-good">תוקן בגרסה {c.fixedInVersion}</p>
              )}
              {c.replies.length > 0 && (
                <ul className="flex flex-col gap-2 border-s-2 border-line ps-3" aria-label="תגובות">
                  {c.replies.map((r) => (
                    <li key={r.id} className="text-sm">
                      <span className="font-semibold">{name(r.authorId)}</span>{" "}
                      <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
                      <p className="whitespace-pre-wrap">{r.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {canSetStatus && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-accent">שינוי סטטוס</summary>
                  <div className="mt-2">
                    <CommentStatusForm
                      key={c.status}
                      letterId={row.id}
                      commentId={c.id}
                      from={c.status}
                      versionNumbers={Array.from(
                        { length: Math.max(0, row.latestVersion - c.versionNumber + 1) },
                        (_, i) => c.versionNumber + i,
                      )}
                    />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
