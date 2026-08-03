// Region pack interface — the data shape that makes detection country-aware.
//
// Detection stays rule-based: a region pack is *data* (keyword lists, domain
// allowlists, copy), never logic. The scoring engine in scamDetector.ts is
// shared across every region; only the signals it matches against change.
//
// Two layers compose into the pack a checker actually consumes:
//   · BASE  (lib/regions/base.ts) — universal signals with no national tie:
//           generic urgency, voice-clone/"Hi Mum", reward and request language,
//           URL shorteners, abused TLDs, IPFS gateways, phishing hosting.
//   · REGION (lib/regions/au.ts, …) — national brands, agencies, number-plan
//           semantics, legitimate-domain allowlists, region-specific campaigns.
//
// resolveRegionPack() in ./index.ts merges the two. Anything universal belongs
// in base so a new region inherits it for free.

/** ISO 3166-1 alpha-2, uppercase. */
export type RegionCode = "AU";

/**
 * How much detection coverage a region actually has.
 *
 * Consumed from Phase 3 onward: a low score from a region we have no rules for
 * must never render as a confident "looks fine". Declared here so packs carry
 * the field from the start.
 *
 *   full    — maintained keyword sets, agency list and domain allowlist
 *   partial — base signals plus a thin region layer; gaps expected
 *   none    — base signals only; no national coverage
 */
export type RegionCoverage = "full" | "partial" | "none";

/**
 * Urgency signals grouped by campaign so each can be tuned or removed
 * independently. Checkers consume the flat union (see RegionPack.urgencyWords);
 * the grouping exists for maintenance and provenance, not for scoring.
 *
 * Group names are deliberately generic rather than national — `utility` rather
 * than NBN, `pension` rather than superannuation — so other regions can fill
 * the same slot with their own equivalent.
 */
export interface UrgencyGroups {
  /** Generic pressure language common to nearly all scam messaging. */
  generic: string[];
  /** Impersonated foreign police / immigration / consular threats. */
  foreignAuthority: string[];
  /** Road toll and congestion-charge lures. */
  toll: string[];
  /** Parcel / delivery-failure lures. */
  parcel: string[];
  /** AI voice-clone and family-emergency follow-up messages. */
  voiceClone: string[];
  /** Telco / broadband disconnection threats. */
  utility: string[];
  /** Retirement / pension scheme phishing. */
  pension: string[];
  /** Fake product-recall lures. */
  recall: string[];
  /** Tax and cost-of-living *benefit* lures (refunds, rebates). */
  tax: string[];
  /** Tax *coercion* lures (debt, audit, enforcement threats). */
  taxThreat: string[];
}

/** Signals with no national tie — shared by every region. */
export interface BaseSignals {
  urgency: Pick<UrgencyGroups, "generic" | "voiceClone">;
  /** Prize / winnings / guaranteed-return bait. */
  rewardWords: string[];
  /** Credential, payment and remote-access solicitation. */
  requestWords: string[];
  /** URL shorteners that hide the real destination. */
  shortenerDomains: string[];
  /** TLDs with high phishing-abuse ratios. */
  suspiciousTlds: string[];
  /** Public IPFS gateways used for takedown-resistant phishing. */
  ipfsGateways: Set<string>;
  /** Free-tier cloud platforms used as phishing hosting. */
  suspiciousHosting: string[];
  /** Per-platform score overrides for suspiciousHosting; default is +35. */
  hostingScores: Record<string, number>;
  /** Named fraudulent trading platforms with regulator warnings. */
  fakeInvestmentPlatforms: string[];
  /** Brands used as cover in callback/TOAD phishing. */
  callbackBrands: string[];
}

/** The national layer, authored per country. */
export interface RegionDefinition {
  code: RegionCode;
  /** Display name for user-facing copy. */
  name: string;
  coverage: RegionCoverage;

  /** Campaign urgency groups this region contributes on top of base. */
  urgency: Omit<UrgencyGroups, "generic" | "voiceClone">;

  /**
   * Government agencies, national posts and toll operators impersonated in
   * this region. Matched case-insensitively.
   */
  authorityMentions: string[];
  /**
   * The subset of authorityMentions that have publicly committed to sending no
   * links in unsolicited SMS — a link alongside one of these is a scam signal.
   * Must be a subset of authorityMentions, else the flag copy would misstate.
   */
  noLinkSenders: string[];
  /** Copy for the no-link-sender flag; names the bodies, so it's per-region. */
  noLinkSendersFlag: string;

  /** Impersonated foreign authorities that have no jurisdiction here. */
  foreignAuthorityMentions: string[];
  /** Copy for the foreign-authority flag. */
  foreignAuthorityFlag: string;

  /** Digital-identity re-registration phishing phrases. */
  identityRereg: string[];
  /** Copy for the identity re-registration flag. */
  identityReregFlag: string;

  /**
   * Copy for the named-fraudulent-platform flag. A function because the flag
   * embeds the matched platform name, and the sentence names this region's
   * regulator — both vary per region.
   */
  fakeInvestmentPlatformFlag: (platform: string) => string;

  /** Known-legitimate domains that should short-circuit URL scoring. */
  legitDomains: string[];

  /** Region-specific brands appended to the base callback-brand list. */
  callbackBrands?: string[];
  /** Region-specific fraudulent platforms appended to the base list. */
  fakeInvestmentPlatforms?: string[];
  /** Region-specific reward/bait phrases appended to the base list. */
  rewardWords?: string[];
  /** Region-specific solicited identifiers appended to the base list. */
  requestWords?: string[];
}

/**
 * A fully-resolved pack: base merged with one region. This is what checkers
 * consume — they never reach into base or a region definition directly.
 */
export interface RegionPack {
  code: RegionCode;
  name: string;
  coverage: RegionCoverage;

  /** Grouped urgency signals, base and region combined. */
  urgency: UrgencyGroups;
  /** Flat union of every urgency group — what the checkers match against. */
  urgencyWords: string[];

  rewardWords: string[];
  requestWords: string[];

  shortenerDomains: string[];
  suspiciousTlds: string[];
  ipfsGateways: Set<string>;
  suspiciousHosting: string[];
  hostingScores: Record<string, number>;

  fakeInvestmentPlatforms: string[];
  callbackBrands: string[];

  authorityMentions: string[];
  noLinkSenders: string[];
  noLinkSendersFlag: string;
  foreignAuthorityMentions: string[];
  foreignAuthorityFlag: string;
  identityRereg: string[];
  identityReregFlag: string;
  fakeInvestmentPlatformFlag: (platform: string) => string;
  legitDomains: string[];
}
