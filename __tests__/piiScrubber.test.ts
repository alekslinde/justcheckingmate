import { describe, it, expect } from "vitest";
import { scrubPii, stripReporterHeaders } from "@/lib/piiScrubber";

describe("scrubPii", () => {
  it("redacts email addresses", () => {
    expect(scrubPii("Contact me at alice@example.com please")).toBe(
      "Contact me at [email removed] please"
    );
  });

  it("redacts email with plus-sign alias", () => {
    expect(scrubPii("user+tag@mail.co.uk")).toBe("[email removed]");
  });

  it("redacts Australian mobile numbers (spaced)", () => {
    expect(scrubPii("My number is 0412 345 678")).toBe(
      "My number is [phone removed]"
    );
  });

  it("redacts Australian mobile numbers (dashed)", () => {
    expect(scrubPii("Call 0412-345-678")).toBe("Call [phone removed]");
  });

  it("redacts Australian mobile numbers (no spacing)", () => {
    expect(scrubPii("Ring 0412345678 thanks")).toBe("Ring [phone removed] thanks");
  });

  it("redacts Australian landline numbers", () => {
    expect(scrubPii("Office: 02 9876 5432")).toBe("Office: [phone removed]");
  });

  it("redacts international phone numbers", () => {
    expect(scrubPii("Call +44 1234 567 890")).toBe("Call [phone removed]");
  });

  it("redacts IPv4 addresses", () => {
    expect(scrubPii("Server at 192.168.1.1 is down")).toBe(
      "Server at [IP removed] is down"
    );
  });

  it("redacts Australian TFN (space-separated 3-3-3)", () => {
    expect(scrubPii("My TFN is 123 456 789")).toBe("My TFN is [TFN removed]");
  });

  it("redacts BSB (xxx-xxx)", () => {
    expect(scrubPii("BSB 062-123")).toBe("BSB [BSB removed]");
  });

  it("redacts credit card numbers (space-separated groups)", () => {
    expect(scrubPii("Card: 4532 1234 5678 9012")).toBe("Card: [card removed]");
  });

  it("redacts credit card numbers (dash-separated groups)", () => {
    expect(scrubPii("Card: 4532-1234-5678-9012")).toBe("Card: [card removed]");
  });

  it("redacts multiple PII types in a single string", () => {
    const input = "Email alice@example.com, phone 0412 345 678, IP 10.0.0.1";
    const result = scrubPii(input);
    expect(result).toContain("[email removed]");
    expect(result).toContain("[phone removed]");
    expect(result).toContain("[IP removed]");
    expect(result).not.toContain("alice@example.com");
    expect(result).not.toContain("0412 345 678");
    expect(result).not.toContain("10.0.0.1");
  });

  it("leaves text with no PII unchanged", () => {
    const clean = "This message contains no personal information.";
    expect(scrubPii(clean)).toBe(clean);
  });

  it("does not modify empty string", () => {
    expect(scrubPii("")).toBe("");
  });

  // ── Email header content scenarios (as submitted by the report API) ──────────

  it("scrubs the reporter's email address embedded in raw headers", () => {
    const headers = [
      "Delivered-To: victim@gmail.com",
      "From: myGov <noreply@au-taxrefund.click>",
      "Subject: Your account is locked",
    ].join("\n");
    // The Delivered-To header is stripped at the route layer; scrubPii catches
    // any address that slips through (e.g. in X-Received or the body).
    const result = scrubPii(headers);
    expect(result).not.toContain("victim@gmail.com");
    expect(result).toContain("[email removed]");
    // Scammer address also redacted — that's expected at this layer; the route
    // stores scamEmail separately and doesn't need it preserved in content.
    expect(result).not.toContain("noreply@au-taxrefund.click");
  });

  it("scrubs an origin IP from Authentication-Results / Received-SPF headers", () => {
    const header = "Received-SPF: fail (domain of evil.tk) client-ip=203.0.113.42";
    const result = scrubPii(header);
    expect(result).not.toContain("203.0.113.42");
    expect(result).toContain("[IP removed]");
  });
});

describe("stripReporterHeaders", () => {
  const phishHeaders = [
    "Delivered-To: victim@gmail.com",
    "X-Original-To: victim@gmail.com",
    "X-Forwarded-To: forward@gmail.com",
    "X-Google-Original-To: victim@googlemail.com",
    "X-Received: by 2002:a05:6512:31c3 with SMTP",
    "From: myGov <noreply@au-taxrefund.click>",
    "Reply-To: scammer@evil.ru",
    "Subject: Your account is locked",
    "Authentication-Results: mx.google.com; spf=fail",
    "",
    "Click here to verify.",
  ].join("\n");

  it("removes Delivered-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^Delivered-To:/im);
  });

  it("removes X-Original-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Original-To:/im);
  });

  it("removes X-Forwarded-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Forwarded-To:/im);
  });

  it("removes X-Google-Original-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Google-Original-To:/im);
  });

  it("removes X-Received header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Received:/im);
  });

  it("preserves scammer-side headers (From, Reply-To, Subject, Authentication-Results)", () => {
    const result = stripReporterHeaders(phishHeaders);
    expect(result).toContain("From: myGov");
    expect(result).toContain("Reply-To: scammer@evil.ru");
    expect(result).toContain("Subject: Your account is locked");
    expect(result).toContain("Authentication-Results:");
  });

  it("preserves the email body", () => {
    expect(stripReporterHeaders(phishHeaders)).toContain("Click here to verify.");
  });

  it("is case-insensitive on header names", () => {
    const mixed = "DELIVERED-TO: me@example.com\nx-received: by server\nFrom: x@y.com";
    const result = stripReporterHeaders(mixed);
    expect(result).not.toMatch(/DELIVERED-TO:/i);
    expect(result).not.toMatch(/x-received:/i);
    expect(result).toContain("From: x@y.com");
  });

  it("leaves non-email content unchanged", () => {
    const sms = "Your parcel is on hold. Pay $3.50 at https://auspost-fee.cc/pay";
    expect(stripReporterHeaders(sms)).toBe(sms);
  });
});
