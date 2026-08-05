import { describe, it, expect } from "vitest";
import { resolveRegion } from "@/lib/regionResolver";
import { DEFAULT_REGION, FALLBACK_REGION, supportedRegions } from "@/lib/regions";

const headers = (map: Record<string, string> = {}) => new Headers(map);
const geo = (country: string) => headers({ "x-vercel-ip-country": country });

describe("resolveRegion", () => {
  it("prefers an explicit supported choice over the geo header", () => {
    expect(resolveRegion(geo("AU"), "AU")).toBe("AU");
  });

  it("falls back to the geo header when no choice is given", () => {
    expect(resolveRegion(geo("AU"))).toBe("AU");
  });

  it("falls back to the default when geo headers are absent", () => {
    // Normal path in local dev and behind privacy proxies — not an error.
    expect(resolveRegion(headers())).toBe(DEFAULT_REGION);
  });

  it("falls back to the default for a malformed geo header", () => {
    // Malformed means "no signal", not "a country we don't cover".
    expect(resolveRegion(geo("evil<script>"))).toBe(DEFAULT_REGION);
    expect(resolveRegion(geo("AUS"))).toBe(DEFAULT_REGION);
  });

  it("sends a known-but-uncovered country to the base-only pack", () => {
    // Applying AU agency and brand rules to a German user would be useless and
    // would wrongly claim full coverage.
    expect(resolveRegion(geo("DE"))).toBe(FALLBACK_REGION);
    expect(resolveRegion(geo("US"))).toBe(FALLBACK_REGION);
  });

  it("ignores an unsupported explicit choice rather than pinning to it", () => {
    // Falls through to geo, so an unsupported request doesn't strand the user
    // on the default when we do know roughly where they are.
    expect(resolveRegion(geo("AU"), "QQ")).toBe("AU");
  });

  it("honours an explicit fallback-region choice", () => {
    expect(resolveRegion(geo("AU"), FALLBACK_REGION)).toBe(FALLBACK_REGION);
  });

  it.each([undefined, null, "", "   ", 42, {}, []])(
    "ignores a non-string or empty choice (%p)",
    (choice) => {
      expect(resolveRegion(geo("AU"), choice)).toBe("AU");
    },
  );

  it("accepts a lower-case explicit choice", () => {
    expect(resolveRegion(headers(), "au")).toBe("AU");
  });

  it("falls back to the default when there is no geo signal at all", () => {
    // Distinct from "we know where you are and don't cover it" — with no
    // header there is nothing to be honest about, so behaviour is unchanged.
    for (const input of ["QQ", "", "🙂"]) {
      expect(resolveRegion(headers(), input)).toBe(DEFAULT_REGION);
    }
  });

  it("always returns a code that resolves to a real pack", () => {
    const inputs = ["QQ", "", "🙂", "AU", "ZZ", null, undefined];
    for (const input of inputs) {
      const code = resolveRegion(geo("DE"), input);
      expect(supportedRegions()).toContain(code);
    }
  });
});
