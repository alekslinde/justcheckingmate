import { describe, it, expect } from "vitest";
import { resolveRegionPack, supportedRegions, DEFAULT_REGION, FALLBACK_REGION } from "@/lib/regions";
import { BASE_SIGNALS } from "@/lib/regions/base";
import { AU } from "@/lib/regions/au";

describe("resolveRegionPack", () => {
  it("resolves a known region", () => {
    const pack = resolveRegionPack("AU");
    expect(pack.code).toBe("AU");
    expect(pack.name).toBe("Australia");
    expect(pack.coverage).toBe("full");
  });

  it("is case-insensitive", () => {
    expect(resolveRegionPack("au").code).toBe("AU");
  });

  // An unknown region must degrade to a working checker, never break the check.
  it.each([undefined, null, "", "QQ", "not-a-region"])(
    "falls back to the default region for %p",
    (input) => {
      expect(resolveRegionPack(input).code).toBe(DEFAULT_REGION);
    },
  );

  it("returns a stable memoised instance", () => {
    expect(resolveRegionPack("AU")).toBe(resolveRegionPack("AU"));
  });

  it("lists every region that has a pack", () => {
    expect(supportedRegions()).toContain(DEFAULT_REGION);
    expect(supportedRegions()).toContain(FALLBACK_REGION);
  });

  it("resolves the base-only fallback pack", () => {
    const pack = resolveRegionPack(FALLBACK_REGION);
    expect(pack.code).toBe(FALLBACK_REGION);
    expect(pack.coverage).toBe("none");
    // Universal signals still run — real detections must still fire.
    expect(pack.suspiciousTlds.length).toBeGreaterThan(0);
    expect(pack.requestWords.length).toBeGreaterThan(0);
    // But there is no national layer to lean on.
    expect(pack.authorityMentions).toEqual([]);
    expect(pack.legitDomains).toEqual([]);
  });
});

describe("pack composition", () => {
  const pack = resolveRegionPack("AU");

  it("inherits universal signals from base", () => {
    expect(pack.rewardWords).toEqual(expect.arrayContaining(BASE_SIGNALS.rewardWords));
    expect(pack.requestWords).toEqual(expect.arrayContaining(BASE_SIGNALS.requestWords));
    expect(pack.callbackBrands).toEqual(expect.arrayContaining(BASE_SIGNALS.callbackBrands));
    expect(pack.suspiciousTlds).toBe(BASE_SIGNALS.suspiciousTlds);
  });

  it("layers region signals on top of base", () => {
    // AU-specific identifiers that have no meaning in other markets.
    expect(pack.requestWords).toEqual(expect.arrayContaining(["tax file number", "bsb", "smsf"]));
    expect(pack.rewardWords).toContain("verified by asic");
    expect(pack.callbackBrands).toEqual(expect.arrayContaining(["coinspot", "swyftx"]));
  });

  it("flattens every urgency group into urgencyWords", () => {
    for (const group of Object.values(pack.urgency)) {
      expect(pack.urgencyWords).toEqual(expect.arrayContaining(group));
    }
  });

  it("keeps the flat urgency union free of duplicates", () => {
    // A phrase in two groups would score twice for one match.
    expect(new Set(pack.urgencyWords).size).toBe(pack.urgencyWords.length);
  });
});

// Invariants that must hold for every pack, present and future. These come from
// code-review findings on the GB pack — each was a real defect, and each is the
// kind that reappears the next time someone authors a region.
describe("pack invariants (every region)", () => {
  const packs = supportedRegions().map((code) => [code, resolveRegionPack(code)] as const);

  // requestWords is substring-matched, so a phrase containing another scores
  // twice for one match. The overlap is invisible in the flag text (both
  // phrases are listed, which reads as two findings) but doubles the score.
  //
  // No exemptions: the two pre-existing overlaps this originally grandfathered
  // ("updated bank details" in base, "mygovid" in AU) are now fixed. The AU one
  // was verdict-changing on its own — "Confirm your myGovID" reached
  // likely_scam while the identical "Confirm your myGov" was only suspicious.
  it.each(packs)("%s: no requestWord contains another requestWord", (_code, pack) => {
    const offenders = pack.requestWords.filter((w) =>
      pack.requestWords.some((other) => other !== w && w.includes(other)),
    );
    expect(offenders).toEqual([]);
  });

  it.each(packs)("%s: only lists eligibility-restricted trusted suffixes", (_code, pack) => {
    // A trusted suffix suppresses brand scoring entirely, so an open
    // registration would whitelist exactly the domains scammers buy.
    const OPEN = [".co.uk", ".org.uk", ".com", ".net", ".org", ".io", ".co", ".me"];
    for (const suffix of pack.trustedHostSuffixes) {
      expect(OPEN).not.toContain(suffix);
    }
  });

  it.each(packs)("%s: names only concrete brands as crypto exchanges", (_code, pack) => {
    // The TOAD flag quotes whichever entry matched, so a generic phrase renders
    // "crypto exchange and other exchanges never ring customers".
    for (const brand of pack.cryptoExchanges) {
      expect(brand).not.toMatch(/\b(exchange|platform|wallet|crypto)\b/i);
    }
  });

  it.each(packs)("%s: keeps word-matched brands out of the substring lists", (_code, pack) => {
    // A name needing \b boundaries must not also be substring-matched — the
    // substring path would defeat the boundary that made it safe to include.
    for (const set of [pack.typosquatBrands, pack.brandMentions]) {
      for (const word of set.word) {
        expect(set.substring).not.toContain(word);
      }
    }
  });
});

describe("AU region definition", () => {
  it("only claims no-link senders that are also impersonated authorities", () => {
    // The flag copy names these bodies, so a sender missing from
    // authorityMentions could never reach the nested no-link check.
    const authorities = AU.authorityMentions.map((a) => a.toLowerCase());
    for (const sender of AU.noLinkSenders) {
      expect(authorities).toContain(sender.toLowerCase());
    }
  });

  it("builds the fraudulent-platform flag around the matched name", () => {
    expect(AU.fakeInvestmentPlatformFlag("quantum ai")).toContain("quantum ai");
  });

  it("has no duplicate entries within a signal list", () => {
    const lists = {
      authorityMentions: AU.authorityMentions.map((a) => a.toLowerCase()),
      legitDomains: AU.legitDomains,
      identityRereg: AU.identityRereg,
      foreignAuthorityMentions: AU.foreignAuthorityMentions,
    };
    for (const [name, list] of Object.entries(lists)) {
      expect({ [name]: new Set(list).size }).toEqual({ [name]: list.length });
    }
  });
});
