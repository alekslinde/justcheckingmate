import { describe, it, expect } from "vitest";
import { buildShareContent, parseSharePayload } from "@/lib/sharePrefill";

describe("buildShareContent", () => {
  it("uses the shared text as-is", () => {
    expect(buildShareContent({ text: "Your parcel is held: evil.tk/pay" })).toBe(
      "Your parcel is held: evil.tk/pay",
    );
  });

  it("appends a url that the text does not already contain", () => {
    // Chrome shares a page as {title, url}; some apps add a note in `text`.
    expect(buildShareContent({ text: "is this real?", url: "https://evil.tk" })).toBe(
      "is this real?\n\nhttps://evil.tk",
    );
  });

  it("does not repeat a url already present in the text", () => {
    // Messaging apps commonly share the selection with the link inside it.
    // Duplicating it would hand the detector the same identifier twice.
    const text = "Your parcel is held: https://evil.tk/pay";
    expect(buildShareContent({ text, url: "https://evil.tk/pay" })).toBe(text);
  });

  it("uses the url alone when there is no text", () => {
    expect(buildShareContent({ url: "https://evil.tk", title: "Track parcel" })).toBe(
      "https://evil.tk",
    );
  });

  it("drops the title when real content is present", () => {
    // The title is the page/conversation name, not the suspicious content —
    // mixing it in adds words the scoring would weigh as the sender's.
    const out = buildShareContent({ title: "AusPost Tracking", text: "click here" });
    expect(out).toBe("click here");
    expect(out).not.toContain("AusPost");
  });

  it("falls back to the title when it is the only thing shared", () => {
    expect(buildShareContent({ title: "AusPost Tracking" })).toBe("AusPost Tracking");
  });

  it("returns an empty string when nothing usable was shared", () => {
    expect(buildShareContent({})).toBe("");
    expect(buildShareContent({ text: "   ", url: "" })).toBe("");
  });

  it("trims surrounding whitespace from each field", () => {
    expect(buildShareContent({ text: "  scam text  " })).toBe("scam text");
  });

  it("bounds the length of a hostile payload", () => {
    const huge = "a".repeat(20_000);
    expect(buildShareContent({ text: huge })).toHaveLength(5000);
  });

  it("preserves newlines inside a shared message body", () => {
    const sms = "AusPost: parcel held.\nPay $2.99: evil.tk";
    expect(buildShareContent({ text: sms })).toBe(sms);
  });
});

describe("parseSharePayload", () => {
  it("reads the three spec params from a query string", () => {
    const params = new URLSearchParams("title=T&text=Body&url=https://evil.tk");
    expect(parseSharePayload(params)).toEqual({
      title: "T",
      text: "Body",
      url: "https://evil.tk",
    });
  });

  it("maps absent params to undefined rather than null", () => {
    expect(parseSharePayload(new URLSearchParams(""))).toEqual({
      title: undefined,
      text: undefined,
      url: undefined,
    });
  });

  it("round-trips an encoded share payload into check content", () => {
    const shared = "AusPost: parcel held. Pay at https://evil.tk/p?a=1&b=2";
    const qs = new URLSearchParams({ text: shared }).toString();
    expect(buildShareContent(parseSharePayload(new URLSearchParams(qs)))).toBe(shared);
  });
});
