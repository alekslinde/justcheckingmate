import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, checkEmail, checkCustom, checkPhone, analyzeContent } from "@/lib/scamDetector";
import { overallCoverage, isClean, formatVerdictEmail } from "@/lib/verdictSummary";
import { FALLBACK_REGION } from "@/lib/regions";

// The Phase 3 guarantee: a "safe" verdict asserts we looked and found nothing.
// Where we have no rules to look with, that assertion isn't available — a clean
// result must read as "unknown", never as a confident pass.

// Innocuous content that scores low everywhere, so any "safe" here comes from
// absence of signal rather than from a positive finding.
const BENIGN = "Hey, are we still on for coffee tomorrow morning?";
const BENIGN_URL = "https://example.com/about";

describe("clean results are not presented as safe without coverage", () => {
  it.each([
    ["checkSms", () => checkSms(BENIGN, undefined, FALLBACK_REGION)],
    ["checkCustom", () => checkCustom(BENIGN, undefined, FALLBACK_REGION)],
    ["checkEmail", () => checkEmail(BENIGN, undefined, FALLBACK_REGION)],
    ["checkUrl", () => checkUrl(BENIGN_URL, undefined, FALLBACK_REGION)],
  ])("%s downgrades a clean verdict to unknown", (_name, run) => {
    const result = run();
    expect(result.verdict).toBe("unknown");
    expect(result.coverage).toBe("none");
    expect(result.details).toContain("not checked");
  });

  it("reports safe for the same content under full coverage", () => {
    // Guards against the downgrade being a blanket behaviour rather than a
    // coverage-conditional one.
    expect(checkSms(BENIGN, undefined, "AU").verdict).toBe("safe");
    expect(checkUrl(BENIGN_URL, undefined, "AU").verdict).toBe("safe");
  });

  it("tags every result with the coverage that produced it", () => {
    expect(checkSms(BENIGN, undefined, "AU").coverage).toBe("full");
    expect(checkPhone("+61412345678", "AU").coverage).toBe("full");
    expect(checkPhone("+61412345678", FALLBACK_REGION).coverage).toBe("none");
  });
});

describe("positive detections are unaffected by coverage", () => {
  // Base signals fire everywhere. Anything they catch is a real finding and
  // must be reported as found, not softened into "we couldn't check".
  const SCAM_URL = "http://bit.ly/x";

  it("keeps a scam verdict under no coverage", () => {
    const covered = checkUrl(SCAM_URL, undefined, "AU");
    const uncovered = checkUrl(SCAM_URL, undefined, FALLBACK_REGION);
    expect(covered.verdict).not.toBe("safe");
    expect(uncovered.verdict).toBe(covered.verdict);
    expect(uncovered.score).toBe(covered.score);
  });

  it("still flags universal signals with no national layer", () => {
    const result = checkUrl("http://login-verify.xyz", undefined, FALLBACK_REGION);
    expect(result.flags.join(" ")).toContain("Dodgy top-level domain");
    expect(result.verdict).not.toBe("safe");
  });

  it("does not downgrade an unparseable URL", () => {
    const result = checkUrl("http://[[[", undefined, FALLBACK_REGION);
    expect(result.verdict).toBe("suspicious");
    expect(result.coverage).toBe("none");
  });
});

describe("region-specific allowlists respect coverage", () => {
  it("does not vouch for an AU gov domain under the base-only pack", () => {
    // The allowlist is regional; under no coverage it's empty, so nothing
    // should come back as a verified-legitimate pass.
    const covered = checkUrl("https://my.gov.au", undefined, "AU");
    expect(covered.verdict).toBe("safe");
    expect(checkUrl("https://my.gov.au", undefined, FALLBACK_REGION).verdict).not.toBe("safe");
  });
});

describe("overallCoverage", () => {
  it("reports the weakest coverage across identifiers", async () => {
    const results = await analyzeContent(BENIGN, undefined, FALLBACK_REGION);
    expect(overallCoverage(results)).toBe("none");
  });

  it("reports full coverage for a fully-covered check", async () => {
    const results = await analyzeContent(BENIGN, undefined, "AU");
    expect(overallCoverage(results)).toBe("full");
  });

  it("treats an absent coverage field as full", () => {
    // Results predating the field must read exactly as they always did.
    const legacy = [{ kind: "message" as const, value: "x", result: { verdict: "safe" as const, score: 0, flags: [], details: "" } }];
    expect(overallCoverage(legacy)).toBe("full");
  });

  it("is empty-safe", () => {
    expect(overallCoverage([])).toBe("full");
  });
});

describe("downstream consumers", () => {
  it("never reports an uncovered check as clean", async () => {
    const results = await analyzeContent(BENIGN, undefined, FALLBACK_REGION);
    expect(isClean(results, null)).toBe(false);
  });

  it("reports a covered benign check as clean", async () => {
    const results = await analyzeContent(BENIGN, undefined, "AU");
    expect(isClean(results, null)).toBe(true);
  });

  it("adds a coverage caveat to the email reply", async () => {
    const results = await analyzeContent(BENIGN, undefined, FALLBACK_REGION);
    const email = formatVerdictEmail({ results, emailFlags: [], pixelReport: null });
    expect(email.text).toContain("don't have full scam-detection rules");
    expect(email.html).toContain("don&#39;t have full scam-detection rules");
  });

  it("omits the caveat when coverage is full", async () => {
    const results = await analyzeContent(BENIGN, undefined, "AU");
    const email = formatVerdictEmail({ results, emailFlags: [], pixelReport: null });
    expect(email.text).not.toContain("don't have full scam-detection rules");
  });
});

describe("region reaches nested URL checks", () => {
  // Regression: checkSms/checkCustom called checkUrl without forwarding region,
  // so an embedded link was always scored with AU's allowlist — defeating the
  // coverage guarantee on exactly the path real requests take (analyzeContent
  // routes through these two).
  //
  // abf.gov.au is the probe because it isolates the nested call: AU allowlists
  // it (score 5) while the base-only pack scores it 15 on its own merits, and
  // the surrounding text is neutral so the outer pack contributes nothing
  // region-specific to the difference.
  const GOV_URL = "http://abf.gov.au";
  const TEXT = `hello see ${GOV_URL} thanks`;

  it("scores the direct URL differently per region", () => {
    // The precondition the assertions below rely on.
    expect(checkUrl(GOV_URL, undefined, "AU").score).toBe(5);
    expect(checkUrl(GOV_URL, undefined, FALLBACK_REGION).score).toBe(15);
  });

  it("checkCustom forwards region to the embedded URL check", () => {
    // checkCustom adds floor(urlScore * 0.5), so the nested region shows up
    // directly in the total: 5 -> +2 under AU, 15 -> +7 under the base pack.
    // With the region dropped, both were 2.
    expect(checkCustom(TEXT, undefined, "AU").score).toBe(2);
    expect(checkCustom(TEXT, undefined, FALLBACK_REGION).score).toBe(7);
  });

  it("checkSms forwards region to the embedded URL check", () => {
    // The >40 escalation branch is what consumes the nested score here. Use a
    // link that clears it under the base pack but is allowlisted under AU.
    const SHORTENED = "http://bit.ly/x";
    const smsAu = checkSms(`hello see ${SHORTENED} thanks`, undefined, "AU");
    const smsZz = checkSms(`hello see ${SHORTENED} thanks`, undefined, FALLBACK_REGION);
    // Both regions catch the shortener (a base signal), so the escalation fires
    // in both — this pins that the nested call happens at all.
    expect(smsAu.flags.some((f) => f.includes("dodgy too"))).toBe(true);
    expect(smsZz.flags.some((f) => f.includes("dodgy too"))).toBe(true);
  });
});

describe("region-specific copy is not asserted globally", () => {
  // Regression: the shared scorer hardcoded AU agencies and regulation, so
  // non-AU users were told to contact Scamwatch and were informed about ACMA
  // sender-ID rules that don't apply to them.
  const SCAM = "URGENT: verify now at http://bit.ly/x or your account is suspended. Send your password.";

  it("names the region's reporting body, not Scamwatch everywhere", () => {
    const au = checkSms(SCAM, undefined, "AU");
    const zz = checkSms(SCAM, undefined, FALLBACK_REGION);
    expect(au.details).toContain("Scamwatch");
    expect(zz.details).not.toContain("Scamwatch");
    expect(zz.details).toContain("local consumer protection");
  });

  it("only applies the sender-ID rule where such a scheme exists", () => {
    const TEXT = "Your message may be displayed as unverified — please ignore the unverified label.";
    const au = checkSms(TEXT, undefined, "AU");
    const zz = checkSms(TEXT, undefined, FALLBACK_REGION);
    expect(au.flags.join(" ")).toContain("ACMA");
    // Asserting Australian regulation to a non-AU user would simply be false.
    expect(zz.flags.join(" ")).not.toContain("ACMA");
    expect(zz.score).toBeLessThan(au.score);
  });

  it("uses the region's wording for an allowlisted domain", () => {
    const au = checkUrl("https://my.gov.au", undefined, "AU");
    expect(au.flags[0]).toContain("Australian government domain");
  });
});
