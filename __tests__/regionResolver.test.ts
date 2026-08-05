import { describe, it, expect } from "vitest";
import { resolveRegion } from "@/lib/regionResolver";
import { DEFAULT_REGION } from "@/lib/regions";

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
    expect(resolveRegion(geo("evil<script>"))).toBe(DEFAULT_REGION);
    expect(resolveRegion(geo("AUS"))).toBe(DEFAULT_REGION);
  });

  it("ignores an unsupported explicit choice rather than pinning to it", () => {
    // Falls through to geo, so an unsupported request doesn't strand the user
    // on the default when we do know roughly where they are.
    expect(resolveRegion(geo("AU"), "ZZ")).toBe("AU");
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

  it("always returns a supported region code", () => {
    // Whatever comes in, the result must be usable by resolveRegionPack.
    for (const input of ["ZZ", "", "🙂", "AU"]) {
      expect(resolveRegion(headers(), input)).toBe(DEFAULT_REGION);
    }
  });
});
