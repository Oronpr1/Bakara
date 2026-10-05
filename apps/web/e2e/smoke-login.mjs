// Manual smoke: log in with an emailed code (read from the dev server log) and screenshot both screens.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const log = process.env.SERVER_LOG ?? "/tmp/al-web.log";
const out = process.env.OUT_DIR ?? ".";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(`${base}/login`);
await page.screenshot({ path: `${out}/login.png` });
await page.fill("#email", "advisor1@example.test");
await page.click("button:has-text('שלחו לי קוד כניסה')");
await page.waitForSelector("#code");
await page.waitForTimeout(500);
const codes = [...readFileSync(log, "utf8").matchAll(/קוד הכניסה שלך: (\d{6})/g)];
await page.fill("#code", codes.at(-1)[1]);
await page.screenshot({ path: `${out}/code.png` });
await page.click("button:has-text('כניסה')");
await page.waitForURL(`${base}/`);
await page.screenshot({ path: `${out}/home.png` });
console.log("Logged in, heading:", await page.textContent("h1"));
await browser.close();
