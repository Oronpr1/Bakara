# מכתבי קבלה

מערכת לניהול הכנה, הערות ואישורים של מכתבי קבלה, לפי עונות רישום ומסלולי לימוד.

## מבנה

| תיקייה | מה יש בה |
| --- | --- |
| `packages/domain` | כללי התהליך: שלבים, סבבי אישור, הרשאות, הערות. קוד טהור עם בדיקות. |
| `packages/db` | סכמת PostgreSQL (Drizzle), מיגרציות, נתוני דמו. |
| `apps/web` | האתר והשרת (Next.js), בעברית. |
| `apps/addin` | תוסף Word (חלונית צד): שמירת גרסה רשמית (DOCX + PDF מ-Word) והעברה לבדיקה. ראו `apps/addin/README.md`. |

## הרצה מקומית

```bash
pnpm install
pnpm db:up            # PostgreSQL + Mailpit ב-Docker
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate && pnpm db:seed
pnpm dev              # http://localhost:3000
```

משתמשי הדמו נמצאים ב-`packages/db/src/seed.ts`. קודי הכניסה מגיעים ל-Mailpit (http://localhost:8025),
או מודפסים ללוג של השרת כש-`SMTP_URL` לא מוגדר.

## בדיקות

```bash
pnpm test        # בדיקות יחידה ושילוב (בדיקות מסד נתונים רצות כש-DATABASE_URL מוגדר)
pnpm typecheck
```
