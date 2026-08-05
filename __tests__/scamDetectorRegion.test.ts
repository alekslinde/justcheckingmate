import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, checkEmail, checkCustom, checkPhone, analyzeContent } from "@/lib/scamDetector";
import { DEFAULT_REGION } from "@/lib/regions";

// Phase 2 threads an optional region through every checker. These assert the
// plumbing: omitting it must be identical to today's behaviour, and an
// unrecognised value must degrade to the default rather than throwing.
//
// Signal-level differences between regions get real coverage in Phase 5, when a
// second region pack exists to differ from.

const AU_SMS = "ATO: your tax refund is waiting, verify now at http://ato-refund.xyz";

describe("region argument plumbing", () => {
  it("omitting region matches passing the default explicitly", () => {
    expect(checkSms(AU_SMS)).toEqual(checkSms(AU_SMS, undefined, DEFAULT_REGION));
    expect(checkUrl("http://ato-refund.xyz")).toEqual(checkUrl("http://ato-refund.xyz", undefined, DEFAULT_REGION));
    expect(checkEmail(AU_SMS)).toEqual(checkEmail(AU_SMS, undefined, DEFAULT_REGION));
    expect(checkCustom(AU_SMS)).toEqual(checkCustom(AU_SMS, undefined, DEFAULT_REGION));
    expect(checkPhone("+61412345678")).toEqual(checkPhone("+61412345678", DEFAULT_REGION));
  });

  it.each(["ZZ", "", "not-a-region", null, undefined])(
    "degrades to the default region for %p rather than throwing",
    (region) => {
      expect(checkSms(AU_SMS, undefined, region)).toEqual(checkSms(AU_SMS, undefined, DEFAULT_REGION));
    },
  );

  it("is case-insensitive on the region code", () => {
    expect(checkSms(AU_SMS, undefined, "au")).toEqual(checkSms(AU_SMS, undefined, "AU"));
  });

  it("still detects the AU signal set when region is passed explicitly", () => {
    const result = checkSms(AU_SMS, undefined, "AU");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.join(" ")).toContain("government agency");
  });
});

describe("analyzeContent region forwarding", () => {
  it("forwards region to every nested checker", async () => {
    const withRegion = await analyzeContent(AU_SMS, undefined, "AU");
    const without = await analyzeContent(AU_SMS);
    expect(withRegion).toEqual(without);
  });

  it("degrades to the default for an unknown region", async () => {
    const unknown = await analyzeContent(AU_SMS, undefined, "ZZ");
    const base = await analyzeContent(AU_SMS, undefined, DEFAULT_REGION);
    expect(unknown).toEqual(base);
  });
});
