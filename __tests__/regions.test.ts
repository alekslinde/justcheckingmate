import { describe, it, expect } from "vitest";
import { checkSms, checkUrl, mentions } from "@justcheckingmate/engine/scamDetector";
import { resolveRegionPack, supportedRegions, DEFAULT_REGION, FALLBACK_REGION } from "@justcheckingmate/engine/regions";
import { BASE_SIGNALS, CHINESE_AUTHORITY_MENTIONS } from "@justcheckingmate/engine/regions/base";
import { AU } from "@justcheckingmate/engine/regions/au";

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

  // A phrase that another entry can match inside scores twice for one match.
  // The overlap is invisible in the flag text (both phrases are listed, which
  // reads as two findings) but doubles the score.
  //
  // Overlap is tested the way mentions() actually matches (#233): a single
  // token only shadows on word boundaries, so "mygov" no longer reaches inside
  // "mygovid" and both can be listed. A multi-word phrase still matches as a
  // substring, so "bank details" inside "updated bank details" would still
  // double-score and is still forbidden.
  // The engine's own matcher — a hand-copied rule here would let the invariant
  // drift from what actually double-scores.
  const canMatchInside = (needle: string, hay: string) => mentions(hay, needle);

  // Every scored list, not just requestWords (#234). The rule had only ever
  // been applied to one list, and the other two had accumulated 22 overlapping
  // pairs between them — "tax refund" inside "council tax refund", "final
  // notice" inside "final notice of unpaid toll", "reward" inside "reward
  // points". Each scored one phrase as two findings and quoted both in the
  // flag, so the evidence shown to the reader was doubled too.
  //
  // The longer entry in such a pair is unreachable: the shorter one always
  // matches first, so it can never be the sole hit. It contributes nothing but
  // the duplicate, which is why the fix was to delete it rather than to
  // re-weight around it.
  const SCORED_LISTS = ["urgencyWords", "rewardWords", "requestWords"] as const;

  for (const list of SCORED_LISTS) {
    it.each(packs)(`%s: no ${list} entry can match inside another`, (_code, pack) => {
      const entries = pack[list] as string[];
      const offenders = entries.filter((w) =>
        entries.some((other) => other !== w && canMatchInside(other, w)),
      );
      expect(offenders).toEqual([]);
    });
  }

  it.each(packs)("%s: only lists eligibility-restricted trusted suffixes", (_code, pack) => {
    // A trusted suffix suppresses brand scoring entirely, so an open
    // registration would whitelist exactly the domains scammers buy.
    const OPEN = [".co.uk", ".org.uk", ".com", ".net", ".org", ".io", ".co", ".me"];
    for (const suffix of pack.trustedHostSuffixes) {
      expect(OPEN).not.toContain(suffix);
    }
  });

  // Code review of the US/NZ/CA/IE packs. The registrable-label rule decided a
  // two-part public suffix from the penultimate label alone ("is it co/com/gov/
  // …?"), which is true for `chase.gov.co` and `kiwibank.co.io` — but `.co` and
  // `.io` are ordinary gTLDs, so there the last two labels ARE the registrable
  // domain. Reading them as a suffix made the brand own the label, tripping the
  // "brand owns the label, so it's the real site" exemption and suppressing
  // brand scoring outright.
  //
  // One open-registration domain therefore defeated the typosquat rule in every
  // pack at once, which is why this is asserted per-pack rather than once: the
  // bug was cross-region, and so is the guarantee.
  it.each(packs)("%s: a brand under a fake two-part suffix is still a typosquat", (code, pack) => {
    const brand = pack.typosquatBrands.substring[0];
    if (!brand) return; // ZZ has no national brand list.
    // `.co` and `.io` are gTLDs — "<brand>.gov.co" is an ordinary domain someone
    // bought, not the brand's real site under a government suffix.
    for (const host of [`${brand}.gov.co`, `${brand}.com.co`, `${brand}.co.io`]) {
      const flags = checkUrl(`http://${host}/login`, undefined, code).flags.join(" | ").toLowerCase();
      expect({ host, impersonating: flags.includes("impersonating") })
        .toEqual({ host, impersonating: true });
    }
  });

  it.each(packs)("%s: a brand on its own real domain is not a typosquat", (code, pack) => {
    // The other half — the registrable-label exemption must keep working, or the
    // fix above would flag every genuine brand site. Phase 5 found that dropping
    // it flagged 21 of 24 real UK brand sites as likely_scam.
    //
    // The `.co.uk` / `.com.au` cases are the ones that exercise the two-part
    // suffix path specifically: a bare `<brand>.com` has only two labels, so the
    // suffix branch never runs, and a brand under the pack's own trusted suffix
    // is exempted earlier by the trusted-suffix rule. Without a genuine two-part
    // host here, removing suffix handling altogether would pass unnoticed.
    const brand = pack.typosquatBrands.substring[0];
    if (!brand) return;
    const hosts = [
      `${brand}.com`,
      `www.${brand}.com`,
      // Real two-part suffixes, on the open registrations where brands actually
      // live. These must resolve the registrable label to the brand itself.
      `${brand}.co.uk`,
      `www.${brand}.com.au`,
      `${brand}.co.nz`,
    ];
    for (const host of hosts) {
      const flags = checkUrl(`https://${host}/`, undefined, code).flags.join(" | ").toLowerCase();
      expect({ host, impersonating: flags.includes("impersonating") })
        .toEqual({ host, impersonating: false });
    }
  });

  it.each(packs)("%s: names only concrete brands as crypto exchanges", (_code, pack) => {
    // The TOAD flag quotes whichever entry matched, so a generic phrase renders
    // "crypto exchange and other exchanges never ring customers".
    for (const brand of pack.cryptoExchanges) {
      expect(brand).not.toMatch(/\b(exchange|platform|wallet|crypto)\b/i);
    }
  });

  // Found when the US/NZ/CA/IE packs were added. Agency lists are plain string
  // arrays with no substring/word split, and national agency acronyms are
  // overwhelmingly three letters — so a bare `includes()` fired inside ordinary
  // English. It was flagging "your account is fine" as government impersonation
  // (NZ "acc" ⊂ "account"), and would have read "message" as the SSA, "security"
  // as the SEC and "weird"/"third" as the IRD.
  //
  // The fix is mechanical rather than curated (mentionsAny in scamDetector
  // boundary-matches anything ≤3 chars), so this test asserts the *behaviour*
  // holds for every pack rather than policing list contents — a new region
  // inherits the protection without its author opting in.
  it.each(packs)("%s: short agency names don't fire inside ordinary words", (code, _pack) => {
    const innocuous = [
      "Please check your account balance today.",
      "Your message was received and the service notice is attached.",
      "That's weird, the third payment went through immediately.",
      "For your security, review the craft order their team sent.",
    ];
    for (const text of innocuous) {
      const flags = checkSms(text, undefined, code).flags.join(" | ").toLowerCase();
      expect({ text, flags: flags.includes("government agency") }).toEqual({ text, flags: false });
      expect({ text, flags: flags.includes("police authority") }).toEqual({ text, flags: false });
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

describe("foreign-authority mentions", () => {
  // The Chinese-authority block used to be copy-pasted into all six national
  // packs. It is diaspora-targeted rather than country-targeted, so there was
  // never a regional reason for six copies — and six copies meant the
  // "Chinese Embassy" gap (found 2026-08-10) existed six times over.
  const NATIONAL = supportedRegions().filter((c) => c !== FALLBACK_REGION);

  it("is shared by every national pack rather than duplicated", () => {
    for (const code of NATIONAL) {
      const pack = resolveRegionPack(code);
      for (const term of CHINESE_AUTHORITY_MENTIONS) {
        expect(pack.foreignAuthorityMentions, code).toContain(term);
      }
    }
  });

  it("carries interpol/europol everywhere except AU", () => {
    // AU's pack deliberately omits them; the AFP warning this list came from is
    // specifically about Chinese-authority impersonation.
    for (const code of NATIONAL) {
      const has = resolveRegionPack(code).foreignAuthorityMentions.includes("interpol");
      expect(has, code).toBe(code !== "AU");
    }
  });

  it("lists both word orders for embassy and consulate", () => {
    // Matching is \b-delimited substring, so word order is literal: before this
    // was fixed, "embassy of china" was listed and scored 31 while the natural
    // "Chinese Embassy" scored 0.
    for (const pair of [
      ["chinese embassy", "embassy of china"],
      ["chinese consulate", "consulate of china"],
    ]) {
      for (const term of pair) {
        expect(CHINESE_AUTHORITY_MENTIONS).toContain(term);
      }
    }
  });

  it("flags the phrasings a real lure uses", () => {
    for (const claim of [
      "This is the Chinese Embassy. You are named in a money laundering investigation.",
      "The Chinese Embassy in Canberra requires you to verify your identity.",
      "Consulate of China: your residency status is under review.",
      "This is the Public Security Bureau. An arrest warrant has been issued.",
      "Chinese police have opened a case against you.",
    ]) {
      const flags = checkSms(claim).flags.join(" | ");
      expect(/foreign police or government authority/i.test(flags), claim.slice(0, 44)).toBe(true);
    }
  });

  it("leaves topic words out, so ordinary copy stays clean", () => {
    // Each of these was considered and rejected: they name a subject rather than
    // an institution making contact, and the flag is worth +35 on its own.
    for (const term of ["chinese immigration", "chinese government", "china police"]) {
      expect(CHINESE_AUTHORITY_MENTIONS).not.toContain(term);
    }
    for (const legit of [
      "Chinese immigration rules changed in 2026, see our firm's summary.",
      "The Chinese government published new tariff schedules today.",
    ]) {
      const flags = checkSms(legit).flags.join(" | ");
      expect(/foreign police or government authority/i.test(flags), legit.slice(0, 44)).toBe(false);
    }
  });

  it("has no duplicates after the spread", () => {
    for (const code of NATIONAL) {
      const list = resolveRegionPack(code).foreignAuthorityMentions;
      expect({ [code]: new Set(list).size }).toEqual({ [code]: list.length });
    }
  });
});
