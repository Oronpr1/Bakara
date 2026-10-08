// The example file offered next to the track import: the exact column names the importer reads
// (see HEADERS in tracks.ts), a few realistic rows, and a second sheet with the instructions.
// The importer reads the first sheet, so the data sheet comes first.
import writeXlsxFile from "write-excel-file/node";

/** Header row, in the words of the registration report; each is a name the importer knows (tracks.ts HEADERS). */
export const SAMPLE_HEADER = ["קמפוס", "פקולטה", "מסלול", "קוד מסלול", "יועץ בקרה", "מנהל רישום"] as const;

/** campus, faculty, track name, track code, advisor and registration manager (both empty: assigned later in the settings). */
export const SAMPLE_ROWS: readonly (readonly [string, string, string, string, string, string])[] = [
  ["קמפוס אונו", "מנהל עסקים", "MBA בוקר - ק' 1", "228114002", "", ""],
  ["קמפוס אונו", "מנהל עסקים", "חשבונאות BA - ערב", "228113009", "", ""],
  ["קמפוס אונו", "משפטים", "משפטים LL.B - בוקר", "228111005", "", ""],
  ["קמפוסים חרדיים", "מנהל עסקים", "מנהל עסקים BA - נשים", "228213001", "", ""],
  ["קמפוס חיפה", "מדעי הרוח והחברה", "פסיכולוגיה BA", "228311001", "", ""],
];

export const SAMPLE_INSTRUCTIONS: readonly string[] = [
  "איך מכינים קובץ מסלולים לייבוא",
  "",
  "1. הגיליון הראשון בקובץ הוא הרשימה. השורה הראשונה בו היא שורת הכותרות, ומתחתיה מסלול אחד בכל שורה.",
  "2. עמודות חובה: קמפוס, פקולטה, מסלול (שם המסלול), קוד מסלול. הסדר שלהן לא משנה.",
  "3. עמודות לא חובה: יועץ בקרה ומנהל רישום (שם מלא או מייל, כמו שהם רשומים במערכת, אחרי שהוקמו בלשונית \"אנשים\"). אפשר למלא אותן לכל השורות, לחלק מהן או לא למלא בכלל.",
  "4. בלי העמודות האלה המסלולים נכנסים בלי שיבוץ, ואחר כך משבצים אותם במערכת, כמה מסלולים בבת אחת (בלשונית \"מסלולים והקצאות\").",
  "5. עמודות נוספות (יעד, הערות וכדומה) לא משנות ולא נקראות.",
  "6. קוד מסלול: ספרות בלבד, לפחות 4. השנה הבאה מתחילה ב-228.",
  "",
  "מה קורה לשורות שאינן תקינות",
  "- שורות מקום, כמו \"ללא ממ\"ה\" או קוד \"-\", מדולגות.",
  "- שורה בלי פקולטה, עם קוד לא תקין, או עם קוד שמופיע פעמיים באותו קמפוס: מסומנת כבעיה ולא נכנסת. שאר השורות נכנסות.",
  "- שם של יועצת או מנהל רישום שלא קיימים במערכת (או שיש שניים בשם הזה): השורה מסומנת כבעיה ולא נכנסת.",
  "- מסלול בלי יועצת או בלי מנהל רישום נכנס, ומסומן באדום עד שמשבצים. אי אפשר לשלוח אותו לבדיקה לפני כן.",
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
      { data, sheet: "מסלולים", rightToLeft: true, stickyRowsCount: 1, columns: [{ width: 18 }, { width: 22 }, { width: 30 }, { width: 14 }, { width: 18 }, { width: 18 }] },
      { data: instructions, sheet: "הוראות", rightToLeft: true, columns: [{ width: 110 }] },
    ],
    { fontFamily: "Arial", fontSize: 11 },
  ).toBuffer();
}
