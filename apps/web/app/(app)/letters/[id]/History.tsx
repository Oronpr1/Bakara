import { COMMENT_STATUS_LABELS, SLOT_LABELS, STAGE_LABELS, type ApproverSlot, type CommentStatus, type Stage } from "@al/domain";
import { card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { LetterDetail } from "@/lib/letters/queries";

type Event = LetterDetail["history"][number];

const TRANSITION_LABELS: Record<string, string> = {
  SUBMIT_FOR_REVIEW: "שליחה לבדיקה",
  INITIAL_APPROVE: "אישור לסבב",
  RETURN_FOR_CHANGES: "החזרה לתיקון",
  FORCE_ADVANCE: "העברת שלב ידנית",
  FINAL_APPROVE: "אישור סופי",
  REOPEN: "פתיחה מחדש",
};

/** One audit event as a Hebrew sentence (noun phrases, so they read well for everyone). */
export function describeEvent(e: Event, names: Map<string, string>): { text: string; detail?: string } {
  const d = e.data as Record<string, unknown>;
  const who = (id: unknown) => (typeof id === "string" && names.get(id)) || "—";
  const slot = (s: unknown) => SLOT_LABELS[s as ApproverSlot] ?? String(s);
  const stage = (s: unknown) => STAGE_LABELS[s as Stage] ?? String(s);
  const reason = typeof d.reason === "string" && d.reason ? d.reason : undefined;
  switch (e.type) {
    case "LETTER_CREATED":
      return { text: "יצירת דרישת המכתב" };
    case "STAGE_CHANGED":
      return { text: `מעבר שלב: ${stage(d.from)} ← ${stage(d.to)}` };
    case "VERSION_UPLOADED":
      return { text: `העלאת גרסה ${d.number}` };
    case "APPROVED":
      return { text: `אישור על גרסה ${d.version}` };
    case "APPROVER_REPLACED":
      return { text: `מינוי ${who(d.userId)} ל${slot(d.slot)}` };
    case "APPROVER_ADDED":
      return { text: `הוספת ${who(d.userId)} כ${slot(d.slot)}` };
    case "APPROVER_REMOVED":
      return { text: `הסרת ${who(d.userId)} (${slot(d.slot)}) מהתהליך`, detail: reason };
    case "ADVISOR_CHANGED":
      return { text: `החלפת יועצת: ${who(d.from)} ← ${who(d.to)}` };
    case "COMMENT_CREATED":
      return { text: "הערה חדשה" };
    case "COMMENT_STATUS": {
      const note = typeof d.note === "string" && d.note ? d.note : undefined;
      const fixed = d.fixedInVersion ? ` (בגרסה ${d.fixedInVersion})` : "";
      return { text: `סימון הערה: ${COMMENT_STATUS_LABELS[d.to as CommentStatus] ?? d.to}${fixed}`, detail: note };
    }
    default:
      return { text: TRANSITION_LABELS[e.type] ?? e.type, detail: reason };
  }
}

export function History({ detail }: { detail: LetterDetail }) {
  const { history, names } = detail;
  return (
    <section aria-labelledby="history-h" className={`${card} flex flex-col gap-3`}>
      <h2 id="history-h" className="font-bold">
        היסטוריה
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">אין עדיין אירועים.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {history.map((e) => {
            const { text, detail: more } = describeEvent(e, names);
            return (
              <li key={e.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                <time dateTime={e.at.toISOString()} className="tabular shrink-0 text-xs text-muted sm:w-36">
                  {formatDateTime(e.at)}
                </time>
                <span className="flex flex-col">
                  <span>
                    <span className="font-semibold">{(e.actorId && names.get(e.actorId)) || "המערכת"}</span> · {text}
                  </span>
                  {more && <span className="text-sm text-muted">״{more}״</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
