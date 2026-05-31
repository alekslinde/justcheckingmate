import { describe, it, expect } from "vitest";
import { parseEmailHeaders, analyseEmailIdentities, domainOf } from "@/lib/emailHeaders";

describe("domainOf", () => {
  it("returns the lowercased domain after the last @", () => {
    expect(domainOf("User@Evil.TK")).toBe("evil.tk");
    expect(domainOf("a@b@real.com")).toBe("real.com");
  });

  it("returns empty string when there is no @", () => {
    expect(domainOf("not-an-address")).toBe("");
  });

  it("strips trailing punctuation/brackets", () => {
    expect(domainOf("x@evil.tk>")).toBe("evil.tk");
  });
});

describe("parseEmailHeaders", () => {
  const sample = [
    'Delivered-To: victim@gmail.com',
    'From: "myGov" <noreply@evil.tk>',
    'Reply-To: scammer@other-domain.ru',
    'Return-Path: <bounce@evil.tk>',
    'Subject: Your account is suspended',
    '',
    'Body text here, ignored.',
  ].join("\n");

  it("extracts the From display name and address", () => {
    const h = parseEmailHeaders(sample);
    expect(h.fromDisplay).toBe("myGov");
    expect(h.fromAddress).toBe("noreply@evil.tk");
  });

  it("extracts Reply-To and Return-Path", () => {
    const h = parseEmailHeaders(sample);
    expect(h.replyTo).toBe("scammer@other-domain.ru");
    expect(h.returnPath).toBe("bounce@evil.tk");
  });

  it("returns empty fromDisplay for a bare address From", () => {
    const h = parseEmailHeaders("From: plain@sender.com\n\nbody");
    expect(h.fromDisplay).toBe("");
    expect(h.fromAddress).toBe("plain@sender.com");
  });

  it("is case-insensitive on header names", () => {
    const h = parseEmailHeaders("FROM: a@b.com\nREPLY-TO: c@d.com");
    expect(h.fromAddress).toBe("a@b.com");
    expect(h.replyTo).toBe("c@d.com");
  });

  it("unfolds RFC822 continuation lines", () => {
    // A From header value continued on the next (whitespace-led) line.
    const folded = 'From: "Very Long Display Name"\n <real@sender.io>\nSubject: hi';
    const h = parseEmailHeaders(folded);
    expect(h.fromAddress).toBe("real@sender.io");
    expect(h.fromDisplay).toBe("Very Long Display Name");
  });

  it("treats a header-only paste (no blank line) as all headers", () => {
    const h = parseEmailHeaders("From: a@b.com\nReply-To: c@d.com");
    expect(h.fromAddress).toBe("a@b.com");
    expect(h.replyTo).toBe("c@d.com");
  });

  it("returns empty fields when nothing matches", () => {
    const h = parseEmailHeaders("just some random text with no headers");
    expect(h.fromAddress).toBe("");
    expect(h.replyTo).toBe("");
  });
});

describe("analyseEmailIdentities", () => {
  it("flags a From/Reply-To domain mismatch", () => {
    const r = analyseEmailIdentities({
      fromAddress: "noreply@evil.tk",
      replyTo: "scammer@other.ru",
    });
    expect(r.score).toBeGreaterThan(0);
    expect(r.flags.join(" ")).toMatch(/reply-to/i);
  });

  it("does NOT flag when From and Reply-To share a domain", () => {
    const r = analyseEmailIdentities({
      fromAddress: "noreply@bank.com",
      replyTo: "support@bank.com",
    });
    expect(r.flags).toHaveLength(0);
    expect(r.score).toBe(0);
  });

  it("flags display-name brand masking", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "noreply@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/masking|display name/i);
    expect(r.score).toBeGreaterThan(0);
  });

  it("does NOT flag a brand display name on its legit domain", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "noreply@my.gov.au",
    });
    expect(r.flags).toHaveLength(0);
  });

  it("flags a display name containing a mismatched email address", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "service@paypal.com",
      fromAddress: "noreply@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/doesn't match/i);
  });

  it("flags a Return-Path domain mismatch", () => {
    const r = analyseEmailIdentities({
      fromAddress: "a@bank.com",
      returnPath: "bounce@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/return-path/i);
  });

  it("returns no flags when only one identity is present", () => {
    expect(analyseEmailIdentities({ fromAddress: "a@b.com" }).flags).toHaveLength(0);
    expect(analyseEmailIdentities({}).flags).toHaveLength(0);
  });
});
