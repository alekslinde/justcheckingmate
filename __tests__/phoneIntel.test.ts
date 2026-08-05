import { describe, it, expect } from "vitest";
import { analysePhone } from "@/lib/phoneIntel";
import { checkPhone } from "@/lib/scamDetector";
import { FALLBACK_REGION } from "@/lib/regions";

// Phase 4 — phone number generalisation.
//
// Parsing, validity, line type and country come from libphonenumber; the scam
// heuristics (wangiri, high-scam origins, spoofing risk) and the national
// number-plan semantics on each pack's phonePlan stay ours. These tests cover
// the seam between the two, and the regions Phase 5 targets.

describe("analysePhone — AU (region with a full pack)", () => {
  it("classifies mobile, fixed, toll-free and shared-cost lines", () => {
    expect(analysePhone("+61412345678", "AU").lineType).toBe("mobile");
    expect(analysePhone("+61280001234", "AU").lineType).toBe("fixed");
    expect(analysePhone("1800123456", "AU").lineType).toBe("freecall");
    expect(analysePhone("1300975707", "AU").lineType).toBe("shared_cost");
  });

  it("accepts national format without a country code", () => {
    const national = analysePhone("0412345678", "AU");
    const international = analysePhone("+61412345678", "AU");
    expect(national.lineType).toBe("mobile");
    expect(national.normalised).toBe(international.normalised);
  });

  it("keeps the 190x premium rule even though libphonenumber rejects it", () => {
    // libphonenumber reports +61 190… as invalid, so deferring to it would
    // degrade "you will be charged premium rates" into "invalid number".
    const intel = analysePhone("+61190012345", "AU");
    expect(intel.lineType).toBe("premium");
    expect(intel.spoofingRisk).toBe("very_high");
  });

  it("flags VoIP-range mobiles from the pack's phonePlan", () => {
    const intel = analysePhone("0480123456", "AU");
    expect(intel.lineType).toBe("voip_likely");
    expect(intel.spoofingRisk).toBe("medium");
  });

  it("never scores emergency numbers as suspicious", () => {
    for (const n of ["000", "112", "106"]) {
      const intel = analysePhone(n, "AU");
      expect(intel.lineType).toBe("emergency");
      expect(intel.spoofingRisk).toBe("low");
    }
  });

  it("maps geographic area codes to a named region", () => {
    expect(analysePhone("+61280001234", "AU").region).toBe("New South Wales / ACT");
    expect(analysePhone("+61390001234", "AU").region).toBe("Victoria / Tasmania");
  });
});

describe("analysePhone — UK", () => {
  // No UK pack exists yet (Phase 5). Parsing must still follow the requested
  // region, or British input would be read against the Australian number plan.
  it("parses national-format UK mobiles as UK, not as broken AU numbers", () => {
    const intel = analysePhone("07911123456", "GB");
    expect(intel.lineType).toBe("mobile");
    expect(intel.isDomestic).toBe(true);
    expect(intel.country).toBe("United Kingdom");
  });

  it("classifies fixed, freephone and premium UK lines", () => {
    expect(analysePhone("+442079460123", "GB").lineType).toBe("fixed");
    expect(analysePhone("+448009177777", "GB").lineType).toBe("freecall");

    const premium = analysePhone("+449098790123", "GB");
    expect(premium.lineType).toBe("premium");
    expect(premium.spoofingRisk).toBe("very_high");
  });

  it("treats Crown Dependency ranges as domestic for a UK user", () => {
    // libphonenumber resolves this ordinary +44 mobile to GG (Guernsey), which
    // shares the UK's ranges — it must not read as a foreign number.
    const intel = analysePhone("+447911123456", "GB");
    expect(intel.isDomestic).toBe(true);
    expect(intel.country).toBe("United Kingdom");
  });

  it("treats an Australian number as foreign for a UK user", () => {
    const intel = analysePhone("+61412345678", "GB");
    expect(intel.isDomestic).toBe(false);
    expect(intel.country).toBe("Australia");
  });
});

describe("analysePhone — US", () => {
  it("classifies mobile and toll-free lines", () => {
    const mobile = analysePhone("+12125551234", "US");
    expect(mobile.lineType).toBe("mobile");
    expect(mobile.isDomestic).toBe(true);
    expect(mobile.country).toBe("United States");

    expect(analysePhone("+18005551212", "US").lineType).toBe("freecall");
  });

  it("treats a UK number as foreign for a US user", () => {
    expect(analysePhone("+442079460123", "US").isDomestic).toBe(false);
  });
});

describe("analysePhone — region-relative domesticity", () => {
  it("reports the same number as domestic or foreign depending on region", () => {
    expect(analysePhone("+61412345678", "AU").isDomestic).toBe(true);
    expect(analysePhone("+61412345678", "GB").isDomestic).toBe(false);
    expect(analysePhone("+447911123456", "GB").isDomestic).toBe(true);
    expect(analysePhone("+447911123456", "AU").isDomestic).toBe(false);
  });

  it("defaults to AU when no region is given", () => {
    expect(analysePhone("0412345678")).toEqual(analysePhone("0412345678", "AU"));
  });

  it("still parses national input for the base-only region", () => {
    // ZZ is the coverage:"none" pack, not a country. National-format input has
    // to be read against some plan, so it uses the default region — but the
    // national plan is withheld, so no Australian specifics leak into the copy.
    const intel = analysePhone("0412345678", FALLBACK_REGION);
    expect(intel.lineType).toBe("mobile");
    expect(analysePhone("1300975707", FALLBACK_REGION).spoofingNotes.join(" "))
      .not.toMatch(/ATO|myGov|Centrelink/);
  });
});

describe("analysePhone — scam heuristics stay ours", () => {
  it("flags wangiri origins regardless of region", () => {
    for (const region of ["AU", "GB", "US"]) {
      const intel = analysePhone("+252612345678", region);
      expect(intel.wangiriRisk).toBe(true);
      expect(intel.spoofingRisk).toBe("very_high");
    }
  });

  it("flags high-scam country origins", () => {
    const intel = analysePhone("+2348012345678", "AU");
    expect(intel.highScamCountry).toBe(true);
    expect(intel.spoofingRisk).toBe("high");
  });

  it("softens elevated-volume origins to medium with balanced wording", () => {
    const intel = analysePhone("+919876543210", "AU");
    expect(intel.spoofingRisk).toBe("medium");
    expect(intel.spoofingNotes.join(" ")).toContain("perfectly legitimate");
  });

  it("rejects fabricated numbers", () => {
    expect(analysePhone("12345", "AU").spoofingRisk).toBe("very_high");
    expect(analysePhone("111111111", "AU").spoofingRisk).toBe("very_high");
  });
});

describe("checkPhone — region-neutral copy", () => {
  it("no longer hardcodes Australian agencies or ranges in flags", () => {
    const flags = checkPhone("+448009177777", "GB").flags.join(" ");
    expect(flags).not.toMatch(/ATO|myGov|Centrelink|1300|1800|190x/i);
  });

  it("describes foreign-origin risk without naming Australia", () => {
    const flags = checkPhone("+2348012345678", "GB").flags.join(" ");
    expect(flags).toContain("your region");
    expect(flags).not.toContain("targeting Australia");
  });

  it("still surfaces the AU-specific wording for an AU check", () => {
    // Region-specific copy moved to the pack, so it must still reach the user.
    const flags = checkPhone("1300975707", "AU").flags.join(" ");
    expect(flags).toMatch(/ATO|myGov|Centrelink/);
  });

  it("attaches intel to the result", () => {
    expect(checkPhone("+61412345678", "AU").phoneIntel?.isDomestic).toBe(true);
  });
});
