import type { NextConfig } from "next";

// Content Security Policy — prevents the browser from making any outbound
// requests to external origins. This is the hard guarantee that even if
// a bug or future code change tried to fetch a suspicious URL, the browser
// would block it before a single byte left the machine.
//
// connect-src 'self'  → fetch()/XHR can only call our own API routes
// img-src 'self' data: → no external pixel trackers
// frame-ancestors 'none' → can't be embedded in an iframe (clickjacking)
// form-action 'self'  → form POSTs can only go to our own origin
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires these
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",           // <-- no outbound fetch to external URLs
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevents the Referer header being sent if a user navigates from
          // our app to any external URL — scammer never sees our domain.
          { key: "Referrer-Policy", value: "no-referrer" },

          // Stops Chrome/Firefox from speculatively resolving hostnames found
          // in page content, which would send DNS queries to the scammer's
          // nameserver even without the user clicking anything.
          { key: "X-DNS-Prefetch-Control", value: "off" },

          // Hard block on outbound requests (see comment above).
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
