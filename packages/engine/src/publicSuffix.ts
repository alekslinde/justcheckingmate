// Public Suffix List lookup — which part of a hostname a registrant owns.
//
// The question this answers is "what is the registrable domain", and it is the
// hinge of the typosquat rule: "barclays.co.uk" is Barclays' own site, while
// "barclays-secure.co.uk" is a squat, and the two are distinguished entirely by
// whether the brand IS the registrable label or merely appears inside it.
//
// This replaces a hand-maintained set of two-part suffixes. That list was
// explicitly "scoped to the ccTLDs the packs actually cover", which stopped
// being true the moment a region shipped outside it: with SG live at `minimal`,
// "barclays.com.sg" computed its registrable label as "com", missed the
// brand-owns-the-label exemption, and scored 55/likely_scam — a false positive
// on a real bank's own site, and on the exact axis the project cares most about
// getting right.
//
// The list is generated and committed (see scripts/generate-psl.mjs); nothing
// here touches the network.

import { PSL_RULES, PSL_WILDCARDS, PSL_EXCEPTIONS } from "./publicSuffixList";

/**
 * The public suffix of a hostname — the part no single registrant controls.
 *
 * Implements the publicsuffix.org matching algorithm, in its stated priority
 * order:
 *
 *   1. An exception rule wins outright, and yields the suffix MINUS its first
 *      label. "!city.kawasaki.jp" means city.kawasaki.jp is registrable, so the
 *      suffix there is "kawasaki.jp".
 *   2. Otherwise the longest matching rule wins — "nsw.edu.au" beats "edu.au"
 *      beats "au".
 *   3. A wildcard rule matches any single label in that position.
 *   4. With no rule at all, the suffix is the final label. That is the PSL's
 *      own default for unknown TLDs, and it is also what the previous
 *      hand-written implementation assumed whenever its list missed.
 *
 * Only multi-label rules are carried (see the generator), so the single-label
 * case falls out of rule 4 rather than needing ~1,500 entries to restate it.
 */
export function publicSuffix(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.+$/, "").split(".");
  if (labels.length <= 1) return labels.join(".");

  // Rule 1. Checked first and independently: an exception must beat a longer
  // wildcard match, so it cannot be folded into the length loop below.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    if (PSL_EXCEPTIONS.has(candidate)) {
      return labels.slice(i + 1).join(".");
    }
  }

  // Rules 2 and 3. Walk from the longest candidate to the shortest and take the
  // first hit, which is the longest match by construction.
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (PSL_RULES.has(candidate)) return candidate;

    // A wildcard "*.ck" is stored as "ck": it matches when the candidate's
    // PARENT is the stored value and the candidate has exactly one more label.
    const parent = labels.slice(i + 1).join(".");
    if (parent && PSL_WILDCARDS.has(parent)) return candidate;
  }

  // Rule 4.
  return labels[labels.length - 1] ?? "";
}

/**
 * The registrable domain — the public suffix plus the one label to its left.
 *
 * "www.barclays.co.uk" → "barclays.co.uk"; "evil.top" → "evil.top". Returns ""
 * when the hostname is nothing but a public suffix ("co.uk" alone), since there
 * is no registrant to name.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  const suffix = publicSuffix(host);
  if (host === suffix) return "";

  const suffixLabels = suffix ? suffix.split(".").length : 0;
  const labels = host.split(".");
  if (labels.length <= suffixLabels) return "";
  return labels.slice(labels.length - suffixLabels - 1).join(".");
}

/**
 * The registrable LABEL — the name a registrant actually chose.
 *
 * "www.barclays.co.uk" → "barclays"; "barclays-secure.co.uk" →
 * "barclays-secure"; "login.barclays.com.evil.top" → "evil". This is what the
 * typosquat rule compares a brand against: a brand that IS this label owns the
 * site, and a brand that merely appears elsewhere in the hostname is squatting.
 */
export function registrableLabel(hostname: string): string {
  const domain = registrableDomain(hostname);
  return domain ? domain.split(".")[0] ?? "" : "";
}
