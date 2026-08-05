// Region resolution for incoming requests.
//
// Precedence, highest first:
//   1. Explicit choice in the request body — the user told us where they are.
//   2. Platform geo header — a coarse guess from the connecting IP.
//   3. DEFAULT_REGION — geo headers are absent in local dev and behind some
//      privacy proxies, so this is a normal path, not an error case.
//
// The IP itself is never read here; countryFromHeaders only exposes the
// two-letter country code the edge already derived.

import { countryFromHeaders } from "@/lib/geo";
import { resolveRegionPack, DEFAULT_REGION, type RegionCode } from "@/lib/regions";

export function resolveRegion(headers: Headers, requested?: unknown): RegionCode {
  // A request may carry an unsupported or junk region; resolveRegionPack
  // narrows it and falls back rather than throwing, so the pack's own code is
  // the source of truth for what we actually resolved to.
  if (typeof requested === "string" && requested.trim()) {
    const pack = resolveRegionPack(requested);
    // Only honour an explicit choice we actually support — otherwise fall
    // through to geo rather than silently pinning the user to the default.
    if (pack.code === requested.trim().toUpperCase()) return pack.code;
  }

  const geo = countryFromHeaders(headers);
  if (geo) return resolveRegionPack(geo).code;

  return DEFAULT_REGION;
}
