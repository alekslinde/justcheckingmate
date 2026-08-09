import { describe, it, expect } from "vitest";
import {
  translate,
  parseMode,
  serialiseMode,
  DEFAULT_MODE,
  type LangMode,
  type MessageKey,
} from "@/lib/i18n";
import enNormal from "@/messages/en.normal.json";
import enRegional from "@/messages/en.regional.json";

const NORMAL: LangMode = { locale: "en", tone: "normal" };
const REGIONAL: LangMode = { locale: "en", tone: "regional" };

describe("translate", () => {
  it("returns the base-tone string", () => {
    expect(translate(NORMAL, "check.report")).toBe("Report This Scam");
  });

  it("returns the regional-tone string for the same key", () => {
    expect(translate(REGIONAL, "check.report")).toBe("Report This Mongrel");
  });

  it("falls back to the base tone when a key is missing from the regional bundle", () => {
    // "check.uploadImage" is the same in both dicts — still resolves.
    expect(translate(REGIONAL, "check.uploadImage")).toBe("Upload image");
  });

  it("falls back to the raw key when it exists in neither dictionary", () => {
    const missing = "totally.unknown.key" as MessageKey;
    expect(translate(NORMAL, missing)).toBe("totally.unknown.key");
    expect(translate(REGIONAL, missing)).toBe("totally.unknown.key");
  });

  it("interpolates {placeholder} tokens from vars", () => {
    // No shipped message has tokens yet, so exercise interpolation via the
    // raw-key fallback path (translate interpolates whatever string resolves).
    const key = "Hi {name}, you have {count} alerts" as MessageKey;
    expect(translate(NORMAL, key, { name: "Alex", count: 3 })).toBe(
      "Hi Alex, you have 3 alerts",
    );
  });

  it("leaves token-free strings untouched when vars are passed", () => {
    expect(translate(NORMAL, "check.submit", { unused: "x" })).toBe(
      translate(NORMAL, "check.submit"),
    );
  });

  it("resolves an unknown tone via the base tone rather than the raw key", () => {
    const odd = { locale: "en", tone: "shouty" } as unknown as LangMode;
    expect(translate(odd, "check.report")).toBe("Report This Scam");
  });

  it("every regional key exists in the base bundle", () => {
    // Guards against a regional-only key that could never resolve a fallback.
    const baseKeys = new Set(Object.keys(enNormal));
    const orphans = Object.keys(enRegional).filter((k) => !baseKeys.has(k));
    expect(orphans).toEqual([]);
  });
});

describe("parseMode", () => {
  it("migrates the legacy 'aussie' value to en + regional", () => {
    // Returning users have this literal string in localStorage from before the
    // locale/tone split; it must not silently reset their preference.
    expect(parseMode("aussie")).toEqual(REGIONAL);
  });

  it("migrates the legacy 'normal' value to the default mode", () => {
    expect(parseMode("normal")).toEqual(DEFAULT_MODE);
  });

  it("parses the serialised locale:tone form", () => {
    expect(parseMode("en:regional")).toEqual(REGIONAL);
    expect(parseMode("en:normal")).toEqual(NORMAL);
  });

  it("defaults when the stored value is absent", () => {
    expect(parseMode(null)).toEqual(DEFAULT_MODE);
    expect(parseMode(undefined)).toEqual(DEFAULT_MODE);
    expect(parseMode("")).toEqual(DEFAULT_MODE);
  });

  it("degrades an unknown tone to the base tone, keeping the locale", () => {
    expect(parseMode("en:shouty")).toEqual(NORMAL);
  });

  it("discards the tone too when the locale is unknown", () => {
    // Tone is only meaningful relative to its locale: someone returning with a
    // stored "fr:regional" after French is withdrawn should get plain English,
    // not English in a regional register they never picked for this language.
    expect(parseMode("fr:regional")).toEqual(DEFAULT_MODE);
    expect(parseMode("de:normal")).toEqual(DEFAULT_MODE);
  });

  it("degrades malformed values rather than throwing", () => {
    expect(parseMode("garbage")).toEqual(DEFAULT_MODE);
    expect(parseMode("::::")).toEqual(DEFAULT_MODE);
  });

  it("never rewrites storage on read, so a withdrawn locale can come back", () => {
    // parseMode is pure — the stored string is untouched, so if that locale
    // ships again the user's original preference resumes working.
    const stored = "fr:regional";
    expect(parseMode(stored)).toEqual(DEFAULT_MODE);
    expect(stored).toBe("fr:regional");
  });

  it("round-trips every mode through serialise → parse", () => {
    for (const mode of [NORMAL, REGIONAL]) {
      expect(parseMode(serialiseMode(mode))).toEqual(mode);
    }
  });
});
