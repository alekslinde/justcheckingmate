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

export function locationFromHeaders(headers: Headers): string {
  const country = (headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return "";

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
