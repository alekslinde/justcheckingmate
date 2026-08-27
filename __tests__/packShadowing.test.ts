import { describe, it, expect } from "vitest";
import { resolveRegionPack, supportedRegions } from "@/lib/regions";

// Guards the substring-collision failure mode above the WORD_MATCH_MAX_LEN
// threshold (#196).
//
// scamDetector documents the short-token half of this problem and automates
// protection for entries of 3 characters or fewer, so "acc" can't fire inside
// "account". Longer entries keep plain substring matching, and the membership
// tests all use .some()/.filter() — which short-circuit. So when one entry is a
// substring of another, the longer one is unreachable: it can never be the
// matching entry.
//
// Most shadowing is harmless. "metropolitan police" is unreachable because
// "police" matches first, but both live in authorityMentions and score the
// same, so the verdict is identical and the dead entry is merely redundant.
//
// The harmful case is when the *shadowing* entry is broader than intended, so
// it fires on text the longer entry never would. That is what shipped and was
// caught in review on #189: "tax resolution oversight" shadowed the fabricated
// "tax resolution oversight department" and, being ordinary tax-industry
// English, flagged legitimate mail as government impersonation.
//
// This test can't tell those two apart — that judgement is the author's. What
// it does is make the collision visible at authoring time, so a new one is a
// decision rather than an accident. KNOWN_SHADOWING is the baseline as it
// stood when the guard was added; a new pair fails until it is either fixed or
// added here with a reason.

/** Mirrors mentions() in scamDetector — keep in sync if that rule changes. */
const WORD_MATCH_MAX_LEN = 3;
function matches(needle: string, hay: string): boolean {
  if (needle.length <= WORD_MATCH_MAX_LEN) {
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay);
  }
  return hay.includes(needle);
}

/** The scoring lists matched by substring against message text. */
const SCORED_LISTS = [
  "urgencyWords",
  "rewardWords",
  "requestWords",
  "authorityMentions",
  "noLinkSenders",
  "foreignAuthorityMentions",
] as const;

/**
 * Shadowed pairs accepted as they stand, `"shadowed" <- "shadowing"`.
 *
 * Keyed on the phrase pair rather than the pack, because the base lists merge
 * into all six regions and would otherwise be listed six times over.
 *
 * Every entry here is the harmless class: the shadowing phrase is itself a
 * legitimate member of the same list, scoring the same weight, so the dead
 * entry changes no verdict. They are kept for readability — "an garda
 * siochana" documents the campaign better than "garda" alone.
 *
 * Two are worth a closer look if anyone revisits this list, because the
 * shadowing entry is broad enough to fire on ordinary English:
 *   · "unclaimed" <- "claim"  — "claim your unclaimed book" scores as reward
 *     language on "claim" alone
 *   · "risk-free investment" <- "free"
 * Both predate this guard and are left as-is; changing them is a detection
 * decision, not a test fix. See #196.
 */
const KNOWN_SHADOWING = new Set([
  // base — reward
  "reward points <- reward",
  "risk-free investment <- free",
  "unclaimed <- claim",
  // base — urgency
  "disconnected within 24 hours <- within 24 hours",
  "respond immediately <- immediately",
  // AU
  "super account suspended <- account suspended",
  // CA
  "canadian anti-fraud centre <- anti-fraud centre",
  "royal canadian mounted police <- police",
  "carbon tax rebate <- tax rebate",
  // GB
  "metropolitan police <- police",
  "nhs england <- nhs",
  "car tax refund <- tax refund",
  "council tax rebate <- tax rebate",
  "council tax refund <- tax refund",
  "vehicle tax refund <- tax refund",
  "energy account suspended <- account suspended",
  "free pension review <- pension review",
  "meter reading required urgently <- urgent",
  // IE
  "an garda siochana <- garda",
  "an garda siochana <- garda siochana",
  "garda siochana <- garda",
  "gardai <- garda",
  "central bank of ireland <- central bank",
  "department of social protection <- social protection",
  "revenue commissioners <- revenue",
  "emergency tax refund <- tax refund",
  "motor tax refund <- tax refund",
  // NZ
  "new zealand police <- police",
  "nz police <- police",
  "end of year tax refund <- tax refund",
  "final toll notice <- toll notice",
  // US
  "centers for medicare <- medicare",
  "social security administration <- social security",
  "united states postal service <- postal service",
  "unclaimed tax refund <- tax refund",
  "final notice of unpaid toll <- unpaid toll",
  "unpaid tolls on your account <- unpaid toll",
  // US, and the harmful class rather than the harmless one — the shadowing
  // phrase is broad enough to match ordinary English. Left as-is because
  // removing a live scoring entry is a detection change, not a test fix:
  //   · "your account" scores +10 as urgency, so "Your account balance is
  //     available in the app." reaches 20 / suspicious in the US pack
  //   · "final notice" is milder but the same shape
  // Flagged on #196 for a follow-up decision.
  "final notice of intent to levy <- final notice",
  "final notice of unpaid toll <- final notice",
  "unpaid tolls on your account <- your account",
]);

describe("region pack substring shadowing", () => {
  it("has no unreviewed shadowed entries in any scoring list", () => {
    const found = new Set<string>();

    for (const code of supportedRegions()) {
      const pack = resolveRegionPack(code) as unknown as Record<string, unknown>;
      for (const key of SCORED_LISTS) {
        const list = pack[key];
        if (!Array.isArray(list)) continue;
        const entries = (list as string[]).map((e) => e.toLowerCase());
        for (const shadowing of entries) {
          for (const shadowed of entries) {
            if (shadowing === shadowed) continue;
            if (matches(shadowing, shadowed)) {
              found.add(`${shadowed} <- ${shadowing}`);
            }
          }
        }
      }
    }

    const unreviewed = [...found].filter((p) => !KNOWN_SHADOWING.has(p)).sort();
    expect(
      unreviewed,
      "New shadowed entries. The longer phrase is unreachable — .some() " +
        "short-circuits on the shorter one. Either drop the redundant entry, " +
        "or add the pair to KNOWN_SHADOWING with a reason. If the SHORTER " +
        "phrase is broad enough to match ordinary English, drop that one " +
        "instead — see #189.",
    ).toEqual([]);
  });

  it("keeps the allowlist free of pairs that no longer exist", () => {
    const found = new Set<string>();
    for (const code of supportedRegions()) {
      const pack = resolveRegionPack(code) as unknown as Record<string, unknown>;
      for (const key of SCORED_LISTS) {
        const list = pack[key];
        if (!Array.isArray(list)) continue;
        const entries = (list as string[]).map((e) => e.toLowerCase());
        for (const a of entries) {
          for (const b of entries) {
            if (a !== b && matches(a, b)) found.add(`${b} <- ${a}`);
          }
        }
      }
    }
    const stale = [...KNOWN_SHADOWING].filter((p) => !found.has(p)).sort();
    expect(stale, "Allowlist entries with no matching pair — remove them.").toEqual([]);
  });
});
