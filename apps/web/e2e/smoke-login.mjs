// Manual smoke: the login page, a wrong password, and signing in as the control manager.
//   BASE_URL=http://localhost:<port> OUT_DIR=/tmp/shots node e2e/smoke-login.mjs
import { mkdirSync } from "node:fs";
import { DEMO, launch, loginWith } from "./helpers.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.OUT_DIR ?? "./smoke-shots";
mkdirSync(out, { recursive: true });

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "he-IL" });
  await page.goto(`${base}/login`);
  await page.screenshot({ path: `${out}/login.png` });

  await page.fill("#email", DEMO.control);
  await page.fill("#password", "not-the-password");
  await page.press("#password", "Enter");
  const error = page.locator("#login-error");
  await error.waitFor();
  console.log("Wrong password says:", (await error.textContent())?.trim());

  const home = await loginWith(browser, base)(DEMO.control);
  await home.screenshot({ path: `${out}/home.png` });
  console.log("Signed in; now at", new URL(home.url()).pathname, "| heading:", (await home.locator("h1").first().textContent())?.trim());
} finally {
  await browser.close();
}
