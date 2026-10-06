// Screenshots for design review:
//   BASE_URL=http://localhost:<port> node e2e/shots.mjs <outDir> <email>=<path>:<file>[:<width>[:dark]] ...
// e.g. node e2e/shots.mjs /tmp/shots oron@ono.ac.il=/:home oron@ono.ac.il=/:home-phone:390 demo-shaked@example.test=/:advisor:1280:dark
// Signs in once per email (demo password), then captures each page in full.
import { mkdirSync } from "node:fs";
import { launch, loginWith } from "./helpers.mjs";

const base = process.env.BASE_URL ?? process.env.BASE ?? "http://localhost:3000";
const [out, ...specs] = process.argv.slice(2);
if (!out || specs.length === 0) {
  console.error("usage: node e2e/shots.mjs <outDir> <email>=<path>:<file>[:<width>[:dark]] ...");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const browser = await launch();
try {
  const login = loginWith(browser, base);
  const sessions = new Map();
  for (const spec of specs) {
    const [email, rest] = spec.split("=");
    const [path, file, width, scheme] = rest.split(":");
    if (!sessions.has(email)) {
      const page = await login(email);
      sessions.set(email, await page.context().storageState());
      await page.context().close();
    }
    const ctx = await browser.newContext({
      storageState: sessions.get(email),
      viewport: { width: Number(width || 1280), height: 900 },
      locale: "he-IL",
      colorScheme: scheme === "dark" ? "dark" : "light",
    });
    const page = await ctx.newPage();
    await page.goto(base + path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${file}.png`, fullPage: true });
    await ctx.close();
    console.log("shot", file);
  }
} finally {
  await browser.close();
}
