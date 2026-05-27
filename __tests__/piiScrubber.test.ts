import { describe, it, expect } from "vitest";
import { scrubPii } from "@/lib/piiScrubber";

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
});
