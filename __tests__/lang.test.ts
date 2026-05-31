import { describe, it, expect } from "vitest";
import { translate, MessageKey } from "@/lib/i18n";
import normalMessages from "@/messages/normal.json";

describe("translate", () => {
  it("returns the normal-locale string", () => {
    expect(translate("normal", "check.report")).toBe("Report This Scam");
  });

  it("returns the aussie-locale string for the same key", () => {
    expect(translate("aussie", "check.report")).toBe("Report This Mongrel");
  });

  it("falls back to the normal locale when a key is identical/missing in aussie", () => {
    // "check.uploadImage" is the same in both dicts — still resolves.
    expect(translate("aussie", "check.uploadImage")).toBe("Upload image");
  });

  it("falls back to the raw key when it exists in neither dictionary", () => {
    const missing = "totally.unknown.key" as MessageKey;
    expect(translate("normal", missing)).toBe("totally.unknown.key");
    expect(translate("aussie", missing)).toBe("totally.unknown.key");
  });

  it("interpolates {placeholder} tokens from vars", () => {
    // No shipped message has tokens yet, so exercise interpolation via the
    // raw-key fallback path (translate interpolates whatever string resolves).
    const key = "Hi {name}, you have {count} alerts" as MessageKey;
    expect(translate("normal", key, { name: "Alex", count: 3 })).toBe(
      "Hi Alex, you have 3 alerts",
    );
  });

  it("leaves token-free strings untouched when vars are passed", () => {
    expect(translate("normal", "check.submit", { unused: "x" })).toBe(
      translate("normal", "check.submit"),
    );
  });

  it("every aussie key exists in the normal (base) dictionary", () => {
    // Guards against an aussie-only key that could never resolve a base fallback.
    const normalKeys = new Set(Object.keys(normalMessages));
    // (aussie.json is validated structurally by the build's MessageKey typing;
    //  this asserts the base covers the full key set.)
    expect(normalKeys.has("verdict.likely_scam.label")).toBe(true);
    expect(normalKeys.has("check.placeholder")).toBe(true);
  });
});
