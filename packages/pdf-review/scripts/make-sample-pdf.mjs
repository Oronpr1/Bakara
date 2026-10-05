// Writes demo/public/sample.pdf: a made-up two-page Hebrew acceptance letter.
// fontkit lays each (purely Hebrew) line out right-to-left; lines are
// right-aligned by hand.
// Usage: node scripts/make-sample-pdf.mjs [path/to/hebrew-font.ttf]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const fontPath = process.argv[2] ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const out = fileURLToPath(new URL("../demo/public/sample.pdf", import.meta.url));
await mkdir(dirname(out), { recursive: true });

const pages = [
  [
    ["מכללה לדוגמה", 22],
    ["לשכת הרישום", 13],
    ["", 12],
    ["הנדון: אישור קבלה ללימודים", 16],
    ["", 12],
    ["שלום רב,", 12],
    ["אנו שמחים להודיע לך כי התקבלת ללימודי התואר הראשון", 12],
    ["בחוג למדעי המחשב, בשנת הלימודים הקרובה.", 12],
    ["תחילת הלימודים תהיה בתחילת הסמסטר הראשון.", 12],
    ["יש להסדיר את שכר הלימוד עד שלושים יום ממועד מכתב זה.", 12],
    ["", 12],
    ["פרטי המסלול", 14],
    ["מסלול: לימודי בוקר", 12],
    ["היקף: שלוש שנות לימוד", 12],
    ["קמפוס: הקמפוס המרכזי", 12],
  ],
  [
    ["תנאי הקבלה", 16],
    ["", 12],
    ["הקבלה מותנית בהצגת תעודת בגרות מקורית.", 12],
    ["יש להשלים קורס מכינה במתמטיקה לפני תחילת הלימודים.", 12],
    ["אי עמידה בתנאים עלולה לבטל את הקבלה.", 12],
    ["", 12],
    ["לשאלות ניתן לפנות ללשכת הרישום.", 12],
    ["", 12],
    ["בברכה,", 12],
    ["ועדת הקבלה", 12],
  ],
];

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(await readFile(fontPath), { subset: true });
doc.setTitle("מכתב קבלה לדוגמה");

const margin = 64;
pages.forEach((lines, i) => {
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  let y = height - margin - 10;
  for (const [text, size] of lines) {
    if (text) {
      page.drawText(text, { x: width - margin - font.widthOfTextAtSize(text, size), y, size, font, color: rgb(0.1, 0.1, 0.12) });
    }
    y -= size * 1.9;
  }
  page.drawLine({
    start: { x: margin, y: 60 },
    end: { x: width - margin, y: 60 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  const footer = `${i + 1} / ${pages.length}`;
  page.drawText(footer, { x: width / 2 - font.widthOfTextAtSize(footer, 9) / 2, y: 44, size: 9, font });
});

await writeFile(out, await doc.save());
console.log(`wrote ${out}`);
