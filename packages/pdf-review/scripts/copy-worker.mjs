#!/usr/bin/env node
// Copies the pdf.js worker that matches this package's pdf.js into a host's
// static folder, e.g. `al-pdf-review-copy-worker public` in a Next.js app.
// The worker must be the exact pdf.js version the viewer runs.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const dest = resolve(process.argv[2] ?? "public");
const name = process.argv[3] ?? "pdf.worker.min.mjs";
const src = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
mkdirSync(dest, { recursive: true });
copyFileSync(src, join(dest, name));
console.log(`pdf.js worker -> ${join(dest, name)}`);
