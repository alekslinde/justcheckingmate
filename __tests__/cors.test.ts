import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// This is an access-control boundary, so the negative cases carry the weight:
// a test that only proves an allowed origin works would pass just as happily if
// the allowlist were ignored entirely. Every "allows" case below has a matching
// "refuses" case, and the module-reload helper exists so the env-driven
// allowlist can be exercised at more than one configuration.

const SITE = "https://justcheckingmate.com";

/**
 * Load lib/cors with a specific environment.
 *
 * The allowlist is parsed once at module load — it comes from the environment
 * and cannot change between requests, so re-parsing per call would be wasted
 * work on the hot path. That makes it module state, which has to be reset
 * between tests rather than mutated.
 */
async function loadCors(env: { site?: string; allowed?: string }) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SITE_URL = env.site ?? SITE;
  if (env.allowed === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
  else process.env.CORS_ALLOWED_ORIGINS = env.allowed;
  return import("@/lib/cors");
}

const ORIGINAL = { ...process.env };
beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("allowlist composition", () => {
  it("trusts the site's own origin with no configuration", async () => {
    const { isAllowedOrigin } = await loadCors({});
    expect(isAllowedOrigin(SITE)).toBe(true);
  });

  it("trusts nothing else when CORS_ALLOWED_ORIGINS is unset", async () => {
    // The default posture: a deployment that configures nothing behaves
    // exactly as it did before CORS existed.
    const { isAllowedOrigin, allowedOrigins } = await loadCors({});
    expect(allowedOrigins().size).toBe(1);
    for (const origin of [
      "https://evil.example",
      "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef",
      "moz-extension://11111111-2222-3333-4444-555555555555",
      "null",
    ]) {
      expect(isAllowedOrigin(origin), `${origin} must not be allowed by default`).toBe(false);
    }
  });

  it("adds configured origins", async () => {
    const ext = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";
    const { isAllowedOrigin } = await loadCors({ allowed: ext });
    expect(isAllowedOrigin(ext)).toBe(true);
    expect(isAllowedOrigin(SITE)).toBe(true);
  });

  it("accepts a comma-separated list with incidental whitespace", async () => {
    const a = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "moz-extension://11111111-2222-3333-4444-555555555555";
    const { isAllowedOrigin } = await loadCors({ allowed: `  ${a} ,${b},  ` });
    expect(isAllowedOrigin(a)).toBe(true);
    expect(isAllowedOrigin(b)).toBe(true);
  });

  it("normalises a trailing slash on both sides", async () => {
    // The commonest way to write an origin wrongly. Browsers send the
    // serialised origin with no path, so an unnormalised config value would
    // silently never match.
    const { isAllowedOrigin } = await loadCors({ allowed: "https://app.example/" });
    expect(isAllowedOrigin("https://app.example")).toBe(true);
    expect(isAllowedOrigin("https://app.example/")).toBe(true);
  });
});

describe("origin matching is exact", () => {
  const EXT = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";

  it("refuses a different extension id on the same scheme", async () => {
    // The reason the allowlist holds ids rather than a scheme pattern: matching
    // "any chrome-extension://" would let every extension on a user's machine
    // call the API from that user's browser, with their IP and rate budget.
    const { isAllowedOrigin } = await loadCors({ allowed: EXT });
    expect(isAllowedOrigin("chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it.each([
    ["a prefix", "https://justcheckingmate.com.evil.example"],
    ["a suffix", "https://evil.example/justcheckingmate.com"],
    ["a subdomain", "https://api.justcheckingmate.com"],
    ["a scheme downgrade", "http://justcheckingmate.com"],
    ["a port", "https://justcheckingmate.com:8443"],
  ])("refuses %s of an allowed origin", async (_label, origin) => {
    const { isAllowedOrigin } = await loadCors({});
    expect(isAllowedOrigin(origin)).toBe(false);
  });

  it("refuses a missing origin rather than defaulting to allow", async () => {
    // Same-origin requests carry no Origin header. Keeping this function
    // strictly about the allowlist means it cannot accidentally authorise a
    // header-less cross-origin request.
    const { isAllowedOrigin } = await loadCors({});
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin("")).toBe(false);
  });
});

describe("response headers", () => {
  const EXT = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";

  it("echoes the specific origin and varies on it", async () => {
    const { corsHeaders } = await loadCors({ allowed: EXT });
    const h = corsHeaders(EXT);
    expect(h["Access-Control-Allow-Origin"]).toBe(EXT);
    // Without Vary, a shared cache could hand one origin's response — carrying
    // its Allow-Origin header — to a different origin.
    expect(h["Vary"]).toBe("Origin");
  });

  it("never emits a wildcard", async () => {
    const { corsHeaders } = await loadCors({ allowed: EXT });
    expect(corsHeaders(EXT)["Access-Control-Allow-Origin"]).not.toBe("*");
  });

  it("never allows credentials", async () => {
    // The API is unauthenticated; sending this would imply otherwise and let a
    // cross-origin caller ride on a user's cookies.
    const { corsHeaders, corsPreflightHeaders } = await loadCors({ allowed: EXT });
    expect(corsHeaders(EXT)["Access-Control-Allow-Credentials"]).toBeUndefined();
    expect(corsPreflightHeaders(EXT, ["POST"])["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("returns nothing at all for a disallowed origin", async () => {
    // This is the enforcement mechanism: a response with no
    // Access-Control-Allow-Origin is one the browser refuses to expose.
    const { corsHeaders, corsPreflightHeaders } = await loadCors({ allowed: EXT });
    expect(corsHeaders("https://evil.example")).toEqual({});
    expect(corsPreflightHeaders("https://evil.example", ["POST"])).toEqual({});
  });

  it("names only the methods and headers actually needed", async () => {
    const { corsPreflightHeaders } = await loadCors({ allowed: EXT });
    const h = corsPreflightHeaders(EXT, ["POST"]);
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    // Reflecting Access-Control-Request-Headers verbatim would let a caller
    // pre-authorise any header it likes.
    expect(h["Access-Control-Allow-Headers"]).toBe("Content-Type");
    expect(h["Access-Control-Max-Age"]).toBe("86400");
  });
});
