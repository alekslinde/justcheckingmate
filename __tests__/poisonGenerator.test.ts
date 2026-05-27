import { describe, it, expect } from "vitest";
import { generatePoisonProfile } from "@/lib/poisonGenerator";

const VALID_AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const AU_BANKS = [
  "Commonwealth Bank", "Westpac", "ANZ Bank", "National Australia Bank",
  "Bendigo Bank", "Bank of Queensland", "Macquarie Bank", "Suncorp Bank",
];

describe("generatePoisonProfile", () => {
  // Generate once — the shape tests don't depend on specific random values
  const profile = generatePoisonProfile();

  it("returns an object with all required fields", () => {
    const requiredFields = [
      "fullName", "email", "phone", "dateOfBirth", "address",
      "suburb", "state", "postcode", "bankName", "bsb", "accountNumber",
      "tfn", "medicareNumber", "creditCardNumber", "creditCardExpiry",
      "creditCardCvv", "password", "ipAddress", "deviceId", "notes",
    ];
    for (const field of requiredFields) {
      expect(profile).toHaveProperty(field);
      expect((profile as Record<string, string>)[field]).toBeTruthy();
    }
  });

  it("fullName is two words (first + last)", () => {
    const parts = profile.fullName.trim().split(" ");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it("email contains @ and a valid-looking domain", () => {
    expect(profile.email).toMatch(/^[^@]+@[^@]+\.[a-z]+$/i);
  });

  it("phone starts with an Australian mobile prefix", () => {
    expect(profile.phone).toMatch(/^04\d{2} \d{3} \d{3}$/);
  });

  it("dateOfBirth is in DD/MM/YYYY format with a plausible birth year", () => {
    expect(profile.dateOfBirth).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const year = parseInt(profile.dateOfBirth.split("/")[2]);
    expect(year).toBeGreaterThanOrEqual(1955);
    expect(year).toBeLessThanOrEqual(2000);
  });

  it("address starts with a number", () => {
    expect(profile.address).toMatch(/^\d+\s/);
  });

  it("state is a valid Australian state/territory", () => {
    expect(VALID_AU_STATES).toContain(profile.state);
  });

  it("postcode is 4 digits", () => {
    expect(profile.postcode).toMatch(/^\d{4}$/);
  });

  it("bankName is a known Australian bank", () => {
    expect(AU_BANKS).toContain(profile.bankName);
  });

  it("BSB is in xxx-xxx format", () => {
    expect(profile.bsb).toMatch(/^\d{3}-\d{3}$/);
  });

  it("accountNumber is 9 digits", () => {
    expect(profile.accountNumber).toMatch(/^\d{9}$/);
  });

  it("TFN is in xxx xxx xxx format", () => {
    expect(profile.tfn).toMatch(/^\d{3} \d{3} \d{3}$/);
  });

  it("medicareNumber starts with a digit between 2 and 6", () => {
    const firstDigit = parseInt(profile.medicareNumber[0]);
    expect(firstDigit).toBeGreaterThanOrEqual(2);
    expect(firstDigit).toBeLessThanOrEqual(6);
  });

  it("creditCardNumber is 16 digits in groups of 4 separated by spaces", () => {
    expect(profile.creditCardNumber).toMatch(/^(\d{4} ){3}\d{4}$/);
  });

  it("creditCardExpiry is MM/YY format with a future-ish year", () => {
    expect(profile.creditCardExpiry).toMatch(/^\d{2}\/\d{2}$/);
    const year = parseInt(profile.creditCardExpiry.split("/")[1]);
    expect(year).toBeGreaterThanOrEqual(26);
    expect(year).toBeLessThanOrEqual(30);
  });

  it("creditCardCvv is exactly 3 digits", () => {
    expect(profile.creditCardCvv).toMatch(/^\d{3}$/);
  });

  it("ipAddress looks like an IPv4 address", () => {
    expect(profile.ipAddress).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  it("deviceId matches the AUID-XXXXXXXX-XXXX-XXXX pattern", () => {
    expect(profile.deviceId).toMatch(/^AUID-\d{8}-\d{4}-\d{4}$/);
  });

  it("notes is a non-empty string", () => {
    expect(typeof profile.notes).toBe("string");
    expect(profile.notes.length).toBeGreaterThan(0);
  });

  it("successive calls return different profiles", () => {
    const p1 = generatePoisonProfile();
    const p2 = generatePoisonProfile();
    // Very unlikely to be identical — at minimum the account number will differ
    expect(p1.accountNumber !== p2.accountNumber || p1.fullName !== p2.fullName).toBe(true);
  });
});
