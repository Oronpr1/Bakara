import type { NotificationType } from "../notify";
import { escapeHtml, rtlEmail, type MailMessage } from "../mail";

export interface PendingItem {
  type: NotificationType;
  letterId: string | null;
  letterTitle: string | null; // e.g. "משפטים 101 · קריית אונו"
  data: Record<string, unknown>;
}

const LINES: Record<NotificationType, (d: Record<string, unknown>) => string> = {
  YOUR_TURN: () => "המכתב ממתין לך",
  RETURNED_FOR_FIXES: (d) => `יש הערות לטיפול${typeof d.comments === "number" ? ` (${d.comments})` : ""}`,
  RESUBMITTED: () => "היועצת שלחה תיקונים. המכתב ממתין לך שוב",
  READY_FOR_ACADEMIC: () => "כל הבדיקות הושלמו. אפשר לשלוח לגורם אקדמי",
  ACADEMIC_ANSWERED: (d) => (d.kind === "APPROVED" ? "הגורם האקדמי אישר" : "הגורם האקדמי ביקש תיקון"),
  APPROVED_FOR_DISTRIBUTION: () => "המכתב מאושר להפצה",
  NEW_VERSION: (d) => `הועלתה גרסה חדשה${typeof d.number === "number" ? ` (גרסה ${d.number})` : ""}`,
  NEW_COMMENT: () => "נוספה הערה חדשה",
  COMMENT_REPLY: () => "הגיבו בשרשור של הערה",
  COMMENT_STATUS: () => "עודכן הסטטוס של הערה שכתבת",
  ACTED_FOR_YOU: (d) => `${typeof d.by === "string" ? d.by : "ורוניקה"} פעלה במקומך`,
  LINK_REQUEST: () => "גורם אקדמי ביקש קישור חדש למכתב",
  REMINDER: (d) => `תזכורת: המכתב ממתין לך${typeof d.days === "number" ? ` כבר ${d.days} ימים` : ""}`,
};

export function describe(item: PendingItem): string {
  return LINES[item.type](item.data);
}

/** One email per person, listing everything that happened since the last one. */
export function renderDigest(to: { email: string; name: string }, items: PendingItem[], appUrl: string): MailMessage {
  const base = appUrl.replace(/\/$/, "");
  const link = (i: PendingItem) => (i.letterId ? `${base}/letters/${i.letterId}` : base);
  const subject =
    items.length === 1
      ? `${describe(items[0]!)}${items[0]!.letterTitle ? `: ${items[0]!.letterTitle}` : ""}`
      : `${items.length} עדכונים במכתבי הקבלה`;

  const text = [
    `שלום ${to.name},`,
    "",
    ...items.map((i) => `• ${describe(i)}${i.letterTitle ? ` · ${i.letterTitle}` : ""}\n  ${link(i)}`),
    "",
    "המייל נשלח ממערכת מכתבי הקבלה.",
  ].join("\n");

  const rows = items
    .map(
      (i) =>
        `<li style="margin-bottom:10px"><a href="${escapeHtml(link(i))}" style="color:#1f4f8f;font-weight:bold">${escapeHtml(describe(i))}</a>${
          i.letterTitle ? `<br><span style="color:#5b6676">${escapeHtml(i.letterTitle)}</span>` : ""
        }</li>`,
    )
    .join("");
  const html = rtlEmail(
    `<p>שלום ${escapeHtml(to.name)},</p><ul style="padding-right:18px">${rows}</ul><p style="color:#5b6676;font-size:13px">המייל נשלח ממערכת מכתבי הקבלה.</p>`,
  );
  return { to: to.email, subject, text, html };
}
