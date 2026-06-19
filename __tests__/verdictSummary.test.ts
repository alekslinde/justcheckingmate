import { describe, it, expect } from "vitest";
import {
  composeVerdict,
  isClean,
  defangFlag,
  defangValue,
  formatVerdictEmail,
  VERDICT_RANK,
} from "@/lib/verdictSummary";
import { AnalyzedIdentifier, CheckResult } from "@/lib/scamDetector";
import { TrackingPixelReport } from "@/lib/trackingPixel";

// Minimal builders — these mirror the shapes the real analysers emit, kept
// local so the tests don't depend on the (heavier) full analysis pipeline.
function ident(
  kind: AnalyzedIdentifier["kind"],
  verdict: CheckResult["verdict"],
  value = "",
  score = 0,
): AnalyzedIdentifier {
  return { kind, value, result: { verdict, score, flags: [], details: "" } };
}

function pixel(summary = "1 tracking pixel"): TrackingPixelReport {
  return {
    pixels: [{ url: "x", esp: "Mailchimp", notes: ["Sent through Mailchimp"] } as never],
    hasTrackingPixels: true,
    espsUsed: ["Mailchimp"],
    espReports: [],
    embeddedRecipients: [],
    summary,
  };
}

describe("composeVerdict", () => {
  it("returns null when there are no identifiers", () => {
    expect(composeVerdict([], null)).toBeNull();
  });

  it("picks the worst verdict among identifiers", () => {
    const results = [
      ident("url", "safe"),
      ident("email", "likely_scam"),
      ident("phone", "suspicious"),
    ];
    expect(composeVerdict(results, null)).toEqual({ verdict: "likely_scam", score: 0 });
  });

  it("ranks unknown above safe but below suspicious", () => {
    expect(VERDICT_RANK.safe).toBeLessThan(VERDICT_RANK.unknown);
    expect(VERDICT_RANK.unknown).toBeLessThan(VERDICT_RANK.suspicious);
    const results = [ident("url", "safe"), ident("message", "unknown")];
    expect(composeVerdict(results, null)?.verdict).toBe("unknown");
  });

  it("nudges an otherwise-clean result to suspicious when a pixel is present", () => {
    const results = [ident("url", "safe", "", 5)];
    expect(composeVerdict(results, pixel())).toEqual({ verdict: "suspicious", score: 40 });
  });

  it("does not downgrade a worse verdict because of a pixel", () => {
    const results = [ident("email", "likely_scam", "", 90)];
    expect(composeVerdict(results, pixel())).toEqual({ verdict: "likely_scam", score: 90 });
  });

  it("keeps the higher of the pixel floor and the existing score", () => {
    const results = [ident("url", "safe", "", 55)];
    // 55 already exceeds the 40 pixel floor, so it must survive the nudge.
    expect(composeVerdict(results, pixel())).toEqual({ verdict: "suspicious", score: 55 });
  });
});

describe("isClean", () => {
  it("is true only when every identifier is safe with no pixel or flags", () => {
    expect(isClean([ident("url", "safe")], null, [])).toBe(true);
  });
  it("is false with a non-safe identifier", () => {
    expect(isClean([ident("url", "suspicious")], null, [])).toBe(false);
  });
  it("is false when a tracking pixel is present", () => {
    expect(isClean([ident("url", "safe")], pixel(), [])).toBe(false);
  });
  it("is false when sender flags are present", () => {
    expect(isClean([ident("url", "safe")], null, ["Reply-To goes elsewhere"])).toBe(false);
  });
  it("is false with no identifiers at all", () => {
    expect(isClean([], null, [])).toBe(false);
  });
});

describe("defangFlag", () => {
  it("neutralises email addresses and bare domains, leaving prose intact", () => {
    const out = defangFlag("Reply-To (x@evil.tk) differs from noreply@bank.com.au");
    expect(out).toContain("x[@]evil[.]tk");
    expect(out).toContain("noreply[@]bank[.]com[.]au");
    expect(out).not.toMatch(/@evil\.tk/);
  });
  it("leaves dmarc=none and ordinary words untouched", () => {
    expect(defangFlag("publishes no enforcement (dmarc=none)")).toBe(
      "publishes no enforcement (dmarc=none)",
    );
  });
});

describe("defangValue", () => {
  it("defangs by kind", () => {
    expect(defangValue("email", "a@b.com")).toBe("a[@]b[.]com");
    expect(defangValue("phone", "0412345678")).not.toBe("0412345678");
  });
});

describe("formatVerdictEmail", () => {
  it("leads with a scam headline and defangs identifiers in the breakdown", () => {
    const email = formatVerdictEmail({
      results: [ident("email", "likely_scam", "scammer@evil.tk")],
      emailFlags: ["SPF failed for evil.tk"],
      pixelReport: null,
    });
    expect(email.subject).toMatch(/scam/i);
    expect(email.text).toContain("🚨");
    expect(email.text).toContain("scammer[@]evil[.]tk");
    expect(email.text).not.toMatch(/scammer@evil\.tk/);
    // Footer must state we didn't keep a copy (the discard promise).
    expect(email.text).toMatch(/did not keep a copy/i);
  });

  it("falls back to a suspicious verdict for a header-only forward with flags", () => {
    const email = formatVerdictEmail({
      results: [],
      emailFlags: ["Reply-To goes to a different domain"],
      pixelReport: null,
    });
    expect(email.subject).toMatch(/suspicious/i);
    expect(email.text).toContain("⚠️");
  });

  it("escapes HTML coming from a flag", () => {
    // Flags are echoed verbatim (after defang) into list items — a crafted
    // flag must not break out into live markup.
    const email = formatVerdictEmail({
      results: [ident("url", "suspicious", "http://x.test")],
      emailFlags: ["sender used <script>alert(1)</script> in the name"],
      pixelReport: null,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
