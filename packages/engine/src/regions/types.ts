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
export type RegionCode = "AU" | "GB" | "US" | "NZ" | "CA" | "IE" | "ZZ";

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

/**
 * National number-plan semantics that libphonenumber cannot supply.
 *
 * The library owns parsing, validity, line type and country — that is a static
 * lookup table, not a model, so it fits the rule-based constraint. What it has
 * no opinion on is *scam* semantics: which ranges scammers favour, and which
 * number shapes get impersonated here. That judgement is regional, so it lives
 * in the pack.
 *
 * A region may omit this entirely; phone analysis then relies on libphonenumber
 * plus the universal signals (wangiri, high-scam country codes) alone.
 */
export interface PhonePlan {
  /**
   * Premium-rate prefixes in national (0-prefixed) form.
   *
   * Deliberately ours rather than the library's: libphonenumber rejects AU
   * `190x` numbers as invalid, so deferring to it would downgrade a "you will
   * be charged premium rates" warning into a generic "invalid number" — less
   * useful advice for exactly the case that costs money.
   */
  premiumPrefixes?: string[];
  /** Copy for the premium-rate flag; names the local range, so it's regional. */
  premiumFlag?: string;

  /**
   * Mobile prefixes commonly allocated to VoIP / virtual-number providers.
   * Number portability makes carrier attribution unreliable, so this is a hint,
   * not an assertion — it only nudges risk to medium.
   */
  voipMobilePrefixes?: string[];

  /** Geographic area/STD codes → human-readable area, in national form. */
  areaCodes?: Record<string, string>;

  /**
   * Region-specific emergency numbers, added to the universal set in
   * phoneIntel. That set (000/999/911/111/112…) already covers the common
   * ones and applies regardless of region — a pack must not be required for an
   * emergency number to be recognised. Use this only for national additions.
   */
  emergencyNumbers?: string[];

  /**
   * Copy for toll-free and shared-cost lines. Both are heavily impersonated,
   * but the number ranges and the bodies scammers pose as differ per country,
   * so the wording is authored regionally rather than templated.
   */
  tollFreeFlag?: string;
  sharedCostFlag?: string;
}

/**
 * Impersonated consumer brands, split by how they're matched.
 *
 * Extracted from scamDetector in Phase 5 — these lists were still hardcoded AU
 * arrays inside the checkers, which meant a UK pack would have scored `commbank`
 * and `linkt` and missed `hsbc` and `dvla` entirely. The interface holds them
 * now because *which* brands get impersonated is the most region-specific signal
 * there is.
 *
 * The `substring` / `word` split is not cosmetic. Both lists are matched against
 * unanchored text, so a short entry collides: bare "agl" fires on "bagel",
 * "eagle" and "flagship", and UK "eon" fires on "peon" and "neon". Anything
 * under ~5 characters, or that reads as a common English fragment, belongs in
 * `word` and is matched on \b boundaries instead.
 */
export interface BrandSet {
  /** Distinctive enough to match as a bare substring. */
  substring: string[];
  /** Short or dictionary-colliding names, matched on word boundaries. */
  word: string[];
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
  /**
   * Crypto exchanges named in the "exchange rings you about your account" SMS
   * composite. A narrower list than callbackBrands, which also carries
   * tech-support and e-signature covers — those belong to the email invoice
   * script, not this one. Regions append their local exchanges.
   */
  cryptoExchanges: string[];
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

  /**
   * National bank-routing identifiers ("bsb" in AU, "sort code" in GB). Used by
   * the bond-redirect composite, which pairs a rental context with a bank-detail
   * ask — hardcoding one country's term would silently drop half the composite
   * elsewhere.
   *
   * These may also appear in `requestWords`, and usually should: the two serve
   * different rules. `requestWords` scores the bare ask ("send your sort code")
   * additively with other solicited identifiers, while this list is one half of
   * a composite that fires only alongside a rental context. Listing an
   * identifier in both is intentional, not duplication.
   *
   * What must *not* happen is listing a phrase twice within `requestWords`
   * itself — it is substring-matched, so "new sort code" alongside "sort code"
   * scores one phrase twice.
   */
  bankIdentifiers: string[];

  /** Digital-identity re-registration phishing phrases. */
  identityRereg: string[];
  /** Copy for the identity re-registration flag. */
  identityReregFlag: string;

  /**
   * Address-correction phrases that score only alongside a parcel/delivery
   * signal. Optional: a region defines it when its carrier's dominant lure is
   * address-shaped, which today is AU only. Ordinary retail commerce uses these
   * words, so they must never score flat — see PARCEL_ADDRESS_PHRASES in au.ts.
   */
  parcelAddressPhrases?: string[];

  /**
   * Copy for the named-fraudulent-platform flag. A function because the flag
   * embeds the matched platform name, and the sentence names this region's
   * regulator — both vary per region.
   */
  fakeInvestmentPlatformFlag: (platform: string) => string;

  /**
   * Brands whose names appearing in a *hostname* indicate typosquatting —
   * banks, telcos, government portals, retailers. Checked with
   * `hostname.includes()`, excluding the region's own trusted suffixes below.
   */
  typosquatBrands: BrandSet;

  /**
   * Hostname suffixes that exempt a typosquat match, because a brand name under
   * them is expected rather than suspicious.
   *
   * **Only eligibility-restricted suffixes belong here.** The exemption
   * suppresses brand scoring entirely, so it is only safe where the registry
   * verifies who may register: `.gov.au` and `.com.au` require government
   * status or an ABN, and `.gov.uk` / `.nhs.uk` are restricted to public bodies.
   * Open registrations must *not* be listed — `.co.uk` and `.org.uk` are sold to
   * anyone, so exempting them would whitelist exactly the domains scammers buy
   * (`barclays-secure-verify.co.uk` scoring no brand signal at all).
   *
   * This is why the field can't simply be "the region's own suffixes": that
   * reasoning holds for Australia, where the national second-level domains are
   * all gated, and breaks for the UK. Legitimate brands on an open suffix are
   * handled by `legitDomains` instead, which is an explicit allowlist rather
   * than a blanket pattern.
   */
  trustedHostSuffixes: string[];

  /**
   * Non-government brands impersonated in *message bodies* — delivery apps,
   * telcos, energy retailers, exchanges. Scored lower than an authority mention
   * and with separate copy, since "verify via official channels" reads wrong for
   * a food-delivery text.
   */
  brandMentions: BrandSet;

  /**
   * Names that, appearing in an email body sent from a domain outside
   * `trustedHostSuffixes`, indicate impersonation. Deliberately narrower than
   * brandMentions — only bodies whose real mail always comes from a national
   * domain, so a mismatch is meaningful rather than merely possible.
   */
  officialSenderNames: string[];

  /** Known-legitimate domains that should short-circuit URL scoring. */
  legitDomains: string[];

  /**
   * Domains of organisations named in `authorityMentions` that do NOT sit on a
   * gated national suffix — Australia Post on `.com.au`, for instance.
   *
   * Used only to recognise that an email genuinely came from the body it talks
   * about, so the impersonation signal does not fire on the organisation's own
   * mail. Kept apart from `legitDomains` because that list short-circuits URL
   * scoring to "safe" with government-specific copy, which would be wrong here:
   * a link on a corporate domain still deserves normal scrutiny, and only the
   * *sender* claim is being resolved.
   *
   * Add a domain only when the organisation is in `authorityMentions` and its
   * real mail demonstrably comes from that domain. An entry here weakens a scam
   * signal, so the bar is evidence, not plausibility.
   *
   * Optional: a pack with no researched entries omits it and the impersonation
   * signal behaves exactly as before. Absent means "we have not checked", which
   * is the safe default — never "no such domains exist".
   */
  authorityOwnDomains?: string[];
  /** Copy for the legit-domain pass; names the jurisdiction, so it's regional. */
  legitDomainFlag: string;
  /** Details line for the legit-domain pass. */
  legitDomainDetails: string;

  /**
   * Sender-ID registration scheme, where the region has one. Scammers tell
   * victims to ignore an "Unverified" label; that only means something where
   * such a scheme exists, so a region without one omits this and the rule is
   * skipped rather than asserting foreign regulation.
   */
  senderIdFlag?: string;

  /** Where to report a confirmed scam — the agency differs per jurisdiction. */
  reportingBody: string;

  /**
   * Report-a-scam URL for `reportingBody`, used by the UI's action steps and
   * report-success footer. Optional: packs for jurisdictions without a single
   * stable reporting URL omit it and the UI renders the body name as plain
   * text rather than linking nowhere. Must be an https URL on a domain the
   * pack already trusts (ideally one in `legitDomains`), never a URL
   * shortener or a redirect — this link is the last line of a "this is almost
   * certainly a scam" verdict, so it has to survive scrutiny.
   */
  reportingUrl?: string;

  /** National number-plan semantics. Omitted where we have none authored. */
  phonePlan?: PhonePlan;

  /** Region-specific brands appended to the base callback-brand list. */
  callbackBrands?: string[];
  /** Locally-popular crypto exchanges appended to the base exchange list. */
  cryptoExchanges?: string[];
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
  cryptoExchanges: string[];

  typosquatBrands: BrandSet;
  trustedHostSuffixes: string[];
  brandMentions: BrandSet;
  officialSenderNames: string[];

  authorityMentions: string[];
  noLinkSenders: string[];
  noLinkSendersFlag: string;
  foreignAuthorityMentions: string[];
  foreignAuthorityFlag: string;
  bankIdentifiers: string[];
  identityRereg: string[];
  identityReregFlag: string;
  /** Gated address-correction phrases; empty for regions that define none. */
  parcelAddressPhrases: string[];
  fakeInvestmentPlatformFlag: (platform: string) => string;
  legitDomains: string[];
  authorityOwnDomains: string[];
  legitDomainFlag: string;
  legitDomainDetails: string;
  senderIdFlag?: string;
  reportingBody: string;
  /** Resolved report-a-scam URL; absent where the definition carries none. */
  reportingUrl?: string;
  /** Always present on a resolved pack; an empty plan where none is authored. */
  phonePlan: PhonePlan;
}
