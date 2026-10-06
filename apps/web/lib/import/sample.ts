// The example file offered next to the track import: the exact column names the importer reads
// (see HEADERS in tracks.ts), a few realistic rows, and a second sheet with the instructions.
// The importer reads the first sheet, so the data sheet comes first.
import writeXlsxFile from "write-excel-file/node";

/** Header row, in the words of the registration report; each is a name the importer knows (tracks.ts HEADERS). */
export const SAMPLE_HEADER = ["קמפוס", "פקולטה", "מסלול", "קוד מסלול", "יועצת בקרה"] as const;

/** campus, faculty, track name, track code, advisor (empty = the campus's / faculty's advisor). */
export const SAMPLE_ROWS: readonly (readonly [string, string, string, string, string])[] = [
  ["קמפוס אונו", "מנהל עסקים", "MBA בוקר - ק' 1", "228114002", ""],
  ["קמפוס אונו", "מנהל עסקים", "חשבונאות BA - ערב", "228113009", ""],
  ["קמפוס אונו", "משפטים", "משפטים LL.B - בוקר", "228111005", ""],
  ["קמפוסים חרדיים", "מנהל עסקים", "מנהל עסקים BA - נשים", "228213001", "שולי הלל"],
  ["קמפוס חיפה", "מדעי הרוח והחברה", "פסיכולוגיה BA", "228311001", ""],
];

export const SAMPLE_INSTRUCTIONS: readonly string[] = [
  "איך מכינים קובץ מסלולים לייבוא",
  "",
  "1. הגיליון הראשון בקובץ הוא הרשימה. השורה הראשונה בו היא שורת הכותרות, ומתחתיה מסלול אחד בכל שורה.",
  "2. עמודות חובה: קמפוס, פקולטה, מסלול (שם המסלול), קוד מסלול. הסדר שלהן לא משנה.",
  "3. עמודה לא חובה: יועצת בקרה (שם מלא או מייל, כמו שהיא רשומה במערכת). בלעדיה, כל מסלול מקבל את היועצת שהוגדרה לקמפוס או לפקולטה שלו.",
  "4. מנהל הרישום לא נכתב בקובץ: הוא נקבע לפי הקמפוס או הפקולטה (בלשונית \"קמפוסים ופקולטות\").",
  "5. עמודות נוספות (יעד, הערות וכדומה) לא משנות ולא נקראות.",
  "6. קוד מסלול: ספרות בלבד, לפחות 4. השנה הבאה מתחילה ב-228.",
  "",
  "מה קורה לשורות שאינן תקינות",
  "- שורות מקום, כמו \"ללא ממ\"ה\" או קוד \"-\", מדולגות.",
  "- שורה בלי פקולטה, עם קוד לא תקין, או עם קוד שמופיע פעמיים באותו קמפוס: מסומנת כבעיה ולא נכנסת. שאר השורות נכנסות.",
  "- מסלול שאין לו יועצת (לא בקובץ ולא בקמפוס או בפקולטה) לא נכנס עד שמגדירים לו יועצת.",
  "- מסלול בלי מנהל רישום נכנס, ומסומן באדום עד שמגדירים לו מנהל רישום.",
  "",
  "לפני הייבוא המערכת מציגה בדיקה מקדימה, בלי לשנות כלום.",
  "אפשר לייבא שוב את אותו קובץ (למשל אחרי שהשלמתם הגדרות): מסלול שכבר קיים לא יוכפל.",
];

/** The example .xlsx, as bytes. */
export async function sampleTracksXlsx(): Promise<Buffer> {
  const bold = { fontWeight: "bold" as const };
  const data = [
    SAMPLE_HEADER.map((value) => ({ value, ...bold })),
    ...SAMPLE_ROWS.map((row) => row.map((value, i) => ({ value, ...(i === 3 ? { format: "@" } : {}) }))),
  ];
  const instructions = SAMPLE_INSTRUCTIONS.map((line, i) => [{ value: line, ...(i === 0 || line === "מה קורה לשורות שאינן תקינות" ? bold : {}) }]);
  return writeXlsxFile(
    [
      { data, sheet: "מסלולים", rightToLeft: true, stickyRowsCount: 1, columns: [{ width: 18 }, { width: 22 }, { width: 30 }, { width: 14 }, { width: 18 }] },
      { data: instructions, sheet: "הוראות", rightToLeft: true, columns: [{ width: 110 }] },
    ],
    { fontFamily: "Arial", fontSize: 11 },
  ).toBuffer();
}
