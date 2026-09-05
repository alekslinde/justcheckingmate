import { describe, it, expect } from "vitest";
import { checkUrl, analyzeContent } from "@veriguard/engine/scamDetector";

// ── Punycode / internationalised domains ─────────────────────────────────────
//
// Two defects prompted these, both confirmed against the engine before the fix:
//
//   1. A Cyrillic homoglyph of a major bank scored 30/"suspicious" — no
//      mixed-script signal existed at all, despite urlSanitizer's comment
//      explicitly deferring the job to the scorer.
//   2. The hyphen rule counted hyphens in the PUNYCODE form, so a hostname
//      displaying no hyphens was reported as "Heaps of hyphens (3)". A false
//      explanation on a real detection, which the teaching layer makes worse
//      than a miss.
//
// The hard part is not detecting punycode; it is not flagging every non-Latin
// domain as an attack. These pin both directions.

describe("mixed-script (homoglyph) domains", () => {
  // Cyrillic а (U+0430) inside an otherwise Latin word.
  const CYRILLIC_A = "https://commаnk.com/login";
  // Cyrillic р (U+0440) leading an otherwise Latin word.
  const CYRILLIC_P = "https://рaypal.com/verify";

  it("flags a Latin word carrying a Cyrillic homoglyph", () => {
    const r = checkUrl(CYRILLIC_A, undefined, "AU");
    expect(r.flags.join(" ")).toContain("Mixed-script");
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags it wherever the homoglyph sits in the label", () => {
    expect(checkUrl(CYRILLIC_P, undefined, "AU").flags.join(" ")).toContain("Mixed-script");
  });

  it("does not blame hyphens the domain does not have", () => {
    // The punycode encoding of these hosts contains three hyphens. Reporting
    // them would describe a pattern the reader cannot see in the address.
    expect(checkUrl(CYRILLIC_A, undefined, "AU").flags.join(" ")).not.toContain("hyphens");
  });
});

describe("legitimate internationalised domains", () => {
  // The false-positive direction, and the one that matters most: flagging these
  // would penalise people for their language rather than protect them.
  it.each([
    ["German umlaut", "https://münchen.de/info"],
    ["Japanese", "https://日本語.jp/"],
  ])("does not accuse %s of being mixed-script", (_name, url) => {
    const r = checkUrl(url, undefined, "AU");
    expect(r.flags.join(" ")).not.toContain("Mixed-script");
    expect(r.verdict).toBe("safe");
  });

  it("still names the address as internationalised", () => {
    // Worth saying, just not worth accusing over.
    expect(checkUrl("https://münchen.de/info", undefined, "AU").flags.join(" "))
      .toContain("Internationalised");
  });
});

describe("the hyphen rule still works on real hyphens", () => {
  it("flags an ASCII host with three or more hyphens", () => {
    // Guards the punycode skip against silently disabling the rule.
    expect(checkUrl("https://a-b-c-d.example.com/", undefined, "AU").flags.join(" "))
      .toContain("hyphens");
  });
});

describe("the signal survives normalisation", () => {
  // The bug this pins was invisible to every unit test written above: the rule
  // worked when checkUrl was called directly, and silently downgraded to the
  // benign-IDN branch on the analyzeContent path the app actually uses.
  //
  // normaliseForAnalysis punycodes a non-ASCII hostname, which strips exactly
  // the script information the check depends on — so analyzeContent has to hand
  // checkUrl the pre-normalisation URL as well. It reached the metamorphic
  // harness as a "homoglyph made the verdict WEAKER" violation rather than as a
  // failing assertion here, which is the whole argument for that harness.
  const NO_NET = () => { throw new Error("no network in tests"); };
  const HOMOGLYPH = "https://аuspost-redelivery.bond/pay";

  const worst = async (content: string) => {
    const cards = await analyzeContent(content, new Set<string>(), "AU", { fetcher: NO_NET });
    return cards.reduce((a, b) => (b.result.score > a.result.score ? b : a)).result;
  };

  it("scores the same through analyzeContent as through checkUrl", () => {
    return worst(HOMOGLYPH).then((viaAnalyze) => {
      const direct = checkUrl(HOMOGLYPH, undefined, "AU");
      expect(viaAnalyze.score).toBe(direct.score);
      expect(viaAnalyze.verdict).toBe(direct.verdict);
    });
  });

  it("does not let a homoglyph weaken a scam URL", async () => {
    // The metamorphic relation, pinned as a unit test so it fails fast.
    const plain = await worst("https://auspost-redelivery.bond/pay");
    const swapped = await worst(HOMOGLYPH);
    expect(swapped.score).toBeGreaterThanOrEqual(plain.score);
  });

  it("detects it inside a message rather than a bare URL", async () => {
    const r = await worst("Your parcel is held: " + HOMOGLYPH);
    expect(r.verdict).toBe("likely_scam");
  });
});
