# תדריך בנייה (לסוכנים ולמפתחים)

מערכת מכתבי הקבלה: **ורוניקה (מנהלת מחלקת בקרה) מנהלת אותה והיא נבנית בשבילה.** קודם קראו:
1. [01-requirements-oron.md](01-requirements-oron.md): מה אורון אמר, כלשונו.
2. [02-redesign-v2.md](02-redesign-v2.md): התכנון (שלבים, "אצל מי", החלטות, מסכים). **סעיף 11 מחייב.**
3. אב-טיפוס חי של החוויה (פתחו בדפדפן): https://claude.ai/artifact/TP1GuoQhN6HsK2fE8oC3Lf

## כללי ברזל
- **כל טקסט שמופיע למשתמש: עברית פשוטה.** בלי מונחי מערכת ("slot", "stage"). הדוח שלכם אלי: בעברית, קצר.
- **המסך לא מכיל חוקים.** כל "מה מותר" ו"אצל מי" מגיעים מוכנים מהליבה: `abilities(actor, input)` ו-`flowView(input)` ב-`packages/domain`, ומבני הנתונים ב-`apps/web/lib/letters/queries.ts` (`getHome`, `listLetters`, `getLetterRoom`, `LetterSummary`, `Tower`, `LetterRoom`). **אל תשכפלו חוקים בקומפוננטות.**
- **לא נוגעים ב:** `packages/domain/**`, `packages/db/**`, `apps/web/lib/letters/{service,state,engine,comments,queries}.ts`, `apps/web/lib/academic/service.ts`, `apps/web/app/(app)/layout.tsx`, `apps/web/components/Pills.tsx`. חסרה יכולת/נתון? כתבו בדוח "בקשה למנהל: ..." ומה בדיוק. אפשר להוסיף **קבצים חדשים** בתחום שלכם (למשל `lib/<תחום>/queries.ts`) ופעולות שרת חדשות.
- **בעלות על קבצים** מוגדרת במשימה שלכם. אל תערכו קבצים של סוכן אחר.
- **צבע = מצב**, זהה בכל המסכים (`components/Pills.tsx`: `StatusChip`, `Holder`, `TONE_STYLES`, `PHASE_TONES`...): אפור הכנה, כחול בדיקה, סגול אקדמי, ענבר אישור סופי, ירוק מאושר, אדום תקוע. צבע אף פעם לא לבד: גם אייקון וגם טקסט.
- **עיצוב:** RTL, מטרות מגע 44px, מניעת גלישה אופקית, מצב כהה, שלדי טעינה, מצבי ריק מעוצבים (מה חסר ומה עושים). **כל מסך נבדק בשולחן (1280) ובנייד (390).** השתמשו ברכיבים הקיימים: `components/ui.ts`, `Field`, `ActionForm`, `ConfirmDialog`, `EmptyState`, `Spinner`, ובטוקנים ב-`app/globals.css`.
- **ה-Next.js כאן שונה ממה שמוכר**: קראו את `node_modules/next/dist/docs/` לפני שאתם כותבים קוד שרת (ראו `apps/web/AGENTS.md`).
- אין מחיקה של נתונים; כל פעולה נרשמת (`audit`). הערות של מבקר הן טיוטה עד שהוא מחליט (ראו `createComment`).

## הרצה מקומית (כבר מוכן)
- Node 22: `export PATH="$HOME/.local/node-toolchain/node-v22.23.1-darwin-arm64/bin:$HOME/.local/bin:$PATH" LC_ALL=en_US.UTF-8`
- Postgres כבר רץ ומאויש בנתוני דוגמה: `export DATABASE_URL=postgres://al@localhost:5432/acceptance_letters STORAGE_DIR=$HOME/.local/share/al-demo/storage`. **אל תריצו מיגרציות ואל תאפסו את המסד.** אם הוא כבוי: `LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D ~/.local/share/al-pg -l ~/.local/share/al-pg/log start`.
- התקנה ב-worktree שלכם: `pnpm install --offline || pnpm install` (ה-`pnpm` ב-`~/.local/bin`).
- שרת פיתוח בפורט **שלכם** (ראו במשימה): `cd apps/web && pnpm exec al-pdf-review-copy-worker public && pnpm exec next dev -p <פורט>`.
- כניסה: **כל משתמשי הדוגמה בסיסמה `demo-password-1`**: `oron@ono.ac.il` (ורוניקה, מנהלת בקרה, וגם מנהל רישום של מנהל עסקים אונו), `yosef.ehr@ono.ac.il` (סמנכ"ל), `demo-shaked@example.test` (יועצת, מנהל עסקים), `demo-shuli@example.test` (יועצת + מנהלת רישום, חרדיים), `demo-head@example.test` (גורם אקדמי; נכנס רק בקישור אישי, ראו `lib/academic/service.ts`).
- נתוני הדוגמה: עונה "דוגמה - תשפ"ז א'", מנהל עסקים אונו וחרדיים, מכתבים בכל שלב: מסלול 227113701 בהכנה עם גרסה, 227113801 ממתין לאורון, 227114401 בתיקון אצל שקד (הערה פתוחה), 227114301 ממתין ליוסי, 227114002 מוכן לגורם אקדמי, 227113012 אצל גורם אקדמי, 227113014 ממתין לאישור סופי, 227113006 מאושר (ממתין לגלבוע), 227113001 הסתיים. ועוד כ-47 מכתבים בהכנה.
- בדיקת טיפוסים: `cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep -v "\.test\.ts"` (שגיאות בקבצי `.test.ts` ישנים אינן שלכם; סוכן אחר מתקן אותן).
- **צילומי מסך/בדיקת דפדפן: Playwright 1.63 (בשורש הפרויקט) עם `chromium.launch({ args: ["--use-mock-keychain"] })` בלי פרופיל**, לעולם לא הכרום של אורון, וסגירה ב-`finally`. שמרו צילומים ב-`/tmp/...` או בתיקיית scratchpad שלכם, לא בגיט.

## עבודה עם git
- אתם ב-worktree בענף משלכם. **commit קטן אחרי כל חלק שעובד**, ו-`git push -u origin <ענף>` כל כמה commits (worktree עלול להיעלם).
- **שלד קודם:** תוך 10 הדקות הראשונות העלו מסך/קובץ ראשון שמתקמפל, ואז בנו אותו בחלקים (לקח: סוכנים שקוראים הרבה ואז כותבים הכול בבת אחת נתקעים).
- בסוף: דוח קצר בעברית: מה נבנה, אילו קבצים, מה נבדק ואיך (כולל מה לא נבדק), בקשות למנהל.

## אוצר מילים (אחיד בכל המערכת)
בהכנה · בבדיקה · בתיקון · מוכן לגורם אקדמי · אצל גורם אקדמי · ממתין לאישור סופי · מאושר להפצה · הועלה לגלבוע. פעולות: **אשר**, **החזר לתיקון**, **שלחתי תיקונים**, **שלח לבדיקה**, **שלח לגורם אקדמי**, **דלג על הגורם האקדמי**, **אשרו מחדש**, **פתח מחדש**, **תזכיר**, **בטל את האישור שלי**. "אצל יוסי ואורון · 3 ימים".
