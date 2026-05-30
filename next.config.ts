import type { NextConfig } from "next";

// Content Security Policy — prevents the browser from making any outbound
// requests to external origins. This is the hard guarantee that even if
// a bug or future code change tried to fetch a suspicious URL, the browser
// would block it before a single byte left the machine.
//
// connect-src 'self'  → fetch()/XHR can only call our own API routes
// img-src 'self' data: blob: → canvas preview, no external pixel trackers
// frame-ancestors 'none' → can't be embedded in an iframe (clickjacking)
// form-action 'self'  → form POSTs can only go to our own origin
// worker-src blob:    → tesseract.js spawns Web Workers from blob: URLs
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires these
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src blob: 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Keep native-module packages out of the Next.js bundle so they load
  // directly from node_modules at runtime.
  serverExternalPackages: ["sharp", "tesseract.js"],

  // Tesseract resolves three runtime assets by string path, none of which
  // Next.js file tracing can detect statically, so all must be declared here
  // or Vercel omits them from the function bundle:
  //   1. eng.traineddata.gz   — language data (process.cwd()/public/tessdata)
  //   2. tesseract-core*.wasm — the WASM core, readFileSync'd by the JS shim
  //      at runtime (the .js shims ARE traced, the .wasm binaries are not).
  // Without the .wasm files the worker fails to initialise; the failure is
  // otherwise silent and the request hangs until the client aborts.
  outputFileTracingIncludes: {
    "/api/ocr": [
      "./public/tessdata/**/*",
      "./node_modules/tesseract.js-core/*.wasm",
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "browsing-topics=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
