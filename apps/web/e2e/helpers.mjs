// Shared pieces of the manual smoke scripts. They drive a running dev server with Playwright 1.63
// (installed at the project root) and the sample data from the seed.
import { chromium } from "@playwright/test";

/** The sample users of the seed (all with the demo password). */
export const DEMO = {
  control: "oron@ono.ac.il", // ורוניקה: control manager, and registration manager of business administration in Ono
  vp: "yosef.ehr@ono.ac.il",
  advisor: "demo-shaked@example.test",
  advisorAndManager: "demo-shuli@example.test",
};

/**
 * A clean test browser: never the person's own Chrome or profile, and a mock keychain so macOS
 * does not ask for the keychain password. Close it in a `finally`.
 */
export function launch() {
  return chromium.launch({ args: ["--use-mock-keychain"], executablePath: process.env.CHROMIUM_PATH || undefined });
}

/** Signs in through the login form; resolves once the app has left the login page. */
export function loginWith(browser, base) {
  return async function login(email, viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport, locale: "he-IL" });
    const page = await context.newPage();
    const res = await page.goto(`${base}/login`);
    if (!res || res.status() >= 400) {
      await context.close();
      throw new Error(`the login page answered ${res?.status() ?? "nothing"}`);
    }
    await page.fill("#email", email);
    await page.fill("#password", process.env.DEMO_PASSWORD ?? "demo-password-1");
    await page.press("#password", "Enter");
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    return page;
  };
}

/** How far the page scrolls sideways (0 is right). */
export const sidewaysOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * Opens `url` at desktop and phone width, screenshots both, and returns what went wrong:
 * an error status, script errors on the page, or sideways scrolling.
 */
export async function checkPage(page, url, name, out) {
  const problems = [];
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const res = await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => {});
    if (!res || res.status() >= 400) problems.push(`${name}: status ${res?.status() ?? "none"} at ${url}`);
    const overflow = await sidewaysOverflow(page);
    if (overflow > 0) problems.push(`${name} at ${width}px scrolls sideways by ${overflow}px`);
    if (out) await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
  }
  page.off("pageerror", onError);
  for (const e of errors) problems.push(`${name}: page error: ${e}`);
  await page.setViewportSize({ width: 1280, height: 900 });
  return problems;
}
