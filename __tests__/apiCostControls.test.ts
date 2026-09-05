import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSameOriginRead } from "@/lib/readGuard";

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
  it("is documented as forgeable rather than presented as a lock", () => {
    // The failure mode worth guarding against is a future reader treating this
    // as authentication and putting something private behind it. Origin and
    // Referer are set by the browser and ignored by curl.
    const src = readFileSync(join(process.cwd(), "lib/readGuard.ts"), "utf8");
    expect(src).toMatch(/not a security boundary|forge/i);
  });
});
