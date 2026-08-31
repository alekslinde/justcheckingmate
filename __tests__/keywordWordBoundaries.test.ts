import { describe, it, expect } from "vitest";
import { checkSms, checkCustom } from "@justcheckingmate/engine/scamDetector";

// Regression cover for #233 — keyword entries firing inside ordinary words.
//
// mentions() protected entries of 4 characters or fewer (#196), which covered
// "pin", "free" and "ato" but stopped one letter short of "claim", "prize" and
// "voucher". "Unclaimed baggage goes to the storage room" reached suspicious
// (24) on nothing but ordinary English: "unclaimed" matched as itself and
// "claim" matched inside it, 2 x 12 = 24.
//
// checkCustom made it worse by matching with a raw includes() instead of
// mentions(), so the same text scored differently depending on which box it
// was pasted into, and every list was flattened into one count so collisions
// stacked.
//
// The rule is now token-based: a single-token entry is anchored at the start
// and allows only an inflectional suffix; multi-word phrases keep substring
// matching.

const keywordFlag = (r: { flags: string[] }) =>
  r.flags.find(
    (f) =>
      f.startsWith("Prize/reward language") ||
      f.startsWith("Asks for sensitive info") ||
      f.startsWith("Urgency language") ||
      f.startsWith("Suspicious keywords"),
  );

describe("#233 — entries do not fire inside longer words", () => {
  // Each of these is a measured false positive from the issue.
  const benign: [string, string][] = [
    ["claim inside reclaiming", "Reclaiming the deposit takes two weeks."],
    ["prize inside prizewinning", "The prizewinning entry was announced today."],
    ["voucher inside voucherless", "The voucherless option is cheaper."],
    ["pin inside spins", "The spins class at the gym starts at 6."],
    ["ato inside atomic", "The atomic clock is very accurate."],
    ["cash inside cashew", "We need cashew nuts and rice."],
    ["free inside freedom", "Freedom of information request received."],
  ];

  it.each(benign)("checkSms stays clean: %s", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(keywordFlag(r), r.flags.join(" | ")).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it.each(benign)("checkCustom stays clean: %s", (_label, text) => {
    const r = checkCustom(text, undefined, "AU");
    expect(keywordFlag(r), r.flags.join(" | ")).toBeFalsy();
  });

  it("does not stack collisions into a verdict on the custom path", () => {
    // Measured at suspicious (40) before the fix, on four phantom hits:
    // "won" (in won't), "free" (in freebies), "claim" and "unclaimed".
    const r = checkCustom(
      "The atomic superstore has unclaimed freebies; won't last.",
      undefined,
      "AU",
    );
    expect(r.verdict).toBe("safe");
  });
});

describe("#233 — the half that needs #234", () => {
  it("halves the score on 'unclaimed baggage' but does not clear it", () => {
    // "unclaimed" is a legitimately listed reward word, so it still matches
    // here — correctly, as far as this fix is concerned. What #233 removes is
    // the SECOND hit: "claim" no longer fires inside it, so the score falls
    // from 24 (suspicious) to 12 (safe).
    //
    // The remaining hit is #234's territory: "claim" and "unclaimed" should
    // not both be listed in base REWARD_WORDS. Until that lands, this text is
    // safe by arithmetic rather than by intent.
    const r = checkSms("Unclaimed baggage goes to the storage room.", undefined, "AU");
    expect(r.verdict).toBe("safe");
    const reward = r.flags.find((f) => f.startsWith("Prize/reward language"));
    expect(reward).toBeTruthy();
    expect(reward).toContain("unclaimed");
    expect(reward).not.toContain('"claim"');
  });
});

describe("#233 — real signals still fire", () => {
  it("matches an entry as a whole word", () => {
    const r = checkSms("You have won a free prize! Claim now.", undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Prize/reward language"))).toBe(true);
  });

  it("follows an entry into its own inflections", () => {
    // "urgent" is the listed entry; "urgently" is the same signal. An
    // exact-match rule dropped the bareHostname evasion case to safe.
    const r = checkSms("claim now at freemoney.tk urgently", undefined, "AU");
    expect(r.verdict).not.toBe("safe");
  });

  it("still matches across punctuation and domains", () => {
    // \b sits at any non-word character, so boundary matching does not break
    // the domain and hyphen entries the packs are full of.
    for (const text of [
      "Update your medicare.gov.au details now",
      "Visit ato.gov.au to confirm",
    ]) {
      const r = checkSms(text, undefined, "AU");
      expect(r.flags.length, text).toBeGreaterThan(0);
    }
  });

  it("scores the two myGov spellings identically", () => {
    // "mygovid" is listed explicitly now that "mygov" cannot reach inside it.
    // The old substring behaviour scored myGovID higher for no detection
    // reason — the defect the au.ts note was written about.
    const a = checkSms("Confirm your myGovID to avoid suspension.", undefined, "AU");
    const b = checkSms("Confirm your myGov to avoid suspension.", undefined, "AU");
    expect(a.score).toBe(b.score);
    expect(a.verdict).toBe(b.verdict);
  });

  it("gives the same verdict on both the sms and custom paths", () => {
    // The paths used different matchers, so identical text scored differently
    // depending on where it was pasted.
    const text = "ATO: confirm your TFN and PIN to release your refund";
    expect(checkCustom(text, undefined, "AU").verdict).not.toBe("safe");
    expect(checkSms(text, undefined, "AU").verdict).not.toBe("safe");
  });
});
