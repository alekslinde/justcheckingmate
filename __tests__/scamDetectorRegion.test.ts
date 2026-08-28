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

  it.each(["QQ", "", "not-a-region", null, undefined])(
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

  it("degrades to the default for an unparseable region", async () => {
    const unknown = await analyzeContent(AU_SMS, undefined, "QQ");
    const base = await analyzeContent(AU_SMS, undefined, DEFAULT_REGION);
    expect(unknown).toEqual(base);
  });
});

// ── SMS-only rules must not fire on email ─────────────────────────────────────
//
// checkEmail reuses checkSms for body content. Most signals are channel-
// agnostic, but the no-link-sender rule is specifically about the 2024
// commitment by the ATO, myGov, Medicare, Centrelink and Australia Post to
// remove links from unsolicited *text messages*. Those bodies all send
// legitimate email containing links, so firing this on an email flags ordinary
// mail — and the flag text ("an SMS from one of these bodies with a clickable
// link is a scam") then misdescribes what was checked.
//
// Found when a genuine Australia Post delivery notification scored 38.

describe("the no-link-sender rule is SMS-only", () => {
  const AUSPOST_EMAIL = [
    "From: noreply@auspost.com.au",
    "Subject: Your parcel is on its way",
    "",
    "Track your delivery at https://auspost.com.au/track",
  ].join("\n");

  it("does not fire on a legitimate agency email containing a link", () => {
    const result = checkEmail(AUSPOST_EMAIL, undefined, "AU");
    expect(result.flags.some((f) => /removed links from their unsolicited SMS/i.test(f))).toBe(false);
  });

  it("still fires on an SMS from a no-link sender that carries a link", () => {
    // The rule's real job — this must keep working.
    const sms = "Australia Post: your parcel is held. Pay the fee at http://auspost-redelivery.tk/fee";
    const result = checkSms(sms, undefined, "AU");
    expect(result.flags.some((f) => /removed links from their unsolicited SMS/i.test(f))).toBe(true);
  });

  it("scores a legitimate agency email lower than the same text as an SMS", () => {
    // The channel distinction has to show up in the score, not just the flag.
    const asEmail = checkEmail(AUSPOST_EMAIL, undefined, "AU");
    const asSms = checkSms("Australia Post: track your delivery at https://auspost.com.au/track", undefined, "AU");
    expect(asEmail.score).toBeLessThan(asSms.score);
  });

  it("leaves channel-agnostic signals firing on email", () => {
    // Scoping one rule must not blunt the shared body analysis.
    const scamEmail = [
      "From: service@commbank-secure-login.tk",
      "Subject: Urgent: account suspended",
      "",
      "Your account is suspended. Verify now at http://commbank-secure-login.tk/verify",
    ].join("\n");
    const result = checkEmail(scamEmail, undefined, "AU");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.length).toBeGreaterThan(2);
  });
});
