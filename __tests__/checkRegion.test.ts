import { describe, it, expect } from "vitest";
import { normaliseCheckRegion, CHECK_REGION_STORAGE_KEY } from "@/lib/checkRegion";
import { supportedRegions } from "@justcheckingmate/engine/regions";

describe("normaliseCheckRegion", () => {
  it("accepts every supported region code, case-insensitively", () => {
    for (const code of supportedRegions()) {
      expect(normaliseCheckRegion(code)).toBe(code);
      expect(normaliseCheckRegion(code.toLowerCase())).toBe(code);
    }
  });

  it("degrades anything else to auto (null)", () => {
    expect(normaliseCheckRegion(null)).toBeNull();
    expect(normaliseCheckRegion(undefined)).toBeNull();
    expect(normaliseCheckRegion("")).toBeNull();
    expect(normaliseCheckRegion("  ")).toBeNull();
    expect(normaliseCheckRegion("XX")).toBeNull();
    expect(normaliseCheckRegion("UK")).toBeNull();
    expect(normaliseCheckRegion(42)).toBeNull();
  });

  it("uses a storage key in the jcm_ namespace", () => {
    expect(CHECK_REGION_STORAGE_KEY.startsWith("jcm_")).toBe(true);
  });
});
