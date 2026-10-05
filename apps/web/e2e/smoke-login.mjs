// Manual smoke: log in with the demo password (from the seed) and screenshot both screens.
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.OUT_DIR ?? ".";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(`${base}/login`);
await page.screenshot({ path: `${out}/login.png` });
await page.fill("#email", "advisor1@example.test");
await page.fill("#password", process.env.DEMO_PASSWORD ?? "demo-password-1");
await page.click("button:has-text('כניסה')");
await page.waitForURL(`${base}/`);
await page.screenshot({ path: `${out}/home.png` });
console.log("Logged in, heading:", await page.textContent("h1"));
await browser.close();
