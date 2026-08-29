// Cross-origin access control for the public API.
//
// Until now every route was same-origin only — no CORS headers at all, so a
// browser blocked any cross-origin read. That is the correct default and it
// stays the default: this module opens exactly one route to exactly the origins
// named in configuration, and nothing else changes.
//
// The consumer this exists for is the WebExtension (roadmap Phase 2b). An
// extension's fetch sends `Origin: chrome-extension://<id>` (or
// `moz-extension://<uuid>` on Firefox), and those identifiers are not knowable
// until the extension is packaged and published. So the allowlist is
// configuration rather than code, and it is **empty by default**: a deployment
// that sets nothing trusts only its own site origin, which is exactly today's
// behaviour.
//
// What this deliberately does NOT do:
//
//   · No wildcard, ever — not `*`, and not "any chrome-extension:// origin".
//     Matching the scheme rather than the id would let every extension on a
//     user's machine call this API from that user's browser, with their IP and
//     their rate-limit budget. There is no upside to trade against that.
//   · No credentials. `Access-Control-Allow-Credentials` is never sent, so a
//     cross-origin caller cannot ride on a user's cookies. The API is
//     unauthenticated; nothing here should imply otherwise.
//   · No effect on the write paths. `/api/report`, `/api/bug` and `/api/ocr`
//     stay same-origin, so their abuse defences keep the exposure they were
//     designed against.

import { SITE_URL } from "@/lib/siteUrl";

/**
 * Origins permitted to call the CORS-enabled routes, lowest-friction first:
 *
 *   1. The site's own origin — same-origin requests do not carry `Origin` at
 *      all for simple GETs, but a same-site fetch from a different subdomain
 *      does, and the canonical origin is always legitimate.
 *   2. `CORS_ALLOWED_ORIGINS` — comma-separated, empty by default. This is
 *      where an extension id goes once the extension is published.
 *
 * Parsed once at module load: the value comes from the environment and cannot
 * change between requests, and re-parsing per request would be wasted work on
 * the hot path.
 */
function parseAllowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    // A trailing slash is the most common way to write an origin wrongly, and
    // it never matches: browsers send the serialised origin with no path.
    // Normalising is friendlier than silently refusing a plausible-looking
    // config value.
    .map((o) => o.replace(/\/+$/, ""));

  return new Set([SITE_URL.replace(/\/+$/, ""), ...configured]);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

/** The configured allowlist. Exported for tests and for the health check. */
export function allowedOrigins(): ReadonlySet<string> {
  return ALLOWED_ORIGINS;
}

/**
 * Whether `origin` may call a CORS-enabled route.
 *
 * A missing origin is *not* allowed-by-default here — callers decide what to do
 * with a same-origin request, which carries no `Origin` header. Keeping this
 * function strictly about the allowlist means it cannot accidentally authorise
 * a header-less cross-origin request.
 */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin.replace(/\/+$/, ""));
}

/**
 * CORS response headers for a request from `origin`, or an empty object when
 * the origin is not allowed.
 *
 * Returning nothing for a disallowed origin is the whole enforcement mechanism:
 * the browser refuses to expose a response that lacks
 * `Access-Control-Allow-Origin`. The request still reaches the handler and is
 * still rate-limited, which is deliberate — CORS is a browser policy, not a
 * server firewall, and treating it as one would be a false comfort. Anything
 * that must not be reachable by a non-browser client needs a different control.
 */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  if (!isAllowedOrigin(origin)) return {};
  return {
    // Echoing the specific origin rather than "*" keeps the response
    // uncacheable across origins by proxies that key on Vary, and is required
    // for the allowlist to mean anything.
    "Access-Control-Allow-Origin": origin as string,
    // Without this, a shared cache could serve a response containing one
    // origin's Allow-Origin header to a different origin.
    Vary: "Origin",
  };
}

/**
 * Headers for a CORS preflight (`OPTIONS`) response.
 *
 * A preflight is sent when the request is not "simple" — and a JSON POST is
 * not, because of its `Content-Type`. So every extension check will preflight
 * before the real request, and a route that answers only POST would fail with a
 * 405 before the browser ever sends it.
 */
export function corsPreflightHeaders(
  origin: string | null | undefined,
  methods: string[],
): Record<string, string> {
  const base = corsHeaders(origin);
  if (Object.keys(base).length === 0) return {};
  return {
    ...base,
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    // Only what the client actually needs to send. Reflecting
    // Access-Control-Request-Headers verbatim would let a caller pre-authorise
    // any header it likes, which defeats the point of naming them.
    "Access-Control-Allow-Headers": "Content-Type",
    // Cache the preflight so a burst of checks costs one OPTIONS, not one per
    // request. 24h is the Chromium cap; Firefox caps lower and will clamp.
    "Access-Control-Max-Age": "86400",
  };
}
