import { COMMENT_STATUS_LABELS, SLOT_LABELS, STAGE_LABELS, type ApproverSlot, type CommentStatus, type Stage } from "@al/domain";
import {
  BadgeCheck,
  Check,
  ChevronsLeft,
  CircleCheck,
  Cloud,
  FastForward,
  FilePlus,
  FileUp,
  History as HistoryIcon,
  Lock,
  LockOpen,
  MessageSquarePlus,
  MessageSquareText,
  RotateCcw,
  Send,
  TriangleAlert,
  Undo2,
  UserCog,
  UserMinus,
  UserPlus,
  Dot,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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

type Tone = "muted" | "accent" | "good" | "warn";

const EVENT_ICONS: Record<string, [LucideIcon, Tone]> = {
  LETTER_CREATED: [FilePlus, "accent"],
  STAGE_CHANGED: [ChevronsLeft, "accent"],
  VERSION_UPLOADED: [FileUp, "accent"],
  SHAREPOINT_FILE_CREATED: [Cloud, "muted"],
  SHAREPOINT_FILE_LOCKED: [Lock, "muted"],
  SHAREPOINT_FILE_UNLOCKED: [LockOpen, "muted"],
  SHAREPOINT_LOCK_FAILED: [TriangleAlert, "warn"],
  APPROVED: [CircleCheck, "good"],
  APPROVER_REPLACED: [UserCog, "muted"],
  APPROVER_ADDED: [UserPlus, "muted"],
  APPROVER_REMOVED: [UserMinus, "warn"],
  ADVISOR_CHANGED: [UserCog, "muted"],
  COMMENT_CREATED: [MessageSquarePlus, "muted"],
  COMMENT_STATUS: [MessageSquareText, "muted"],
  SUBMIT_FOR_REVIEW: [Send, "accent"],
  INITIAL_APPROVE: [Check, "good"],
  RETURN_FOR_CHANGES: [Undo2, "warn"],
  FORCE_ADVANCE: [FastForward, "warn"],
  FINAL_APPROVE: [BadgeCheck, "good"],
  REOPEN: [RotateCcw, "warn"],
};

const TONES: Record<Tone, string> = {
  muted: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent ring-accent/30",
  good: "bg-good-soft text-good ring-good/30",
  warn: "bg-warn-soft text-warn ring-warn/30",
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
      return { text: d.source === "GRAPH" ? `יצירת גרסה ${d.number} מקובץ ה-Word ב-SharePoint` : `העלאת גרסה ${d.number}` };
    case "SHAREPOINT_FILE_CREATED":
      return { text: d.fromVersion ? `יצירת קובץ Word ב-SharePoint מגרסה ${d.fromVersion}` : "יצירת קובץ Word ב-SharePoint" };
    case "SHAREPOINT_FILE_LOCKED":
      return { text: "נעילת קובץ ה-Word לעריכה" };
    case "SHAREPOINT_FILE_UNLOCKED":
      return { text: "שחרור קובץ ה-Word לעריכה" };
    case "SHAREPOINT_LOCK_FAILED":
      return { text: d.readOnly ? "נעילת קובץ ה-Word נכשלה" : "שחרור קובץ ה-Word נכשל" };
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
    <section aria-labelledby="history-h" className={`${card} flex flex-col gap-4`}>
      <h2 id="history-h" className="font-bold">
        היסטוריה
      </h2>
      {history.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="אין עדיין אירועים" />
      ) : (
        <ol className="flex flex-col">
          {history.map((e, i) => {
            const { text, detail: more } = describeEvent(e, names);
            const [Icon, tone] = EVENT_ICONS[e.type] ?? [Dot, "muted"];
            return (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < history.length - 1 && <span aria-hidden className="absolute top-9 bottom-1 start-[15.5px] w-px bg-line" />}
                <span aria-hidden className={`relative grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset ${TONES[tone]}`}>
                  <Icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p>
                      <span className="font-semibold">{(e.actorId && names.get(e.actorId)) || "המערכת"}</span> · {text}
                    </p>
                    {more && (
                      <p className="rounded-md border-s-2 border-line-strong bg-surface-2 px-2.5 py-1.5 text-sm text-muted">
                        ״{more}״
                      </p>
                    )}
                  </div>
                  <time dateTime={e.at.toISOString()} className="tabular shrink-0 text-xs text-muted">
                    {formatDateTime(e.at)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
