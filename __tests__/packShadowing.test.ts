import { describe, it, expect } from "vitest";
import { resolveRegionPack, supportedRegions } from "@/lib/regions";
import { checkSms } from "@/lib/scamDetector";

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
  // US. "final notice" is broad, but it scores +10 and leaves an ordinary
  // message ("Final notice: our newsletter is moving") at 10 / safe, which is
  // the intended weak-signal behaviour — it needs corroboration to matter.
  // The bare "your account" pair that used to sit here is gone: that entry was
  // removed, since a noun phrase is not pressure language. See the note on
  // URGENCY_GENERIC in lib/regions/base.ts.
  "final notice of intent to levy <- final notice",
  "final notice of unpaid toll <- final notice",
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

// ── Short scored entries must match on word boundaries ────────────────────────
//
// urgencyWords, rewardWords and requestWords were matched with a bare
// `includes()`, so short entries fired inside ordinary English: "pin" in
// "Pinned", "free" in "Freedom", "ato" in "atomic". Each added 12–15 points to
// innocuous text, and the flag then quoted the fragment as evidence — "Asks for
// sensitive info: 'pin'" on a message about a pinned document.
//
// scamDetector's `mentions()` already solved this for the authority lists (see
// the note above WORD_MATCH_MAX_LEN); these lists simply never adopted it. The
// threshold is 4 rather than 3 so "free" and "cash" are covered — every 4-char
// entry across the packs is a standalone word or identifier ($500, 401k, nino,
// ppsn, prsa, tfn), none of which needs to match inside a longer word.

describe("short scored entries do not fire inside longer words", () => {
  const INNOCUOUS = [
    ["Pinned the document to the top of the channel.", "pin"],
    ["Freedom of information request received.", "free"],
    ["The atomic clock experiment is precise.", "ato"],
    ["Shipping is included on every order.", "pin"],
    ["Please review the attached information.", "ato"],
  ] as const;

  for (const [text, fragment] of INNOCUOUS) {
    it(`does not flag "${fragment}" inside: ${text.slice(0, 34)}…`, () => {
      const result = checkSms(text, undefined, "AU");
      expect(result.flags.some((f) => f.includes(`"${fragment}"`)), result.flags.join(" | ")).toBe(false);
      expect(result.verdict).toBe("safe");
    });
  }

  it("still matches those same entries as whole words", () => {
    // The entries exist for a reason — this is the behaviour being preserved.
    const scam = "ATO: confirm your TFN and PIN to release your refund";
    const result = checkSms(scam, undefined, "AU");
    expect(result.flags.some((f) => /Asks for sensitive info/i.test(f))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("keeps scoring a real scam at full strength", () => {
    const scam = "ATO: your tax refund is pending, confirm your TFN at http://ato-refund.xyz";
    expect(checkSms(scam, undefined, "AU").verdict).toBe("likely_scam");
  });

  it("still catches a free-prize lure", () => {
    const scam = "You have won a free prize! Claim now at http://prize.tk";
    const result = checkSms(scam, undefined, "AU");
    expect(result.flags.some((f) => /Prize\/reward language/i.test(f))).toBe(true);
  });
});
