import { describe, it, expect } from "vitest";
import { isSameOriginRead } from "@/lib/readGuard";
import { SITE_URL } from "@/lib/siteUrl";

const SITE_ORIGIN = SITE_URL.replace(/\/+$/, "");

// Cost controls for the free tier, not a confidentiality boundary.
//
// The submissions feed is PII-scrubbed and already published at /submissions,
// so nothing here is protecting secrets. What it protects is the free-tier
// row-read budget: every /api/reports call runs two queries, and an unthrottled
// feed is the cheapest way for one script to take the site down for everyone.
//
// Read these assertions with that framing. "Forbidden" here means "not worth
// serving", not "not permitted to know".

const headers = (h: Record<string, string>) => new Headers(h);

describe("same-origin read guard", () => {
  it("allows a request with neither Origin nor Referer", () => {
    // Same-origin navigations and simple GETs send neither, and so does the
    // server rendering its own page. Refusing here would break the site, which
    // is why this hole is deliberate and documented.
    expect(isSameOriginRead(headers({}))).toBe(true);
  });

  it("refuses a foreign Origin", () => {
    expect(isSameOriginRead(headers({ origin: "https://evil.example" }))).toBe(false);
  });

  it("refuses a foreign Referer when Origin is absent", () => {
    // Some browsers omit Origin on same-site GETs but still send Referer, so
    // the Referer path has to be checked rather than waved through.
    expect(isSameOriginRead(headers({ referer: "https://evil.example/page" }))).toBe(false);
  });

  it("refuses an unparseable Referer", () => {
    // A malformed header is not evidence of anything good; failing open here
    // would make the guard trivially bypassable by sending junk.
    expect(isSameOriginRead(headers({ referer: "not-a-url" }))).toBe(false);
  });

  it("prefers Origin over Referer when both are present", () => {
    // A forged Referer must not launder a foreign Origin.
    expect(
      isSameOriginRead(headers({ origin: "https://evil.example", referer: "https://veriguard.app/x" })),
    ).toBe(false);
  });
});

describe("what this guard is not", () => {
  it("lets a forged Origin through, which is why it is not auth", () => {
    // Asserted as BEHAVIOUR rather than by grepping for a comment: a source
    // grep passes on a stale comment and fails on an innocuous reword, so it
    // tests the prose rather than the code. Anything that can set headers can
    // present the site's own origin and be admitted — that is inherent to the
    // mechanism, and the reason the rate limit behind it is what actually
    // bounds a determined caller.
    const forged = new Headers({ origin: SITE_ORIGIN });
    expect(isSameOriginRead(forged)).toBe(true);
  });
});

// ── Route level ──────────────────────────────────────────────────────────────
//
// The unit tests above cover the guard in isolation, which left the real gap:
// deleting the guard, the rate limit or the cache header from the route left
// the whole suite green. These exercise the handler itself.

describe("GET /api/reports", () => {
  const url = "https://veriguard.app/api/reports";

  it("refuses a foreign origin before touching the database", async () => {
    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(
      new Request(url, { headers: { origin: "https://evil.example" } }) as never,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden_origin");
  });

  it("does not let a cache serve that refusal to a legitimate visitor", async () => {
    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(
      new Request(url, { headers: { origin: "https://evil.example" } }) as never,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("varies the cached success on Origin", async () => {
    // Without this the CDN serves a cached 200 to any origin and the guard
    // above never runs — the cache silently defeats layer 1.
    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(new Request(url) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("cache-control")).toContain("s-maxage");
  });
});

describe("GET /api/stats", () => {
  it("serves the public counters to anyone", async () => {
    // The hero numbers are two public integers; gating them would be theatre.
    const { GET } = await import("@/app/api/stats/route");
    const res = await GET(
      new Request("https://veriguard.app/api/stats", {
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("refuses the operational breakdown to a foreign origin", async () => {
    const { GET } = await import("@/app/api/stats/route");
    const res = await GET(
      new Request("https://veriguard.app/api/stats?breakdown=1", {
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(403);
  });
});
