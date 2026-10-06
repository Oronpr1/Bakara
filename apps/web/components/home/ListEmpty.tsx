// What the letter list says when it is empty: why, and what happens next. Per group and person.
import { CircleCheckBig, FilePlus2, FileSearch, Inbox } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { btnSecondary } from "@/components/ui";
import { type Filters, filterQuery, type Group, GROUP_TITLES, hasNarrowing, type Persona } from "@/lib/home/model";

const TEXT: Partial<Record<Group, { title: string; body: string }>> = {
  mine: { title: "אין כרגע מכתבים שממתינים לך", body: "כשמכתב יגיע אליך, הוא יופיע כאן, הכי ותיק קודם, ותקבלו הודעה." },
  todo: {
    title: "אין כרגע מכתבים לטיפול שלך",
    body: "כשמכתב יחזור אליך לתיקון, יהיה מוכן לגורם אקדמי או יאושר להעלאה לגלבוע, או כשתשויך אליך דרישת מכתב חדשה, הוא יופיע כאן.",
  },
  review: { title: "אין כרגע מכתבים שממתינים לבדיקה שלך", body: "כשיועצת תשלח מכתב לבדיקה, הוא יופיע כאן, הכי ותיק קודם." },
  final: { title: "אין כרגע מכתבים שממתינים לאישור הסופי שלך", body: "מכתב מגיע לכאן אחרי הבדיקות והגורם האקדמי." },
  others: { title: "אין כרגע מכתבים שלך אצל אחרים", body: "מכתב ששלחת לבדיקה או לגורם אקדמי יופיע כאן, עם אצל מי ומאז מתי." },
  done: { title: "עוד אין מכתבים מאושרים", body: "מכתב שאושר סופית והועלה לגלבוע יופיע כאן." },
  overdue: { title: "אין מכתבים באיחור", body: "מכתב שעבר את תאריך היעד ולא אושר יופיע כאן." },
  blocked: { title: "לכל המכתבים יש בעלי תפקידים", body: "מכתב שאין מי שיבדוק אותו (חסר מנהל רישום) יופיע כאן באדום." },
  link: { title: "אין קישורים אקדמיים בבעיה", body: "מכתב שהקישור האקדמי שלו פג, או לא נפתח כמה ימים, יופיע כאן." },
  gilboa: { title: "כל המכתבים המאושרים הועלו לגלבוע", body: "מכתב שאושר וטרם סומן \"הועלה לגלבוע\" יופיע כאן." },
  notstarted: { title: "כל המכתבים התחילו", body: "מכתב בהכנה שעוד אין לו גרסה יופיע כאן." },
};

export function ListEmpty({ group, filters, persona, total, canImport, seasonId }: { group: Group; filters: Filters; persona: Persona; total: number; canImport: boolean; seasonId: string }) {
  if (total === 0) {
    const title = persona.control
      ? "עדיין אין מכתבים בעונה הזאת"
      : persona.advisor
        ? "עדיין לא שויכו אליך מסלולים בעונה הזאת"
        : persona.rm
          ? "עדיין אין מכתבים ביחידה שלך בעונה הזאת"
          : "עדיין אין מכתבים בעונה הזאת";
    return (
      <EmptyState
        icon={FilePlus2}
        title={title}
        action={
          canImport ? (
            <Link href={`/seasons/${seasonId}/import`} className={btnSecondary}>
              ייבוא מסלולים מקובץ
            </Link>
          ) : undefined
        }
      >
        {persona.control
          ? "מקימים את המסלולים שצריכים מכתב (או מייבאים אותם מקובץ), וכל יועצת מקבלת את המכתבים שלה להכנה."
          : "כשוורוניקה תשייך אליך מסלול, הוא יופיע כאן כמכתב להכנה."}
      </EmptyState>
    );
  }
  if (hasNarrowing(filters))
    return (
      <EmptyState
        icon={FileSearch}
        title="לא נמצאו מכתבים שמתאימים לסינון"
        action={
          <Link href={`/${filterQuery({ g: filters.g, sort: filters.sort })}#letters`} scroll={false} className={btnSecondary}>
            נקה סינון
          </Link>
        }
      >
        בדקו את האיות, חפשו לפי קוד המסלול, או נקו חלק מהסינון.
      </EmptyState>
    );
  const t = TEXT[group];
  if (t)
    return (
      <EmptyState icon={CircleCheckBig} tone="good" title={t.title}>
        {t.body}
      </EmptyState>
    );
  return (
    <EmptyState icon={Inbox} title={`אין מכתבים: ${GROUP_TITLES[group]}`}>
      אפשר לבחור אריח אחר למעלה, או להציג את כל המכתבים.
    </EmptyState>
  );
}
