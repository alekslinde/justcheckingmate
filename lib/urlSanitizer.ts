// URL sanitization for safe handling of untrusted/suspicious links.
//
// Three concerns:
//   1. Display safety  — never render a live clickable link; defang instead
//   2. Analysis safety — normalise to close bypass tricks before pattern matching
//   3. Storage safety  — strip tracking params that could fingerprint the reporter

// ── Tracking parameters to strip before storage ──────────────────────────────
// Keeping these would let the scammer know which of their campaigns got reported
// and which tracking pixel fired.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "utm_id", "utm_creative_format", "utm_marketing_tactic",
  "fbclid", "gclid", "msclkid", "dclid", "gbraid", "wbraid",
  "twclid", "igshid", "ttclid", "li_fat_id",
  "mc_cid", "mc_eid",                              // Mailchimp
  "ref", "referral", "source", "src",              // Generic referral trackers
  "affiliate", "aff", "partner",
  "click_id", "clickid",
  "zanpid", "s_kwcid",                             // Amazon / Adobe
]);

// ── Defanging ─────────────────────────────────────────────────────────────────
// Standard infosec convention for displaying malicious URLs safely.
// Replaces protocol and dots so the string looks like a URL but isn't clickable
// and won't be treated as a hyperlink by email clients or chat apps.
//
// https://malicious.tk/phish → hxxps://malicious[.]tk/phish
export function defang(url: string): string {
  return url
    .replace(/^https?/i, (p) => p.replace(/t/i, "x").replace(/T/, "X"))
    .replace(/^ftp/i, "fxp")
    .replace(/\./g, "[.]");
}

// ── Strip tracking parameters ────────────────────────────────────────────────
// Returns the URL with all known tracking/analytics query params removed.
// Falls back to the original string if parsing fails.
export function stripTrackingParams(raw: string): string {
  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;
  try {
    const u = new URL(input);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    // Preserve the original protocol if the input didn't have one
    const result = u.toString();
    return raw.trim().startsWith("http") ? result : result.replace(/^https?:\/\//, "");
  } catch {
    return raw;
  }
}

// ── Normalise for analysis ────────────────────────────────────────────────────
// Closes common evasion tricks before pattern matching:
//   - Lowercase hostname (checkers are case-insensitive but lists are lowercase)
//   - Decode percent-encoding in the host (e.g. %61to.gov.au → ato.gov.au)
//   - Collapse repeated slashes in the path
export function normaliseForAnalysis(raw: string): string {
  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;
  try {
    const u = new URL(input);
    u.hostname = decodeURIComponent(u.hostname).toLowerCase();
    u.pathname = u.pathname.replace(/\/+/g, "/");
    return u.toString();
  } catch {
    return raw.toLowerCase();
  }
}

// ── Safe display string ───────────────────────────────────────────────────────
// Strips tracking params then defangs. Use this whenever a URL is shown in the UI.
export function safeDisplayUrl(raw: string): string {
  return defang(stripTrackingParams(raw));
}

// ── Defang URLs embedded in free text ────────────────────────────────────────
// Finds all http/https URLs in a block of text and applies safeDisplayUrl to each.
export function defangText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'>]+/gi, (u) => safeDisplayUrl(u));
}

// ── Defang email addresses ────────────────────────────────────────────────────
// user@domain.com → user[@]domain[.]com
export function defangEmail(email: string): string {
  return email.replace("@", "[@]").replace(/\./g, "[.]");
}

// ── Defang phone numbers ──────────────────────────────────────────────────────
// Inserts zero-width joiners (U+2060) between consecutive digit pairs so
// browsers and OS text-detection don't auto-link the number as a tel: URI,
// while keeping the display visually identical to the original.
export function defangPhone(phone: string): string {
  return phone.replace(/(\d)(?=\d)/g, "$1⁠");
}

// ── Extract scam identifiers from free text ───────────────────────────────────
// Pulls out the first URL, the first email address, and (only if the entire
// trimmed string is a phone number) the phone number.  Intentionally conservative
// — in-text phone extraction produces too many false positives.
export function extractIdentifiers(text: string): { scamUrl: string; scamEmail: string; scamPhone: string } {
  const t = text.trim();
  const urlMatch   = t.match(/https?:\/\/[^\s<>"']+/i);
  const emailMatch = t.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/);
  const isPhone    = /^[\+\d][\d\s\-().]{5,25}[\d]$/.test(t);
  return {
    scamUrl:   urlMatch   ? urlMatch[0].replace(/[.,;:!?)]+$/, "") : "",
    scamEmail: emailMatch ? emailMatch[0] : "",
    scamPhone: isPhone    ? t : "",
  };
}
