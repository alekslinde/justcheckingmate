import { describe, it, expect } from "vitest";
import { locationFromHeaders } from "@/lib/geo";

function headers(map: Record<string, string>): Headers {
  return new Headers(map);
}

describe("locationFromHeaders", () => {
  it("returns state + Australia for AU connections", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "AU", "x-vercel-ip-country-region": "NSW" })),
    ).toBe("NSW, Australia");
  });

  it("falls back to plain Australia for an unknown AU region", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "AU", "x-vercel-ip-country-region": "XX" })),
    ).toBe("Australia");
    expect(locationFromHeaders(headers({ "x-vercel-ip-country": "AU" }))).toBe("Australia");
  });

  it("returns country name only (no region) outside Australia", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "NZ", "x-vercel-ip-country-region": "AUK" })),
    ).toBe("New Zealand");
  });

  it("returns empty string when geo headers are absent or invalid", () => {
    expect(locationFromHeaders(headers({}))).toBe("");
    expect(locationFromHeaders(headers({ "x-vercel-ip-country": "evil<script>" }))).toBe("");
  });

  it("is case-insensitive on the country code", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "au", "x-vercel-ip-country-region": "vic" })),
    ).toBe("VIC, Australia");
  });
});
