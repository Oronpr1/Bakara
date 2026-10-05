// Screenshots for design review: node e2e/shots.mjs <outDir> <email>=<path>:<file>[:<width>] ...
// Logs in once per email (codes read from the dev server log), then captures each page in full.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loginWith } from "./helpers.mjs";

const base = process.env.BASE ?? "http://localhost:3100";
const log = process.env.LOG ?? "/tmp/al-web.log";
const [out, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const login = loginWith(browser, base, log);
const sessions = new Map();
for (const spec of specs) {
  const [email, rest] = spec.split("=");
  const [path, file, width, scheme] = rest.split(":");
  if (!sessions.has(email)) sessions.set(email, await (await login(email)).context().storageState());
  const ctx = await browser.newContext({
    storageState: sessions.get(email),
    viewport: { width: Number(width ?? 1280), height: 900 },
    locale: "he-IL",
    colorScheme: scheme === "dark" ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${file}.png`, fullPage: true });
  await ctx.close();
  console.log("shot", file);
}
await browser.close();
