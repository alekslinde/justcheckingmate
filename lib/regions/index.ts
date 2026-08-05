// Region pack resolution — merges the universal base signals with one region's
// national layer into the RegionPack that checkers consume.

import { BASE_SIGNALS } from "./base";
import { AU } from "./au";
import { REST_OF_WORLD } from "./rest-of-world";
import type { RegionCode, RegionDefinition, RegionPack } from "./types";

export type { RegionCode, RegionCoverage, RegionPack } from "./types";

/**
 * What callers may pass as a region. Deliberately wider than RegionCode: the
 * value usually originates from a request header or user setting, so it can be
 * absent or arbitrary. resolveRegionPack narrows it, falling back to the
 * default rather than throwing.
 */
export type RegionInput = RegionCode | string | null | undefined;

/**
 * The region used when we have no signal at all about where someone is —
 * absent geo headers, local dev. Not used for *unknown* countries: those
 * resolve to REST_OF_WORLD, which is honest about having no local rules.
 */
export const DEFAULT_REGION: RegionCode = "AU";

/** The base-only pack for countries with no national layer. */
export const FALLBACK_REGION: RegionCode = "ZZ";

const REGIONS: Record<RegionCode, RegionDefinition> = {
  AU,
  ZZ: REST_OF_WORLD,
};

function buildPack(region: RegionDefinition): RegionPack {
  const urgency = {
    generic: BASE_SIGNALS.urgency.generic,
    voiceClone: BASE_SIGNALS.urgency.voiceClone,
    ...region.urgency,
  };

  return {
    code: region.code,
    name: region.name,
    coverage: region.coverage,

    urgency,
    // Flat union the checkers match against. Membership is what matters —
    // callers use .some()/.filter(), so this is order-independent — but the
    // groups are listed in a stable order to keep diffs readable.
    urgencyWords: [
      ...urgency.generic,
      ...urgency.foreignAuthority,
      ...urgency.toll,
      ...urgency.parcel,
      ...urgency.voiceClone,
      ...urgency.utility,
      ...urgency.pension,
      ...urgency.recall,
      ...urgency.tax,
      ...urgency.taxThreat,
    ],

    rewardWords: [...BASE_SIGNALS.rewardWords, ...(region.rewardWords ?? [])],
    requestWords: [...BASE_SIGNALS.requestWords, ...(region.requestWords ?? [])],

    shortenerDomains: BASE_SIGNALS.shortenerDomains,
    suspiciousTlds: BASE_SIGNALS.suspiciousTlds,
    ipfsGateways: BASE_SIGNALS.ipfsGateways,
    suspiciousHosting: BASE_SIGNALS.suspiciousHosting,
    hostingScores: BASE_SIGNALS.hostingScores,

    fakeInvestmentPlatforms: [
      ...BASE_SIGNALS.fakeInvestmentPlatforms,
      ...(region.fakeInvestmentPlatforms ?? []),
    ],
    callbackBrands: [...BASE_SIGNALS.callbackBrands, ...(region.callbackBrands ?? [])],

    authorityMentions: region.authorityMentions,
    noLinkSenders: region.noLinkSenders,
    noLinkSendersFlag: region.noLinkSendersFlag,
    foreignAuthorityMentions: region.foreignAuthorityMentions,
    foreignAuthorityFlag: region.foreignAuthorityFlag,
    identityRereg: region.identityRereg,
    identityReregFlag: region.identityReregFlag,
    fakeInvestmentPlatformFlag: region.fakeInvestmentPlatformFlag,
    legitDomains: region.legitDomains,
  };
}

// Packs are immutable data, so resolution is memoised per region code.
const PACK_CACHE = new Map<RegionCode, RegionPack>();

/**
 * Resolve a region pack by code, falling back to DEFAULT_REGION for anything
 * unrecognised. Never throws — an unknown region must degrade to a working
 * checker, not break the check.
 */
export function resolveRegionPack(code?: string | null): RegionPack {
  const key = (code ?? "").toUpperCase();
  const region = (key in REGIONS ? (key as RegionCode) : DEFAULT_REGION);

  let pack = PACK_CACHE.get(region);
  if (!pack) {
    pack = buildPack(REGIONS[region]);
    PACK_CACHE.set(region, pack);
  }
  return pack;
}

/** Region codes with a pack available. */
export function supportedRegions(): RegionCode[] {
  return Object.keys(REGIONS) as RegionCode[];
}
