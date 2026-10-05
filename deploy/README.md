# העלאה ל-letters.ono-m.org

המערכת רצה כקונטיינר אחד ב-Fly.io בפרנקפורט (אתר + תהליך רקע לתזכורות), מסד הנתונים הוא פרויקט Supabase חדש ונפרד בפרנקפורט, והכתובת היא תת-דומיין של ono-m.org ב-Cloudflare.
עלות משוערת: כ-5 דולר לחודש ב-Fly, Supabase ו-Resend בחינם בהיקף הזה.

כל הפקודות רצות מתיקיית הריפו (`bakara`) על המחשב שלך.

## 1. מסד נתונים (Supabase)

1. ב-Supabase: **New project** בשם `ono-letters`, אזור **Frankfurt (eu-central-1)**. סיסמה חזקה למסד.
2. **Connect** → **Session pooler** → מעתיקים את ה-URI (פורט 5432).
3. מוסיפים לסוף: `?sslmode=require&uselibpqcompat=true`. זה ה-`DATABASE_URL`.

## 2. מיילים (Resend) - אופציונלי בשלב הראשון

הכניסה למערכת היא במייל וסיסמה שמנהלת הבקרה קובעת, ולכן **אין צורך במייל כדי להיכנס**. שירות שליחה נחוץ רק להתראות ותזכורות; אפשר להוסיף אותו בסוף.

1. ב-resend.com: **Domains** → מוסיפים `ono-m.org`, ומעתיקים את רשומות ה-DNS שהוא נותן ל-Cloudflare (DNS של ono-m.org).
2. **API Keys** → מפתח עם הרשאת שליחה בלבד.
3. `SMTP_URL=smtps://resend:<המפתח>@smtp.resend.com:465`

## 3. Fly.io

```bash
# פעם אחת: התקנה והתחברות
curl -L https://fly.io/install.sh | sh
fly auth login

# יצירת האפליקציה מהקובץ fly.toml (בלי לפרוס עדיין)
fly launch --no-deploy --copy-config --name ono-letters --region fra

# אחסון לקבצי המכתבים (Word + PDF של כל גרסה)
fly volumes create letters_files --region fra --size 3

# הגדרות סודיות (לא נשמרות בגיט)
fly secrets set \
  DATABASE_URL='<מסעיף 1>' \
  AUTH_SECRET="$(openssl rand -base64 48)" \
  SMTP_URL='<מסעיף 2>' \
  MAIL_FROM='מכתבי קבלה <letters@ono-m.org>' \
  APP_URL='https://letters.ono-m.org'

# פריסה (בונה, מריץ עדכוני מסד, ומעלה את האתר ואת תהליך הרקע)
fly deploy
```

## 4. כתובת

```bash
fly certs add letters.ono-m.org
```

ב-Cloudflare, ב-DNS של ono-m.org: רשומת **CNAME** בשם `letters` שמצביעה ל-`ono-letters.fly.dev`, במצב **DNS only** (ענן אפור), כדי ש-Fly יוציא את תעודת ה-HTTPS.

## 5. משתמש ראשון

```bash
fly ssh console -C "sh -c 'cd /app && pnpm db:create-admin oron@ono-m.org \"אורון\"'"
# הפקודה מדפיסה סיסמה חזקה פעם אחת. אפשר גם לקבוע בעצמכם: ... \"אורון\" \"הסיסמה-שלכם\"
```

נכנסים ל-https://letters.ono-m.org עם המייל והסיסמה, ומשם מוסיפים משתמשים במסך "משתמשים".

## עדכון גרסה

```bash
git pull && fly deploy
```

## גיבוי

- מסד: Supabase שומר גיבוי יומי (7 ימים בתוכנית החינמית).
- קבצים: Fly שומר צילום יומי של ה-volume (`fly volumes snapshots list`).

## בלי Fly: כל שרת לינוקס עם Docker

```bash
cd deploy
cp .env.example .env        # למלא
docker compose up -d --build                    # אם כבר יש reverse proxy, הפנו אותו ל-127.0.0.1:3100
docker compose --profile https up -d --build    # או: Caddy מוציא HTTPS לבד (פורטים 80/443)
docker compose run --rm web pnpm db:create-admin <מייל> "<שם>"
```
