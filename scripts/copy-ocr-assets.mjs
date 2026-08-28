// Copies the tesseract.js browser runtime into public/ so OCR can run on the
// user's device instead of on our server.
//
// Why copy rather than let tesseract fetch its own assets: by default
// tesseract.js pulls the worker script and WASM core from a CDN. Our CSP is
// `default-src 'self'` (next.config.ts) and deliberately allows no external
// origin, so those fetches are blocked. Serving the same files from our own
// origin keeps the CSP intact — no external request is ever made, which is the
// same guarantee the rest of the app already gives.
//
// Copied (not committed): the WASM cores are ~3 MB each and are reproducible
// from node_modules, so they are generated at build time and gitignored. The
// language data (eng.traineddata.gz) IS committed — it does not ship with a
// package we depend on.
//
// Run: npm run ocr-assets  (also runs automatically via prebuild)
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const OUT = new URL("../public/tesseract/", import.meta.url);

// The single-threaded SIMD core. tesseract.js picks a core at runtime based on
// what the browser supports; we ship the non-LSTM SIMD build plus the plain
// fallback so a browser without SIMD still works.
const CORE_DIR = path.dirname(require.resolve("tesseract.js-core/package.json"));
const WORKER = require.resolve("tesseract.js/dist/worker.min.js");

const FILES = [
  [WORKER, "worker.min.js"],
  [path.join(CORE_DIR, "tesseract-core-simd.wasm"), "tesseract-core-simd.wasm"],
  [path.join(CORE_DIR, "tesseract-core.wasm"), "tesseract-core.wasm"],
  [path.join(CORE_DIR, "tesseract-core-simd.js"), "tesseract-core-simd.js"],
  [path.join(CORE_DIR, "tesseract-core.js"), "tesseract-core.js"],
];

mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const [src, name] of FILES) {
  if (!existsSync(src)) {
    console.error(`✗ missing: ${src}`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(src, new URL(name, OUT));
  copied += 1;
}

console.log(`✓ copied ${copied}/${FILES.length} tesseract assets into public/tesseract/`);
