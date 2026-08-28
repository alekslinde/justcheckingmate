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
    // http → hxxp, https → hxxps. Both t's, which is the actual convention —
    // this replaced only the first, emitting the non-standard "hxtps://".
    // Case is preserved per character so "HTTPS" defangs to "HXXPS".
    .replace(/^https?/i, (p) =>
      p.replace(/t/gi, (t) => (t === "T" ? "X" : "x")),
    )
    .replace(/^ftp/i, "fxp")
    .replace(/\./g, "[.]");
}

// ── Refanging ─────────────────────────────────────────────────────────────────
// The inverse of defang: turn a neutralised URL back into a parseable one for
// ANALYSIS ONLY. Nothing here makes a request — the result is scored as a
// string, exactly like any other input.
//
// Why this is needed: defanging is how security-aware people share suspicious
// links without making them clickable, so "hxxp://evil[.]tk" is a completely
// ordinary thing for someone to paste. Before this, none of those forms were
// recognised as URLs at all — they fell through to generic message analysis and
// scored 0, meaning the users most careful about handling a scam link got the
// least protection. Our own defang() output had the same problem: a verdict
// copied out of the UI and pasted back in returned nothing.
//
// Conventions handled (all seen in the wild, and all case-insensitive):
//   hxxp:// hxxps:// hxtp:// h**p:// fxp://   → http:// https:// ftp://
//   [.]  (.)  {.}  [dot]  (dot)  {dot}          → .
//   [:]  [://]                                  → : ://
//   [@]                                         → @
// Not anchored: a defanged link is usually pasted inside a sentence ("someone
// sent me hxxps://evil[.]tk — is it real?"), so anchoring to the start of the
// string would leave the common case unrefanged.
const REFANG_SCHEME = /\bh(?:xx|xt|\*\*)(ps?|tps?)?:\/\//gi;
const REFANG_FTP = /\bfxp:\/\//gi;

export function refang(text: string): string {
  return text
    // Scheme first, so a mangled scheme does not survive dot-replacement.
    .replace(REFANG_SCHEME, (m) => (/s/i.test(m) ? "https://" : "http://"))
    .replace(REFANG_FTP, "ftp://")
    // Bracketed separators. The spaced "dot" form needs its own pass because
    // the surrounding whitespace is part of the obfuscation.
    .replace(/\s*[[({]\s*(?:\.|dot)\s*[\])}]\s*/gi, ".")
    // Deliberately NOT handling the unbracketed " dot " form: it rewrites
    // ordinary English ("I dot my i" → "I.my i"). Bracketed forms are
    // unambiguous obfuscation; a bare "dot" between words is usually a word.
    .replace(/\s*[[({]\s*:\s*\/\s*\/\s*[\])}]\s*/g, "://")
    .replace(/\s*[[({]\s*:\s*[\])}]\s*/g, ":")
    .replace(/\s*[[({]\s*(?:@|at)\s*[\])}]\s*/gi, "@");
}

/**
 * Whether refanging changed anything — i.e. the input was defanged.
 *
 * Callers use this to decide whether to re-run extraction on the refanged text,
 * so ordinary input costs nothing.
 */
export function isDefanged(text: string): boolean {
  return refang(text) !== text;
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
