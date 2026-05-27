import { describe, it, expect } from "vitest";
import {
  defang,
  stripTrackingParams,
  normaliseForAnalysis,
  safeDisplayUrl,
  defangText,
} from "@/lib/urlSanitizer";

describe("defang", () => {
  it("converts https to hxtps", () => {
    expect(defang("https://evil.com")).toBe("hxtps://evil[.]com");
  });

  it("converts http to hxtp", () => {
    expect(defang("http://evil.com")).toBe("hxtp://evil[.]com");
  });

  it("converts ftp to fxp", () => {
    expect(defang("ftp://files.evil.com")).toBe("fxp://files[.]evil[.]com");
  });

  it("replaces all dots in the URL", () => {
    expect(defang("https://sub.evil.co.uk/path")).toBe(
      "hxtps://sub[.]evil[.]co[.]uk/path"
    );
  });

  it("handles uppercase HTTPS (first T→x, second T→X)", () => {
    // "HTTPS" → replace first T case-insensitively with "x" → "HxTPS"
    // then replace uppercase T → "HxXPS"
    expect(defang("HTTPS://Evil.Com")).toBe("HxXPS://Evil[.]Com");
  });

  it("does not transform strings that do not start with a known protocol", () => {
    // No protocol match — only dots get replaced
    expect(defang("evil.com/path")).toBe("evil[.]com/path");
  });
});

describe("stripTrackingParams", () => {
  it("strips utm_source", () => {
    const result = stripTrackingParams("https://example.com/?q=hello&utm_source=google");
    expect(result).toContain("q=hello");
    expect(result).not.toContain("utm_source");
  });

  it("strips fbclid", () => {
    const result = stripTrackingParams("https://example.com/?fbclid=abc123&page=2");
    expect(result).not.toContain("fbclid");
    expect(result).toContain("page=2");
  });

  it("strips multiple tracking params in one pass", () => {
    const result = stripTrackingParams(
      "https://example.com/?utm_source=x&utm_medium=y&utm_campaign=z&q=hello"
    );
    expect(result).toContain("q=hello");
    expect(result).not.toMatch(/utm_/);
  });

  it("strips gclid and msclkid", () => {
    const result = stripTrackingParams(
      "https://example.com/?gclid=abc&msclkid=def&id=1"
    );
    expect(result).not.toContain("gclid");
    expect(result).not.toContain("msclkid");
    expect(result).toContain("id=1");
  });

  it("preserves non-tracking params untouched", () => {
    const result = stripTrackingParams("https://example.com/?q=hello&page=2&sort=asc");
    expect(result).toContain("q=hello");
    expect(result).toContain("page=2");
    expect(result).toContain("sort=asc");
  });

  it("returns original string when URL cannot be parsed", () => {
    const invalid = "not a url %%";
    expect(stripTrackingParams(invalid)).toBe(invalid);
  });

  it("prepends https for protocol-less input and strips the prefix back", () => {
    const result = stripTrackingParams("example.com/?utm_source=x&q=1");
    expect(result).toContain("q=1");
    expect(result).not.toContain("utm_source");
    expect(result).not.toMatch(/^https?:\/\//);
  });

  it("preserves a URL with no tracking params unchanged (normalised form)", () => {
    const url = "https://example.com/?q=hello";
    const result = stripTrackingParams(url);
    expect(result).toContain("q=hello");
    expect(result).not.toContain("utm_");
  });
});

describe("normaliseForAnalysis", () => {
  it("lowercases the hostname", () => {
    const result = normaliseForAnalysis("https://EVIL.COM/Path");
    expect(result).toMatch(/^https:\/\/evil\.com/);
  });

  it("decodes percent-encoded hostname characters", () => {
    // %61 = 'a', so %61to.gov.au → ato.gov.au
    const result = normaliseForAnalysis("https://%61to.gov.au");
    expect(result).toContain("ato.gov.au");
  });

  it("collapses repeated slashes in the path", () => {
    const result = normaliseForAnalysis("https://example.com//double//slash");
    // The path should not contain consecutive slashes
    const url = new URL(result);
    expect(url.pathname).not.toMatch(/\/\//);
  });

  it("falls back to lowercased original when URL is unparseable", () => {
    expect(normaliseForAnalysis("NOT A URL")).toBe("not a url");
  });

  it("prepends https when protocol is missing", () => {
    const result = normaliseForAnalysis("evil.com/path");
    expect(result).toContain("evil.com");
  });
});

describe("safeDisplayUrl", () => {
  it("strips tracking params and defangs the protocol", () => {
    const result = safeDisplayUrl("https://evil.com/?utm_source=x");
    expect(result).not.toContain("utm_source");
    expect(result).not.toMatch(/^https?:\/\//);
  });

  it("replaces dots with [.]", () => {
    const result = safeDisplayUrl("https://evil.tk/");
    expect(result).toContain("[.]");
  });

  it("handles URLs with no tracking params", () => {
    const result = safeDisplayUrl("https://evil.com/phish");
    expect(result).toBe("hxtps://evil[.]com/phish");
  });
});

describe("defangText", () => {
  it("defangs URLs embedded in plain text", () => {
    const result = defangText("Click here: https://evil.com/phish");
    expect(result).toContain("hxtps://evil[.]com/phish");
    expect(result).not.toContain("https://evil.com");
  });

  it("defangs multiple URLs in the same string", () => {
    const result = defangText(
      "Link 1: https://evil.com and Link 2: http://bad.tk/x"
    );
    expect(result).not.toContain("https://");
    expect(result).not.toContain("http://");
    expect(result).toContain("hxtps://evil[.]com");
    expect(result).toContain("hxtp://bad[.]tk/x");
  });

  it("leaves text with no URLs unchanged", () => {
    const text = "No links here, just regular text.";
    expect(defangText(text)).toBe(text);
  });

  it("strips tracking params from embedded URLs before defanging", () => {
    const result = defangText("See: https://example.com/?utm_source=x&q=1");
    expect(result).not.toContain("utm_source");
    expect(result).toContain("q=1");
  });
});
