// Coarse submission location, derived from the platform's geo headers
// (set by Vercel's edge from the connecting IP). The IP itself is used only
// transiently for rate limiting and is NEVER stored — this string is the only
// location data that reaches the database.
//
// Granularity is deliberately coarse:
//   · Australia  → state/territory ("NSW, Australia")
//   · elsewhere  → country only    ("United Kingdom")
// City-level data is available in the headers but intentionally unused — a
// small town plus a scam report could identify the reporter.

const AU_REGIONS = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);

/**
 * ISO 3166-1 alpha-2 country code from the platform geo headers, or "" when
 * absent or malformed.
 *
 * Separate from locationFromHeaders: this feeds region-pack selection, which
 * needs a machine-readable code, while locationFromHeaders produces the coarse
 * human-readable string that gets stored. Callers must treat "" as "unknown"
 * and fall back to the default region — geo headers are absent in local dev and
 * behind some privacy proxies.
 */
export function countryFromHeaders(headers: Headers): string {
  const country = (headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : "";
}

export function locationFromHeaders(headers: Headers): string {
  const country = countryFromHeaders(headers);
  if (!country) return "";

  if (country === "AU") {
    const region = (headers.get("x-vercel-ip-country-region") ?? "").toUpperCase();
    return AU_REGIONS.has(region) ? `${region}, Australia` : "Australia";
  }

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

/**
 * Client IP from the platform's forwarding header, or "unknown" when absent or
 * malformed. Used ONLY as a transient rate-limiting key — never stored, and
 * never written to the database (see the note at the top of this file).
 *
 * `x-forwarded-for` can carry a comma-separated chain; the first entry is the
 * originating client. Values that don't look like an IPv4 or IPv6 address are
 * treated as "unknown" rather than trusted, so a spoofed header degrades to
 * sharing one bucket instead of forging a fresh one per request.
 *
 * Takes Headers rather than NextRequest so this stays framework-free and
 * usable from any route handler or worker.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const ip = fwd.split(",")[0].trim();
    if (/^[\d.]+$/.test(ip) || /^[a-f0-9:]+$/i.test(ip)) return ip;
  }
  return "unknown";
}
