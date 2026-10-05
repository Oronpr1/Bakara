// Screenshots of the task pane in dev preview (Office.js and the API mocked), at task-pane width.
// Usage: pnpm --filter @al/addin screenshots   (writes apps/addin/screenshots/*.png)
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = fileURLToPath(new URL("../screenshots/", import.meta.url));
await mkdir(out, { recursive: true });

const server = await createServer({ root, configFile: `${root}vite.config.ts`, server: { port: 3101, strictPort: true }, logLevel: "warn" });
await server.listen();
const base = "http://localhost:3101/index.html";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, locale: "he-IL" });
// The preview never needs the real Office.js; keep the run offline and deterministic.
await context.route("https://appsforoffice.microsoft.com/**", (route) => route.abort());

async function shot(page, name) {
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  console.log(`saved screenshots/${name}.png`);
}

async function open(scenario) {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${scenario}] page error:`, e.message));
  await page.goto(`${base}?preview=${scenario}`);
  return page;
}

try {
  // 1. Letter found, with open comments and their snapshots.
  let page = await open("found");
  await page.getByText("הערות פתוחות").waitFor();
  await page.locator("img.thumb").nth(1).waitFor();
  await page.waitForTimeout(200);
  await shot(page, "01-letter-found");

  // 2-3. Save and submit: progress while uploading, then the result.
  await page.getByPlaceholder("למשל").fill("תוקן תאריך תחילת הלימודים");
  await page.getByRole("button", { name: "שמור והעבר לבדיקה" }).click();
  await page.locator(".steps li.is-current", { hasText: "מעלים" }).waitFor();
  await page.waitForTimeout(1800);
  await shot(page, "02-uploading");
  await page.getByText(/נשמרה גרסה/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, "03-done");
  await page.close();

  // 4-5. Not a letter: saved locally ("Save As"), and a SharePoint file that is not a letter.
  page = await open("local");
  await page.getByText("זה לא קובץ של מכתב קבלה").waitFor();
  await shot(page, "04-not-a-letter-local");
  await page.close();
  page = await open("unknown");
  await page.getByText("זה לא קובץ של מכתב קבלה").waitFor();
  await shot(page, "05-not-a-letter-sharepoint");
  await page.close();

  // Other states.
  for (const [scenario, name, text] of [
    ["web", "06-word-on-the-web", "צריך את Word במחשב"],
    ["no-naa", "07-no-nested-auth", "לא תומכת בכניסה"],
    ["readonly", "08-read-only", "רק היועצת"],
    ["empty", "09-no-comments", "אין הערות פתוחות"],
    ["fail", "10-upload-failed", "שמור גרסה"],
  ]) {
    page = await open(scenario);
    await page.getByText(text).first().waitFor();
    if (scenario === "fail") {
      await page.getByRole("button", { name: "שמור גרסה" }).click();
      await page.getByText("הגרסה לא נשמרה").waitFor({ timeout: 15000 });
    }
    await page.waitForTimeout(300);
    await shot(page, name);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
