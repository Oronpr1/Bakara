# תוסף Word: "מכתבי קבלה" (`@al/addin`)

חלונית צד ב-Word (Desktop) שבה היועצת רואה את המכתב הפתוח, את ההערות הפתוחות עליו, ושומרת
**גרסה רשמית**: קובץ ה-DOCX כפי ש-Word שמר אותו, וקובץ PDF ש-Word עצמו מפיק (זהה ל"שמירה כ-PDF").
אפשר גם "שמור והעבר לבדיקה" כשהמכתב בשלב "בהכנה".

## מה התוסף עושה, ומה לא

- מזהה את המכתב לפי כתובת הקובץ ב-SharePoint (`Office.context.document.url`), מול השרת.
  אם הקובץ נשמר במחשב ("שמירה בשם") או שאינו קובץ של מכתב - מוצגת אזהרה ו**אי אפשר לשמור גרסה**.
- לפני ההעלאה: שומר את המסמך (`Document.save()`), קורא את ה-DOCX (`getFileAsync(Compressed)`)
  ואת ה-PDF (`getFileAsync(Pdf)`) בפרוסות של 4MB, מרכיב את כל הפרוסות וסוגר תמיד את הקובץ (`closeAsync`).
- בודק שוב שהמסמך הפתוח לא השתנה, והשרת בודק שוב שכתובת המסמך שייכת למכתב שאליו מעלים.
- **לא כותב דבר לתוך המסמך**: אין Custom XML, אין הגדרות מסמך, אין Content Controls. ה-DOCX נשמר
  בייט-בייט כפי ש-Word מסר אותו (והשרת שומר את ה-SHA-256 שלו).
- ב-Word לדפדפן `getFileAsync` לא זמין, ולכן החלונית מבקשת לפתוח את המסמך באפליקציה במחשב.

## הרשאות וכניסה

- כניסה ב-**Nested App Authentication** (MSAL, `createNestablePublicClientApplication`): Word מספק את
  חשבון המכללה שכבר מחובר ל-Office, בלי מסך כניסה נוסף. הטוקן נשמר בזיכרון בלבד.
- הטוקן מבוקש לסקופ של ה-API שלנו בלבד (`<Application ID URI>/access_as_user`).
- השרת (`apps/web/lib/auth/entra.ts`) בודק: חתימה מול מפתחות ה-tenant, issuer מסוג v2 של ה-tenant,
  audience, תוקף, `tid`, ושהסקופ `access_as_user` קיים. המשתמש מזוהה לפי `preferred_username` / `upn` /
  `email` (באותיות קטנות) מול משתמש פעיל במערכת.
- ה-API של התוסף (`/api/addin/*`) מקבל רק `Authorization: Bearer` (לא cookies), ו-CORS פתוח רק למקור
  שבו התוסף מאוחסן (`ADDIN_ORIGIN`).
- גרסת Word שאינה תומכת ב-`NestedAppAuth 1.1` מקבלת הודעה לעדכן את Office.

---

## הוראות ל-IT (הקמה חד-פעמית)

### 1. רישום אפליקציה ב-Entra ID

ב-[Entra admin center](https://entra.microsoft.com) ← App registrations ← New registration:

1. **Name**: `Acceptance Letters Word Add-in`. **Supported account types**: *Accounts in this organizational
   directory only* (single tenant). בלי Redirect URI בשלב הזה. שמרו את ה-**Application (client) ID**
   ואת ה-**Directory (tenant) ID**.
2. **Authentication** ← Add a platform ← **Single-page application** ← Redirect URI:
   `brk-multihub://letters-addin.college.ac.il` (הדומיין שבו התוסף מאוחסן, בלי נתיב). זה מה ש-NAA דורש.
3. **Expose an API**:
   - Application ID URI: `api://letters-addin.college.ac.il/<client-id>`
   - Add a scope: `access_as_user`, *Admins and users*, תיאור: "Access the acceptance letters API as the signed-in user".
4. **Manifest**: הגדירו `"requestedAccessTokenVersion": 2` (בעורך הישן: `"accessTokenAcceptedVersion": 2`).
   השרת מקבל רק טוקנים מסוג v2.
5. **API permissions** ← Add ← My APIs ← האפליקציה הזו ← `access_as_user` (Delegated). השאירו גם את
   `Microsoft Graph / User.Read`. לחצו **Grant admin consent** כדי שהמשתמשים לא יתבקשו להסכים.
6. ודאו שה-UPN של כל משתמשת זהה לכתובת המייל שלה במערכת מכתבי הקבלה (ההתאמה היא לפי UPN / מייל).

### 2. הגדרות השרת (`apps/web`)

| משתנה | ערך |
| --- | --- |
| `ENTRA_TENANT_ID` | Directory (tenant) ID |
| `ENTRA_CLIENT_ID` | Application (client) ID מסעיף 1 |
| `ENTRA_API_URI` | `api://letters-addin.college.ac.il/<client-id>` (מתקבל גם כ-audience) |
| `ADDIN_ORIGIN` | `https://letters-addin.college.ac.il` - המקור היחיד שמורשה לקרוא ל-`/api/addin/*` מדפדפן |

השרת צריך גישה יוצאת ל-`https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys` (מפתחות החתימה, נשמרים במטמון).

### 3. בנייה ואחסון של התוסף

```bash
# בשורש המאגר
pnpm install
VITE_ADDIN_BASE_URL=https://letters-addin.college.ac.il \
VITE_API_BASE_URL=https://letters.college.ac.il \
VITE_ENTRA_TENANT_ID=<tenant-id> \
VITE_ENTRA_CLIENT_ID=<client-id> \
VITE_ADDIN_STRICT=true \
pnpm --filter @al/addin build
```

(או קובץ `apps/addin/.env.production.local` לפי `apps/addin/.env.example`.)

- הפלט ב-`apps/addin/dist/`: דפי החלונית, האייקונים, ו-**`dist/manifest.xml`** עם הכתובות של הבנייה הזו.
- העלו את כל `dist/` לאחסון סטטי ב-HTTPS בכתובת `VITE_ADDIN_BASE_URL` (למשל Azure Static Web Apps או
  Storage static website ב-tenant של המכללה).
- **אסור** לשלוח מהאחסון `X-Frame-Options: DENY` או `frame-ancestors 'none'` - Word מציג את החלונית בתוך מסגרת.
- `VITE_ADDIN_STRICT=true` מכשיל את הבנייה אם חסר משתנה. בלעדיו הבנייה עוברת עם אזהרות (לפיתוח).

משתנים אופציונליים: `VITE_ENTRA_API_URI` (ברירת מחדל `api://<host>/<client-id>`), `VITE_API_SCOPE`
(ברירת מחדל `<API URI>/access_as_user`), `VITE_ADDIN_SUPPORT_URL`, `VITE_ADDIN_VERSION`, `VITE_ADDIN_ID`.

### 4. פריסה מרכזית (Centralized Deployment)

1. [Microsoft 365 admin center](https://admin.microsoft.com) ← **Settings** ← **Integrated apps** ← **Upload custom apps**.
2. App type: **Office Add-in** ← Upload manifest file ← `dist/manifest.xml`.
3. Assign users: קבוצת יועצות הבקרה ומנהלת הבקרה (מומלץ קבוצת אבטחה ייעודית).
4. Accept permissions ← **Deploy**. ההופעה אצל המשתמשים יכולה לקחת עד 24 שעות (לפעמים יותר).
5. אצל המשתמשת: Word ← כרטיסיית **בית** ← כפתור **"מכתבי קבלה"**.

### 5. עדכונים

- שינוי קוד בלבד: בונים ומעלים את `dist/` מחדש. אין צורך לגעת ב-admin center.
- שינוי ב-manifest (כתובות, הרשאות, כפתורים): מעלים את `VITE_ADDIN_VERSION` (למשל `1.0.1.0`), בונים,
  ומעדכנים את האפליקציה ב-Integrated apps עם ה-`manifest.xml` החדש.
- `VITE_ADDIN_ID` (ה-GUID של התוסף) נשאר קבוע. שינוי שלו יוצר תוסף חדש.

---

## דרישות מצד Word

- Word ל-Windows או ל-Mac של Microsoft 365 בגרסה שתומכת ב-`WordApi 1.3` וב-`NestedAppAuth 1.1`.
- הקובץ נפתח מספריית SharePoint של המכתבים (למשל מכפתור "פתיחה ב-Word" במערכת).
- הרשאת התוסף ב-manifest: `ReadWriteDocument` (נדרשת לשמירת המסמך ולקריאתו המלאה). התוסף לא משנה תוכן.

## פיתוח

```bash
pnpm --filter @al/addin dev        # http://localhost:3001
pnpm --filter @al/addin test       # בדיקות יחידה (Office.js מדומה)
pnpm --filter @al/addin screenshots  # צילומי מסך של החלונית במצב תצוגה מקדימה
```

**תצוגה מקדימה בלי Word**: `http://localhost:3001/?preview=found`. Office.js וה-API מוחלפים במימוש מדומה
(`src/preview/`), והחלונית האמיתית רצה מולם, כולל קריאת הקובץ בפרוסות. תרחישים:
`found`, `empty`, `readonly`, `local` (נשמר במחשב), `unknown` (קובץ SharePoint שאינו מכתב), `unsaved`,
`web` (Word לדפדפן), `no-naa`, `error`, `fail`. התצוגה המקדימה קיימת רק ב-`vite dev` (או בבנייה עם
`VITE_ENABLE_PREVIEW=true`), ולא נכנסת לבנייה רגילה.

לבדיקה ב-Word אמיתי צריך HTTPS: הריצו את `vite` עם תעודת פיתוח מהימנה (למשל מ-`office-addin-dev-certs`),
ו-sideload של `dist/manifest.xml` שנבנה עם `VITE_ADDIN_BASE_URL=https://localhost:3001`.

## מה נבדק ומה לא

- נבדק אוטומטית: קריאת הקובץ בפרוסות והרכבתן, סגירת הקובץ גם בכשל, סירוב להעלות כשהמסמך השתנה, ושהתוסף
  לא כותב למסמך - **מול Office.js מדומה בלבד**. בצד השרת: אימות הטוקן (מפתחות שנוצרו מקומית), התאמת
  הכתובות, וה-routes מול PostgreSQL אמיתי.
- **לא נבדק כאן** (אין Word בסביבה): התנהגות Word האמיתית ב-`getFileAsync`/`save()`, ש-NAA מחזיר טוקן עם
  הרשמת Entra אמיתית, טעינת ה-manifest ב-Word ובפריסה מרכזית, ושהכתובת ש-Word מדווח עליה תואמת בפועל ל-`webUrl` מ-Graph.
