// Manual smoke over the new screens, for every sample role: the home page and the letters it links
// to open without an error status or script error, at desktop (1280) and phone (390) width, without
// sideways scrolling; and a broken academic link lands on its explanation page. Screenshots of each.
// Needs a dev server on the sample data (see docs/03-build-brief.md):
//   BASE_URL=http://localhost:<port> OUT_DIR=/tmp/shots node e2e/smoke-pages.mjs
// It only reads: nothing is approved, uploaded or changed (signing in records a LOGIN event).
import { mkdirSync } from "node:fs";
import { checkPage, DEMO, launch, loginWith } from "./helpers.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.OUT_DIR ?? "./smoke-shots";
const lettersPerRole = Number(process.env.LETTERS ?? 3);
mkdirSync(out, { recursive: true });

const problems = [];
const browser = await launch();
try {
  const login = loginWith(browser, base);
  for (const [role, email] of Object.entries(DEMO)) {
    let page;
    try {
      page = await login(email);
    } catch (e) {
      problems.push(`${role}: could not sign in (${e.message.split("\n")[0]})`);
      continue;
    }
    problems.push(...(await checkPage(page, `${base}/`, `${role}-home`, out)));
    // Whatever the home screen looks like, its rows link to /letters/<id>.
    const links = [...new Set(await page.locator('a[href^="/letters/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href"))))];
    console.log(`${role}: ${links.length} letter links on the home page`);
    for (const [i, href] of links.slice(0, lettersPerRole).entries())
      problems.push(...(await checkPage(page, `${base}${href}`, `${role}-letter-${i + 1}`, out)));
    // Someone else's letter id that does not exist: not found, never an error page.
    const res = await page.goto(`${base}/letters/00000000-0000-0000-0000-000000000000`);
    if (res && res.status() >= 500) problems.push(`${role}: a missing letter answers ${res.status()}`);
    await page.context().close();
  }

  // The academic approver has no password; a wrong link explains itself.
  const visitor = await browser.newPage({ locale: "he-IL" });
  await visitor.goto(`${base}/a/not-a-real-link-0123456789abcdef`);
  console.log("Wrong academic link lands on", new URL(visitor.url()).pathname);
  problems.push(...(await checkPage(visitor, visitor.url(), "academic-bad-link", out)));
} finally {
  await browser.close();
}

console.log(`Screenshots in ${out}`);
if (problems.length) {
  console.log(`Problems (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
} else console.log("No problems found");
