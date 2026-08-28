import { parseEmailHeaders, analyseEmailIdentities, domainOf } from "@/lib/emailHeaders";
import { extractIdentifiers, normaliseForAnalysis, defang } from "@/lib/urlSanitizer";
import { detectType } from "@/lib/detectType";
import { analysePhone, PhoneIntel } from "@/lib/phoneIntel";
import { isShortened, expandUrl } from "@/lib/urlExpander";
import { resolveRegionPack, DEFAULT_REGION, type RegionInput, type RegionCoverage } from "@/lib/regions";
import { KEYS_BY_POST_PHRASES } from "@/lib/regions/base";
import type { CheckResult } from "@/lib/engineTypes";

// ScamType and CheckResult live in engineTypes.ts to break the import cycle
// with detectType (see the note there). Re-exported here so every existing
// consumer keeps importing them from the scorer.
export type { ScamType, CheckResult } from "@/lib/engineTypes";
export type { PhoneIntel };

// ────────────────────────────────────────────────────────────────────────────
// Signal lists
// ────────────────────────────────────────────────────────────────────────────
//
// Signals live in region packs (lib/regions/), not here. The scoring logic below
// is shared by every region; only the data it matches against changes.
//
// Every checker takes an optional region code and resolves its pack per call.
// Resolution is memoised and falls back to DEFAULT_REGION for anything
// unrecognised, so omitting the argument preserves the original AU behaviour.

/**
 * Substring match, but with word boundaries for short entries.
 *
 * Agency lists (`authorityMentions`, `noLinkSenders`, `foreignAuthorityMentions`)
 * are plain string arrays rather than a BrandSet, so they have no explicit
 * substring/word split — and national agency acronyms are overwhelmingly three
 * letters. Plain `includes()` therefore fires inside ordinary English, which is
 * not a theoretical risk: it was found flagging "your account is fine" as
 * government impersonation (NZ "acc" ⊂ "account") and would have read "message"
 * as the SSA, "security" as the SEC, and "weird"/"third" as the IRD.
 *
 * Entries of 3 characters or fewer are matched on \b boundaries — the same rule
 * BrandSet's `word` list uses, applied automatically so a pack author can't
 * forget it. Longer entries keep substring matching, which is what lets
 * "hmrc"/"medicare" match inside punctuation and compounds as before.
 *
 * The threshold is length-based rather than a curated list because the failure
 * mode is mechanical: any short token collides eventually, and a new pack should
 * inherit the protection without anyone remembering to opt in.
 */
const WORD_MATCH_MAX_LEN = 3;
function mentions(text: string, entry: string): boolean {
  const needle = entry.toLowerCase();
  if (needle.length > WORD_MATCH_MAX_LEN) return text.includes(needle);
  return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function mentionsAny(text: string, entries: string[]): boolean {
  return entries.some((entry) => mentions(text, entry));
}

const MAC_CLICKFIX_FLAG =
  "'Open Terminal and paste this' instruction detected — this is the macOS ClickFix variant: a fake CAPTCHA or 'browser fix' overlay talks you into running the attacker's command yourself, usually via Spotlight and Terminal. No legitimate site or verification step ever asks for this.";

/**
 * ClickFix macOS variant (D3 / #143 / ACSC ASC-2026-0809, 9 Aug 2026).
 *
 * The Windows path keys off "press Win+R", which nothing legitimate says. The
 * macOS equivalent has no such luxury: "open Terminal" and `curl … | bash` are
 * ordinary developer-documentation phrases, so matching either alone would flag
 * every install guide on the internet.
 *
 * So each branch needs two halves — the *delivery* cue (Spotlight/Terminal, or a
 * piped shell command) and the *clipboard* cue (a paste instruction, or the
 * fake-CAPTCHA framing that makes it social engineering). An install guide says
 * "run this in Terminal" and stops; the lure says "press Cmd+Space, open
 * Terminal, paste".
 *
 * Note the grouping: an unguarded `curl \| bash` alternative would fire on any
 * README, which is exactly the false positive the issue asked to avoid.
 *
 * Both cue halves are deliberately narrower than they first appear, because a
 * loose half defeats the two-half design — code review found each firing on its
 * own:
 *   - bare "copy" matched "open Terminal and copy the output into this ticket",
 *     which is content moving *out* of the shell, the opposite direction;
 *   - bare "spotlight" is an ordinary noun, so scam-awareness copy ("puts the
 *     spotlight on scam trends… copy the link") self-triggered the flag — this
 *     app publishes exactly that kind of writing.
 */
function isMacClickFix(text: string): boolean {
  const delivery =
    /\b(?:open|launch|start)\s+(?:the\s+)?terminal\b/i.test(text) ||
    /\b(?:cmd|command)\s*\+\s*space\b/i.test(text) ||
    // "spotlight" is an ordinary English noun ("puts the spotlight on scam
    // trends"), so it only counts as a delivery cue when used as the macOS
    // launcher — opening it, or searching in it.
    /\b(?:open|launch|press|hit|use|via)\s+(?:the\s+)?spotlight\b/i.test(text) ||
    /\bspotlight\s+(?:search|and\s+type|then\s+type)\b/i.test(text);
  const shellPipe = /\bcurl\b[^\n]{0,120}\|\s*(?:sudo\s+)?(?:ba|z|)sh\b/i.test(text);
  // Paste only — not bare "copy". The attack direction is content moving *into*
  // the user's shell; "copy the output into this ticket" is the opposite, and
  // matching it flagged a legitimate support instruction as likely_scam.
  // "copy" is still matched where it's explicitly paired with pasting.
  const clipboard =
    /\b(?:paste|pbpaste|ctrl\s*\+\s*v|cmd\s*\+\s*v|command\s*\+\s*v)\b/i.test(text) ||
    /\bcopy\b[^\n]{0,40}\b(?:paste|run|execute|enter|terminal)\b/i.test(text);
  // The fake-verification framing is itself a co-signal: it's what separates a
  // malicious paste instruction from a legitimate one.
  const captchaFraming =
    /\b(?:captcha|human verification|browser\s+(?:fix|repair|error))\b/i.test(text) ||
    // "…not a robot" / "…you are human", with any leading verb — the campaigns
    // vary it freely ("I'm not a robot", "confirm you are not a robot",
    // "verify you're human", "prove you are human").
    /\b(?:i'?m|i am|you'?re|you are)\s+(?:not\s+a\s+robot|(?:a\s+)?human)\b/i.test(text) ||
    /\b(?:confirm|verify|prove|check)\s+(?:that\s+)?(?:you'?re|you are|i'?m|i am)\s+(?:not\s+a\s+robot|(?:a\s+)?human)\b/i.test(text);

  return (delivery && (clipboard || captchaFraming)) ||
    (shellPipe && (clipboard || captchaFraming));
}

/** Entries matched, for the compounds that score on how many distinct hits. */
function mentionsCount(text: string, entries: string[]): number {
  return entries.filter((entry) => mentions(text, entry)).length;
}

/**
 * Genuine two-part public suffixes, for working out a hostname's registrable
 * label (see checkUrl's typosquat block).
 *
 * Enumerated rather than derived from a marker label. The rule this replaced
 * asked only "is the penultimate label one of co/com/gov/org/…?", which is true
 * for `chase.gov.co` and `kiwibank.co.io` — but `.co` and `.io` are ordinary
 * gTLDs, so there the last two labels are the registrable domain, not a suffix.
 * Reading them as a suffix made the brand own the registrable label, which
 * silently exempted it from typosquat scoring in every region at once.
 *
 * Scoped to the ccTLDs the packs actually cover. A miss degrades safely: the
 * hostname is simply treated as `<label>.<tld>`, which at worst flags a genuine
 * site under an unlisted two-part suffix — the conservative direction for a
 * scam detector, and the same trade-off the legitDomains allowlist already makes.
 */
const TWO_PART_SUFFIXES = new Set([
  // United Kingdom
  "co.uk", "org.uk", "ac.uk", "gov.uk", "nhs.uk", "police.uk", "mod.uk",
  "sch.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
  // Australia
  "com.au", "net.au", "org.au", "gov.au", "edu.au", "asn.au", "id.au",
  // New Zealand
  "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz", "mil.nz", "school.nz",
  // Ireland
  "gov.ie", "co.ie",
  // Canada
  "gc.ca",
  // United States — state and municipal government convention
  "gov.us", "state.us",
]);

// ────────────────────────────────────────────────────────────────────────────
// URL checker
// ────────────────────────────────────────────────────────────────────────────

export function checkUrl(raw: string, blocklist?: Set<string>, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    shortenerDomains: SCAM_DOMAINS,
    suspiciousTlds: SUSPICIOUS_TLDS,
    ipfsGateways: IPFS_GATEWAYS,
    suspiciousHosting: SUSPICIOUS_HOSTING,
    hostingScores: HOSTING_SCORES,
    legitDomains: LEGIT_AU_DOMAINS,
    typosquatBrands: TYPOSQUAT_BRANDS,
  } = PACK;
  const flags: string[] = [];
  let score = 0;
  let urlObj: URL | null = null;

  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;

  try {
    urlObj = new URL(input);
  } catch {
    // A positive detection, so coverage doesn't gate it — but carry the value
    // through so consumers can still see which pack ran.
    return {
      verdict: "suspicious",
      score: 60,
      flags: ["Couldn't parse this as a valid URL — dodgy already"],
      details: "The link format looks off. Legit sites don't usually send malformed URLs.",
      coverage: PACK.coverage,
    };
  }

  const hostname = urlObj.hostname.toLowerCase();
  const fullUrl = input.toLowerCase();

  // Known-legitimate domains for this region — strong positive signal. Routed
  // through the coverage gate because the allowlist is itself regional: under
  // partial coverage the list is thin, so a miss here means "not on our short
  // list", not "not legitimate".
  if (LEGIT_AU_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
    return downgradeForCoverage(
      {
        verdict: "safe",
        score: 5,
        flags: [PACK.legitDomainFlag],
        details: PACK.legitDomainDetails,
        coverage: PACK.coverage,
      },
      PACK.coverage,
    );
  }

  // URLhaus live blocklist — hostname confirmed malicious by abuse.ch reporters
  if (blocklist?.has(hostname)) {
    flags.push("This domain is on the URLhaus live malware/phishing blocklist — reported by security researchers as actively malicious");
    score += 70;
  }

  // Known URL shorteners
  if (SCAM_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
    flags.push("URL shortener detected — hides the real destination");
    score += 40;
  }

  // Suspicious TLDs
  const tldMatch = SUSPICIOUS_TLDS.find((t) => hostname.endsWith(t));
  if (tldMatch) {
    flags.push(`Dodgy top-level domain (${tldMatch}) — commonly used by scammers`);
    score += 30;
  }

  // IP address instead of domain
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    flags.push("IP address used instead of a domain name");
    score += 35;
  }

  // IPFS-hosted content (D9 / #56). Decentralised hosting that can't be taken
  // down — increasingly used for phishing. Match known public gateways by
  // hostname OR any host serving the /ipfs/<CID> path convention.
  if (IPFS_GATEWAYS.has(hostname) || /\/ipfs\/[A-Za-z0-9]{20,}/.test(urlObj.pathname)) {
    flags.push("IPFS-hosted content — stored on a decentralised network that can't be taken down; increasingly used to host phishing pages");
    score += 40;
  }

  // Free-tier cloud dev platforms abused as phishing hosting (D1/D2 / #63).
  // These inherit a "trusted" reputation from the parent platform, so URL
  // filters wave them through. Match on the registrable suffix only.
  const hostingMatch = SUSPICIOUS_HOSTING.find((h) => hostname === h || hostname.endsWith("." + h));
  if (hostingMatch) {
    flags.push(`Hosted on ${hostingMatch} — a free developer platform frequently abused to host phishing pages because it inherits a trusted reputation`);
    score += HOSTING_SCORES[hostingMatch] ?? 35;
  }

  // Trusted-service redirect abuse (D16 / roadmap). A legitimate host whose
  // query string carries a full second URL is a classic open-redirect cloak.
  // Kept to a low score because legitimate tracking links do this too.
  const REDIRECT_HOSTS = ["lnkd.in", "cdn.ampproject.org"];
  const carriesNestedUrl = /[?&](url|u|redirect|dest|destination|target|continue|next)=https?(:|%3a)/i.test(urlObj.search);
  if (REDIRECT_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h)) ||
      hostname.endsWith("linkedin.com") && urlObj.pathname.includes("/slink") ||
      carriesNestedUrl) {
    flags.push("Trusted service used as a redirect — the real destination is hidden in the link and may be malicious");
    score += 15;
  }

  // Typosquatted brands for this region. Which brands get impersonated is the
  // most region-specific signal we have, so the lists come from the pack.
  //
  // Two exemptions, and the distinction matters:
  //
  //  1. Eligibility-restricted suffixes (`.gov.au`, `.gov.uk`, `.nhs.uk`) —
  //     the registry vets who may register, so a brand name is genuine.
  //     Deliberately NOT `.co.uk` or `.org.uk`: those are open registrations,
  //     and exempting them would whitelist the domains scammers actually buy.
  //  2. The brand *owns the registrable label* — `barclays.co.uk` and
  //     `tesco.com` are the real sites. Typosquats bolt the brand onto
  //     something else (`barclays-secure-verify.co.uk`, `login-tesco.com`), so
  //     the brand appears in the label without being it.
  //
  // Without (2), dropping `.co.uk` from the trusted list flagged 21 of 24 real
  // UK brand sites as likely_scam. Without (1) being narrow, the UK's most
  // common suffix silently disabled brand scoring altogether.
  const onTrustedSuffix = PACK.trustedHostSuffixes.some((s) => hostname.endsWith(s));
  if (!onTrustedSuffix) {
    // The registrable label: the name the brand would own, ignoring subdomains
    // and the public suffix. "www.barclays.co.uk" → "barclays";
    // "barclays-secure.co.uk" → "barclays-secure"; "login.barclays.com.evil.top"
    // → "evil". Two-part suffixes (.co.uk, .com.au) are handled by dropping a
    // second label when the penultimate one is a known second-level marker.
    //
    // The suffix must be a *real* two-part public suffix, matched as a whole —
    // not "any known marker label followed by any TLD". That distinction is
    // load-bearing rather than tidiness.
    //
    // The original rule treated the penultimate label alone as the signal, so
    // `.gov.co`, `.com.co` and `.co.io` were read as two-part suffixes even
    // though `.co` and `.io` are ordinary gTLDs where the last two labels *are*
    // the registrable domain. `chase.gov.co` therefore computed its registrable
    // label as "chase", which tripped the "the brand owns the label, so it's the
    // real site" exemption and suppressed brand scoring entirely.
    //
    // One open-registration domain then defeated the typosquat rule in every
    // pack at once: `commbank.gov.co` (AU), `barclays.gov.co` (GB),
    // `chase.com.co` (US), `kiwibank.co.io` (NZ), `scotiabank.gov.io` (CA) and
    // `anpost.gov.co` (IE) all came back with no brand flag. Listing the
    // suffixes in full closes that while leaving genuine sites untouched.
    const labels = hostname.split(".");
    const lastTwo = labels.slice(-2).join(".");
    let registrableIndex = labels.length - 2;
    if (labels.length >= 3 && TWO_PART_SUFFIXES.has(lastTwo)) {
      registrableIndex = labels.length - 3;
    }
    const registrable = labels[registrableIndex] ?? "";

    // Separator-delimited words within the registrable label, so "agl-billing"
    // yields ["agl","billing"] — that's how a short brand is matched without
    // colliding with "bagelshop".
    const labelWords = registrable.split(/[^a-z0-9]+/i).filter(Boolean);

    for (const brand of TYPOSQUAT_BRANDS.substring) {
      // The brand owning the whole label is the real site, not a squat.
      if (hostname.includes(brand) && registrable !== brand) {
        flags.push(`Looks like it's impersonating "${brand}" — classic phishing move`);
        score += 45;
      }
    }
    for (const brand of TYPOSQUAT_BRANDS.word) {
      if (labelWords.includes(brand) && registrable !== brand) {
        flags.push(`Looks like it's impersonating "${brand}" — classic phishing move`);
        score += 45;
      }
    }
  }

  // Excessive hyphens (scam site hallmark)
  const hyphens = (hostname.match(/-/g) || []).length;
  if (hyphens >= 3) {
    flags.push(`Heaps of hyphens in the domain (${hyphens}) — scammers love this trick`);
    score += 20;
  }

  // HTTP not HTTPS
  if (urlObj.protocol === "http:") {
    flags.push("No HTTPS — your data wouldn't be encrypted");
    score += 15;
  }

  // Very long URL
  if (input.length > 200) {
    flags.push("Suspiciously long URL — often used to hide the real destination");
    score += 15;
  }

  // Weird subdomains depth
  const parts = hostname.split(".");
  if (parts.length > 5) {
    flags.push("Too many subdomain levels — used to make fake URLs look legit");
    score += 20;
  }

  // Legit-looking patterns but suspicious
  if (fullUrl.includes("login") || fullUrl.includes("signin") || fullUrl.includes("verify") || fullUrl.includes("secure")) {
    flags.push("Contains login/verify/secure keywords — common in phishing URLs");
    score += 10;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "URL", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// SMS checker
// ────────────────────────────────────────────────────────────────────────────

export function checkSms(text: string, blocklist?: Set<string>, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    urgencyWords: URGENCY_WORDS,
    rewardWords: REWARD_WORDS,
    requestWords: REQUEST_WORDS,
    fakeInvestmentPlatforms: FAKE_INVESTMENT_PLATFORMS,
    identityRereg: MYID_REREG_PHRASES,
    brandMentions: BRAND_MENTIONS,
    bankIdentifiers: BANK_IDENTIFIERS,
  } = PACK;
  const CRYPTO_TOAD_BRANDS = PACK.cryptoExchanges;
  const flags: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();

  const urgencyHits = URGENCY_WORDS.filter((w) => lower.includes(w));
  if (urgencyHits.length > 0) {
    flags.push(`Urgency language detected: "${urgencyHits.slice(0, 3).join('", "')}"`);
    score += Math.min(urgencyHits.length * 10, 35);
  }

  const rewardHits = REWARD_WORDS.filter((w) => lower.includes(w));
  if (rewardHits.length > 0) {
    flags.push(`Prize/reward language: "${rewardHits.slice(0, 2).join('", "')}"`);
    score += Math.min(rewardHits.length * 12, 40);
  }

  const requestHits = REQUEST_WORDS.filter((w) => lower.includes(w));
  if (requestHits.length > 0) {
    flags.push(`Asks for sensitive info: "${requestHits.slice(0, 2).join('", "')}"`);
    score += Math.min(requestHits.length * 15, 50);
  }

  // Rental/property bond redirect fraud (D5 / #105). Composite: a rental
  // context plus a bank-detail ask. Neither half scores here on its own —
  // "rental bond" is ordinary tenancy language and "bsb" already sits in
  // REQUEST_WORDS — but together they're the signature of bond redirection.
  //
  // The bank-ask half draws its national identifier from the pack: "bsb" is
  // Australian and means nothing in the UK, where the equivalent ask is a sort
  // code. Hardcoding either would silently drop half the composite in the other
  // region, leaving only the generic phrasings.
  const hasRentalContext = /rental bond|holding deposit|lease agreement|property manager/i.test(text);
  const hasBankAsk = /bank details|account number|account no\b/i.test(text) ||
    BANK_IDENTIFIERS.some((w) => lower.includes(w));
  if (hasRentalContext && hasBankAsk) {
    flags.push("Property bond fraud pattern — scammers intercept rental communications to redirect bond payments. Always verify bank detail changes by calling the agency on a number from their official website, never one in the message.");
    score += 25;
  }

  // Keys-by-post, gated (D3 / #180). On its own this is an ordinary move-in
  // message, so it never scores alone. Alongside a deposit ask it completes the
  // remote-landlord script — no viewing, no handover, money up front — which is
  // the part that makes the scam work. Scored modestly: the deposit phrasing in
  // REQUEST_WORDS already carries the main weight, and this only corroborates.
  const hasDepositAsk = /deposit/i.test(text);
  if (KEYS_BY_POST_PHRASES.some((k) => lower.includes(k)) && (hasDepositAsk || hasBankAsk)) {
    flags.push("Keys promised by post alongside a deposit request — in the fake-landlord script the 'landlord' is always abroad, so there's no viewing and no key handover. Never send a deposit for a property you or someone you trust hasn't physically viewed.");
    score += 15;
  }

  // Payment details presented as *changed* — the core of redirect fraud (D5 /
  // #105 and invoice/BEC fraud generally). Legitimate businesses rarely change
  // payment details mid-relationship and essentially never announce it by SMS.
  //
  // This is scored as its own signal rather than by listing "updated bank
  // details" in requestWords, where it overlapped the plain "bank details"
  // entry and silently double-scored one phrase. The qualifier is a real signal;
  // it just has to be matched as one instead of inflating another. Requires an
  // account-detail noun nearby so "updated your address" doesn't score.
  const changedPaymentDetails =
    /\b(updated?|new|changed|amended|revised)\s+(bank|payment|account|remittance)\s*(details|account|number|info)?/i.test(text) ||
    /\b(bank|payment|account)\s+details\s+have\s+(been\s+)?(updated|changed|amended)/i.test(text);
  if (changedPaymentDetails && hasBankAsk) {
    flags.push("Payment details presented as recently changed — this is the signature of redirect fraud, where a scammer intercepts a real invoice or tenancy thread and substitutes their own account. Confirm any change by phoning the organisation on a number you already had, never one from the message.");
    score += 20;
  }

  // Contains a URL
  const urlMatch = text.match(/https?:\/\/[^\s]+/gi);
  if (urlMatch) {
    flags.push(`Contains link: ${urlMatch[0].slice(0, 50)}...`);
    score += 15;
    // Check the embedded URL too
    const urlCheck = checkUrl(urlMatch[0], blocklist, region);
    if (urlCheck.score > 40) {
      flags.push("...and that link looks dodgy too");
      score += 20;
    }
  }

  // "Reply Y to activate" filter-bypass tactic (D3 / #54). Replying upgrades the
  // sender to a trusted contact on iOS/Android, making inert URL text tappable
  // and bypassing built-in phishing filters. The last clause catches the
  // "copy the link into your browser" variant used to dodge link scanners.
  const replyBypass =
    /reply\s*['"]?\s*[Yy](es)?\b.{0,40}(link|activat|access|proceed|view)/i.test(text) ||
    /type\s+[Yy](es)?\s+to\s+(proceed|activat|access|get\s+the)/i.test(text) ||
    /send\s+[Yy](es)?\s+to\s+(get|receive|access|activat)/i.test(text) ||
    /copy\s+(the\s+|this\s+|that\s+)?(link|url)\s+(into|to)\s+your\s+browser/i.test(text);
  if (replyBypass) {
    flags.push("'Reply Y' trick detected — scammers tell you to reply first so links become tappable, bypassing your phone's spam filters");
    score += 25;
  }

  // QR-code "quishing" prompts (D11 / part of roadmap). The URL hides inside an
  // image, so the prompt language is the only text-side signal.
  if (/scan\s+(the\s+|this\s+)?(qr\s*code|code)\s*(to|and)?/i.test(text) ||
      /\bscan\s+to\s+(verify|update|claim|pay|confirm)/i.test(text) ||
      // PDF-embedded "Scanception" quishing (D7 / #113). Attackers put the QR
      // inside a PDF so email filters can't scan it, then reference it from the
      // body. The inverted phrasing ("the attachment contains a QR code") has no
      // "scan the QR code" verb phrase for the patterns above to latch onto —
      // the scan instruction comes later as a bare pronoun ("scan it") or is
      // left implicit. Requires the attachment noun and the QR mention in the
      // same clause, so a legitimate "the QR code on the attached flyer" stays
      // clean. Reuses the flag and +20 score — the existing wording already
      // describes this variant correctly.
      /\b(?:attachment|attached|(?:attached\s+)?(?:pdf|file|document|invoice))\s+(?:\w+\s+){0,2}?(?:contains?|includes?|has)\s+(?:a\s+|the\s+)?qr\s*code\b/i.test(text)) {
    flags.push("QR code scan prompt — 'quishing' attacks hide malicious URLs inside QR images to dodge link scanners");
    score += 20;
  }

  // Fake voicemail notification lures (D5 / #122). Flubot-era smishing
  // (Scamwatch has a dedicated page) and the ongoing UpCrypter campaign both
  // use "you have a new voicemail" to get a click — the payload is malware or
  // a fake Microsoft 365 / Google Workspace credential page. Real voicemail
  // services deliver audio or a transcript inline, or link into the
  // authenticated app; they don't send a bare click-through in a separate SMS.
  //
  // Anchored on the *notification* shape rather than the bare word, so ordinary
  // conversational use ("I left you a voicemail", "your voicemail box is full")
  // stays clean. Scored +20 to match the QR-quishing prompt above: both are
  // click-lures that need a URL, brand or urgency signal to escalate.
  if (/you\s+have\s+(?:a|an|\d+|one|two|three)?\s*(?:new|unheard|missed|pending|urgent)?\s*voicemail/i.test(text) ||
      /\d+\s+(?:new\s+|unheard\s+|pending\s+)?voicemail/i.test(text) ||
      /listen\s+(?:to\s+)?(?:your\s+)?(?:new\s+)?voicemail/i.test(text) ||
      /voicemail\s+(?:notification|alert|waiting|received|pending)/i.test(text) ||
      /missed\s+call\s+(?:notification|alert)[\s\S]{0,30}(?:click|tap|visit|listen)/i.test(text)) {
    flags.push("Fake voicemail notification — scammers send fake 'you have a new voicemail' messages to trick you into clicking a malicious link. Legitimate voicemail services never deliver audio via a separate SMS link.");
    score += 20;
  }

  // ClickFix "run a command" social engineering (D3 / #74 / ACSC advisory May
  // 2026). A fake CAPTCHA overlay tells the user to press Win+R and paste a
  // PowerShell command, running malware themselves. No legitimate entity asks
  // this, so the fuzzy match scores near-certain.
  if (/press\s+(win|windows)\s*\+?\s*r\b/i.test(text) ||
      /powershell\s+-[ec]/i.test(text)) {
    flags.push("'Press Win+R' instruction detected — this is ClickFix social engineering: scammers trick you into running malware on your own computer disguised as a 'human verification' step");
    score += 50;
  } else if (isMacClickFix(text)) {
    flags.push(MAC_CLICKFIX_FLAG);
    score += 50;
  }

  // ACMA SMS Sender ID "Unverified" label override language (D7 / #78 / post-1
  // July 2026). Since the register went live, unregistered senders show as
  // "Unverified"; scammers pre-emptively explain the label away. No legitimate
  // registered sender ever needs to — the language is self-identifying.
  const unverifiedOverride =
    /may\s+appear\s+(as\s+)?unverified/i.test(text) ||
    /displayed?\s+as\s+unverified/i.test(text) ||
    /ignore\s+(the\s+)?['"]?unverified['"]?/i.test(text) ||
    /carrier\s+(has\s+not|hasn'?t)\s+updated\s+our\s+(registration|sender)/i.test(text) ||
    /unverified\s+(label|tag|display)\s+is\s+a\s+(carrier\s+)?(error|delay|bug)/i.test(text);
  // Only scored where the region actually runs a sender-ID registration
  // scheme — asserting foreign regulation to users elsewhere would be false.
  if (unverifiedOverride && PACK.senderIdFlag) {
    flags.push(PACK.senderIdFlag);
    score += 35;
  }

  // Fake task/job recruitment funnel for pig-butchering (D13 / #51). Composite:
  // require ≥2 distinct signals so legitimate job ads (which may use one of these
  // phrases) don't trip on their own.
  const jobSignals = [
    /\brate\s+products\b/i, /\bsimple\s+tasks?\b/i, /\bearn\s+\$?\d+/i,
    /\bno\s+experience\s+required\b/i, /\bonline\s+tasks?\b/i,
    // "work from home" (with or without a "flexible" qualifier) is one concept,
    // counted once — the qualifier must not let the same phrase score twice.
    /\bwork\s+from\s+home\b/i,
  ].filter((re) => re.test(text)).length;
  if (jobSignals >= 2) {
    flags.push("Task/job recruitment pattern — a common funnel into 'pig-butchering' investment scams; real employers don't recruit this way");
    score += 25;
  }

  // WhatsApp/Telegram investment-group pig-butchering funnel (D5 / #76 / ASIC
  // 26-063MR). Distinct from jobSignals: this targets the investing aspiration,
  // not the side-gig one. Require ≥2 signals, or 1 signal plus a crypto term, so
  // legitimate mentions of investment communities don't trip it on their own.
  const investmentGroupSignals = [
    /join\s+(our|the)\s+(trading|stock|investment|crypto)\s+group/i,
    /exclusive\s+(stock|trading|investment)\s+tips?/i,
    /(vip|private)\s+(trading|investment|stock)\s+(signal|group|channel)/i,
    /trading\s+signals?\s+(group|channel|community)/i,
    /we\s+(made|returned|earned)\s+\$?\d+.*\b(from\s+)?(tips?|trading)/i,
    /i'?ll?\s+add\s+you\s+(to\s+(our|the)\s+)?(whatsapp|telegram|signal)/i,
  ].filter((re) => re.test(text)).length;
  const hasCryptoSignal = ["crypto", "bitcoin", "wallet", "connect wallet", "sign transaction"]
    .some((w) => lower.includes(w));
  if (investmentGroupSignals >= 2 || (investmentGroupSignals >= 1 && hasCryptoSignal)) {
    flags.push("Investment group recruitment pattern — scammers use 'private trading tip' groups as an entry point for pig-butchering investment fraud; real investment groups don't recruit via cold messages");
    score += 30;
  }

  // Sender mentions a gov agency but is a random number
  if (mentionsAny(lower, PACK.authorityMentions)) {
    flags.push("Claims to be from a government agency — verify directly via official channels");
    score += 25;

    // Senders that have publicly removed links from their unsolicited SMS — a
    // link alongside one of these is a scam. Scoped to the confirmed no-link
    // senders so the flag wording stays accurate (toll operators, by contrast,
    // do use links).
    if (urlMatch && mentionsAny(lower, PACK.noLinkSenders)) {
      flags.push(PACK.noLinkSendersFlag);
      score += 15;
    }
  }

  // Foreign-authority impersonation (D3 / #103 / AFP May 2026). Kept separate
  // from authorityMentions because the reasoning is different and stronger: an
  // authority with no enforcement jurisdiction here demanding payment is a scam
  // signal on its own, rather than a "verify via official channels" prompt.
  // Scored +35 (vs +25).
  if (mentionsAny(lower, PACK.foreignAuthorityMentions)) {
    flags.push(PACK.foreignAuthorityFlag);
    score += 35;
  }

  // Consumer brands impersonated in SMS but not government agencies, so they get
  // their own flag wording. Which brands these are is regional, so the lists
  // come from the pack; the `word` list is matched on boundaries because short
  // names like "agl" would otherwise fire on "bagel" and "flagship".
  const shortBrandHit = BRAND_MENTIONS.word.some((b) =>
    new RegExp(`\\b${b}\\b`, "i").test(lower));

  if (shortBrandHit || BRAND_MENTIONS.substring.some((b) => lower.includes(b))) {
    flags.push("Claims to be from a well-known company — verify by logging in directly through the official app or website, not via any link in this message");
    score += 20;
  }

  // Asks to call back a number
  if (/call\s+(back|now|us|this number)/i.test(text)) {
    flags.push("Asks you to call a number — scammers use this to run up your phone bill or gather info");
    score += 20;
  }

  // Crypto-exchange TOAD composite (D6 / #123). An exchange name plus a phone
  // number to ring and no link is the telephone-oriented attack: the scam runs
  // on the call, where a "support agent" walks the victim through handing over
  // 2FA codes or moving funds to a "safe wallet". Real exchanges never phone
  // customers about account security. Requires an explicit number so ordinary
  // "your CoinSpot deposit cleared" texts stay unflagged.
  //
  // Brands come from the pack's callback list (base crypto names plus the
  // region's own exchanges) rather than a hardcoded AU trio, and the flag names
  // whichever brand actually matched — the old copy asserted "CoinSpot, Swyftx
  // and Binance" to every region.
  const cryptoToadHit = CRYPTO_TOAD_BRANDS.find((b) => lower.includes(b));
  // Region-agnostic, but a *dialable* number only. Three shapes: international
  // `+NN…`, a national trunk-prefixed `0…`, and non-geographic service ranges
  // that carry no trunk prefix (AU 1800/1300/13xx, US/CA 1-8xx). The previous
  // AU-only pattern meant this composite could never fire outside Australia.
  //
  // Deliberately no bare-digit-run alternative. A 10-14 digit sequence with no
  // dialing prefix is far more often an order number, reference or invoice ID —
  // "suspicious login on order 1234567890123, call support" satisfied the phone
  // half with no phone number present at all. The service-number branch is
  // prefix-anchored for the same reason: `1[38]00` and `1-8xx` are real dialing
  // patterns, not any digit string that happens to be long enough.
  const hasPhoneNumber =
    /\+\d{1,3}[\s-]?(?:\d[\s-]?){6,14}\d/.test(text) ||
    /\b0\d(?:[\s-]?\d){7,10}\b/.test(text) ||
    /\b1[\s-]?(?:800|300|3\d{2}|8\d{2})(?:[\s-]?\d){5,8}\b/.test(text) ||
    /\b13[\s-]?\d{2}[\s-]?\d{2}\b/.test(text);
  const mentionsCalling = /\bcall\b|\bphone\b|\bcontact (support|us)\b|\bhelpline\b/i.test(text);
  const hasUrl = /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(text);

  if (cryptoToadHit && hasPhoneNumber && mentionsCalling && !hasUrl) {
    flags.push(`Crypto exchange asking you to phone them — ${cryptoToadHit} and other exchanges never ring customers or ask you to call about account security. The scam happens on the call: they'll talk you through handing over 2FA codes or moving funds to a "safe wallet". Hang up and log in through the official app instead.`);
    score += 30;
  }

  // Grammar/typo signals.
  //
  // Word-boundaried, because these are short tokens matched against free text
  // and the unanchored form fired inside ordinary words: "ur account" matched
  // inside "yo|ur account| settings" and "fo|ur account|s", so every message
  // containing "your account" was flagged for typos it does not have. Same
  // collision class the pack lists guard against in __tests__/packShadowing —
  // a short needle matching inside a longer legitimate word.
  //
  // "pls"/"plz"/"ur" need the boundary most; "recieve"/"reciept" are already
  // unambiguous misspellings but are anchored too, for consistency.
  const typos = text.match(/\brecieve\b|\breciept\b|\bur\s+account\b|\bu\s+have\b|\bpls\b|\bplz\b|\bkindly\b/gi);
  if (typos && typos.length > 0) {
    flags.push("Spelling/grammar patterns common in scam messages");
    score += 10;
  }

  // Named fraudulent investment platforms (D4 / #104). ASIC/Scamwatch have
  // explicitly warned against these exact names — a single match is a
  // high-confidence scam signal with essentially no legitimate use case.
  const platformHit = FAKE_INVESTMENT_PLATFORMS.find((p) => lower.includes(p));
  if (platformHit) {
    flags.push(PACK.fakeInvestmentPlatformFlag(platformHit));
    score += 50;
  }

  // myID forced re-registration phishing (D6 / #106). Dedicated wording rather
  // than a govMentions entry, because these are "digital identity" phrases, not
  // an agency name — the govMentions "claims to be a government agency" flag
  // would read wrong here.
  if (MYID_REREG_PHRASES.some((p) => lower.includes(p))) {
    flags.push(PACK.identityReregFlag);
    score += 25;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "SMS", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Email checker
// ────────────────────────────────────────────────────────────────────────────

export function checkEmail(text: string, blocklist?: Set<string>, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    suspiciousTlds: SUSPICIOUS_TLDS,
    callbackBrands: CALLBACK_BRANDS,
    officialSenderNames: OFFICIAL_SENDER_NAMES,
    trustedHostSuffixes: TRUSTED_HOST_SUFFIXES,
  } = PACK;
  const flags: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();

  // Reuse SMS signals for body content. The region must be forwarded — without
  // it every email check ran the default (AU) signal set regardless of the
  // caller's region, so a UK email was scored against Australian agencies and
  // brands while the URL and SMS checkers correctly used the UK pack.
  const smsCheck = checkSms(text, blocklist, region);
  flags.push(...smsCheck.flags);
  score += Math.floor(smsCheck.score * 0.7); // Email gets a bit more lenience

  // Header-aware sender analysis: parse From / Reply-To / Return-Path and flag
  // display-name masking and From≠Reply-To spoofing.
  const headers = parseEmailHeaders(text);
  if (headers.fromAddress) {
    const senderDomain = domainOf(headers.fromAddress);
    const suspTlds = SUSPICIOUS_TLDS.find((t) => senderDomain.endsWith(t));
    if (suspTlds) {
      flags.push(`Sender email uses a dodgy domain extension (${suspTlds})`);
      score += 30;
    }
    // Impersonation pattern: official name in the body but a mismatched domain.
    // Both the names and the domains that count as matching are regional; a
    // region with no national suffixes skips the rule rather than calling every
    // sender an impersonator.
    const onTrustedSuffix = TRUSTED_HOST_SUFFIXES.some((s) => senderDomain.endsWith(s));
    // Boundary-matched for short entries: every pack's sender list carries
    // three-letter institution names ("ato", "anz", "dwp", "irs", "cra"), and as
    // bare substrings those hit ordinary words — "cra" inside "scratch", "ird"
    // inside "third" — which would call an unrelated sender an impersonator.
    if (TRUSTED_HOST_SUFFIXES.length > 0 &&
        mentionsAny(lower, OFFICIAL_SENDER_NAMES) &&
        senderDomain && !onTrustedSuffix) {
      flags.push(`Sender claims to be official but domain doesn't match — textbook impersonation`);
      score += 40;
    }
  }

  // Identity spoofing signals (display-name masking, From≠Reply-To, Return-Path)
  const identity = analyseEmailIdentities(headers);
  flags.push(...identity.flags);
  score += identity.score;

  // Generic greeting
  if (/dear (customer|user|member|valued|account holder|sir|madam)/i.test(text)) {
    flags.push("Generic greeting (e.g. 'Dear Customer') — legit orgs use your actual name");
    score += 15;
  }

  // Asks to open attachment
  const opensAttachment = /open.{0,20}(attachment|file|document|invoice)/i.test(text);
  if (opensAttachment) {
    flags.push("Prompts you to open an attachment — common malware delivery method");
    score += 25;
  }

  // SVG phishing attachment (D6 / 2026-08-09 roadmap / APWG Q2 2026, Proofpoint,
  // Any.run). SVG attachments carry embedded JavaScript that redirects to a
  // credential-harvest page, and they slip past scanners that only inspect
  // Office and PDF formats while rendering directly in the browser when opened.
  //
  // The hard part is that .svg is also an utterly ordinary asset extension: it
  // appears in the logo and tracking-pixel references at the foot of most
  // marketing email, which is precisely the mail this app is handed. Matching a
  // bare ".svg" would flag a newsletter footer.
  //
  // So the extension only counts when it is the thing being *sent*. Two
  // deliberately narrow halves, both learned from review:
  //
  //   - The cue must be attachment language proper ("attached", "attachment",
  //     "enclosed"), not a bare verb. An earlier version accepted
  //     see/open/download/view, which made "View in browser <img …/logo.svg>" —
  //     the standard marketing header — a phishing hit. Those verbs only count
  //     when they govern an attachment noun ("open the attached …").
  //   - The trailing half must not accept bare "file"/"document" as evidence
  //     either: "our logo.svg file lives in the shared drive" is ordinary
  //     office chatter. It needs an explicit attachment word, or a
  //     document-type noun that is itself the payload framing (invoice,
  //     statement, receipt, remittance).
  //
  // A footer logo reference has no such wording anywhere near it, on one line or
  // several, so it stays unflagged.
  //
  // The URL guard matters independently: an .svg inside an href/src is an asset
  // reference, not an attachment. Scheme-prefixed URLs and attribute values are
  // both excluded — quoted or not, absolute or root-relative, since
  // `<img src=/assets/logo.svg>` is as ordinary as the quoted absolute form.
  //
  // Scored below the likely_scam threshold on purpose: an SVG attachment is a
  // delivery-mechanism signal, not proof of intent — see the +25 interaction
  // note at the scoring line below.
  const ATTACH_WORD = String.raw`attach(?:ment|ments|ed|ing)?|enclosed`;
  const PAYLOAD_NOUN = String.raw`invoice|statement|receipt|remittance`;
  // .svg not sitting in a URL or an HTML attribute value. The three lookbehinds
  // cover, in order: an absolute URL; a quoted attribute value; and an unquoted
  // or root-relative attribute value (`src=/assets/logo.svg`, `src=logo.svg`),
  // which the quoted pattern alone misses.
  const svgFile = String.raw`(?<!https?:\/\/[^\s"']{0,200})(?<!(?:src|href)\s*=\s*["'][^"']{0,200})(?<!(?:src|href)\s*=\s*[^\s"'<>]{0,200})\b[\w.-]+\.svg\b`;
  const svgPatterns = [
    new RegExp(String.raw`\b(?:${ATTACH_WORD})\b[^\n]{0,40}?${svgFile}`, "i"),
    new RegExp(String.raw`${svgFile}[^\n]{0,40}?\b(?:${ATTACH_WORD})\b`, "i"),
    new RegExp(String.raw`\b(?:${PAYLOAD_NOUN})\b[^\n]{0,20}?${svgFile}`, "i"),
    new RegExp(String.raw`${svgFile}[^\n]{0,20}?\b(?:${PAYLOAD_NOUN})\b`, "i"),
  ];
  const svgMatch = svgPatterns.reduce<RegExpMatchArray | null>(
    (found, re) => found ?? text.match(re), null);
  if (svgMatch) {
    flags.push("SVG file attached — SVG attachments are a known phishing delivery trick: the file looks like an image but can carry hidden code that opens a fake login page in your browser. Legitimate invoices and statements are not sent as .svg.");
    // De-duplicated against the generic open-attachment rule above, but only
    // when both are describing the *same* attachment. "Please open the attached
    // invoice.svg" is one file and both rules match it — charging 25 + 20
    // double-counts a single fact and landed it on exactly 45, the likely_scam
    // boundary, purely by arithmetic.
    //
    // The test is locality, not a whole-text boolean: an email can legitimately
    // say "open the attached remittance advice" in one paragraph and carry a
    // separate invoice.svg in another. Those are two attachments and two
    // independent facts, so the SVG charge still applies. Keying off
    // `opensAttachment` alone suppressed it there too, which under-scored a
    // strictly worse email than the single-file case.
    //
    // Where both do describe one file, the SVG flag still replaces the generic
    // wording with the specific warning; it just doesn't stack a second charge.
    const opensSameFile =
      opensAttachment &&
      new RegExp(String.raw`open.{0,20}(?:attachment|file|document|invoice)[^\n]{0,20}?\.svg\b`, "i").test(text);
    if (!opensSameFile) score += 20;
  }

  // Device code / OAuth token phishing (D4 / #75 / FBI PSA260521). Attackers
  // abuse Microsoft's OAuth device-code flow to steal a session token with no
  // fake login page — the victim enters the code on the real microsoft.com but
  // authorises the attacker's device. Legitimate device-code flows are
  // user-initiated (e.g. smart-TV sign-in) and don't arrive unsolicited.
  const deviceCodeHit =
    /enter\s+(this\s+)?device\s+code/i.test(text) ||
    /your\s+device\s+code\s+is/i.test(text) ||
    /microsoft\.com\/devicelogin/i.test(text) ||
    /device\s+auth(orization)?\s+code/i.test(text) ||
    /activate\s+(your\s+)?new\s+device/i.test(text) ||
    /verify\s+(your\s+)?new\s+device/i.test(text);
  if (deviceCodeHit) {
    flags.push("Device code phishing — scammers abuse Microsoft's OAuth device login flow to steal your account access without a fake login page. Do not enter any code at microsoft.com/devicelogin unless YOU initiated the login.");
    score += 30;
  }

  // TOAD / callback phishing (D2 / #102). A fake subscription or purchase
  // invoice naming a cover brand, quoting a large charge, telling you to call to
  // dispute it, and containing NO link. The four-factor compound is very
  // specific — a genuine renewal email always links back to the vendor's site,
  // so hasNoUrl alone rules most legitimate mail out. Scamwatch "Fake purchase
  // callback scam" alert (June 2026).
  // Boundary-matched for short entries: the Irish pack carries "eir", which as a
  // bare substring hits "their" and "receiving" — enough to satisfy the brand
  // half of this compound on ordinary prose.
  const callbackBrandHits = mentionsCount(lower, CALLBACK_BRANDS);
  const hasCallToDispute =
    /call\s.{0,30}(dispute|cancel|reverse|refund|unauthori[sz]ed)/i.test(text) ||
    /to\s+(dispute|cancel|reverse)\s+(this|the)\s+(charge|payment|order|invoice|subscription)/i.test(text);
  const hasLargeAmount = /\$\s*[2-9]\d{2}|\$\s*[1-9]\d{3}/.test(text);
  const hasNoUrl = !/https?:\/\//i.test(text);

  if (callbackBrandHits >= 1 && hasCallToDispute && hasLargeAmount && hasNoUrl) {
    flags.push("Fake subscription callback scam — this looks like a fraudulent invoice designed to make you call a scammer. No legitimate company sends a billing dispute this way. Do not call the number.");
    score += 45;
  } else if (callbackBrandHits >= 2 && hasCallToDispute) {
    flags.push("Possible fake invoice callback scam — multiple fake-subscription brand names combined with a call-to-dispute pattern.");
    score += 25;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "Email", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Phone number checker
// ────────────────────────────────────────────────────────────────────────────

export function checkPhone(number: string, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const intel = analysePhone(number, region);
  const flags: string[] = [];
  let score = 0;

  // Translate intel into score/flags
  const riskScores: Record<PhoneIntel["spoofingRisk"], number> = {
    low: 15, medium: 30, high: 55, very_high: 75,
  };
  score += riskScores[intel.spoofingRisk];

  if (intel.lineType === "premium") {
    flags.push("Premium rate number — never call or text back, you'll be charged");
    score += 20;
  }

  if (intel.lineType === "voip_likely") {
    flags.push("VoIP / virtual number — trivially easy to spoof; real caller identity is hidden");
    score += 10;
  }

  if (intel.wangiriRisk) {
    flags.push("Wangiri scam: one-ring trick from a premium-rate international number — do NOT call back");
    score += 20;
  }

  if (intel.highScamCountry && !intel.wangiriRisk) {
    flags.push(`Call originates from ${intel.country} — frequently used as a base for scam operations targeting your region`);
  }

  // Toll-free and shared-cost wording is authored per region on the pack's
  // phonePlan, since the number ranges and impersonated bodies differ; it
  // reaches the user via intel.spoofingNotes below.
  if (intel.lineType === "freecall") {
    flags.push("Free-call numbers are routinely spoofed by scammers impersonating banks and government agencies");
  }

  if (intel.lineType === "shared_cost") {
    flags.push("Shared-cost numbers are commonly spoofed by scammers impersonating government agencies");
  }

  if (intel.lineType === "fixed") {
    flags.push("Fixed-line area code — easy to spoof; a local-looking number doesn't mean a local caller");
  }

  if (flags.length === 0) {
    flags.push("No obvious red flags from the number format alone — caller ID can always be spoofed, so stay cautious");
    score = Math.max(score, 15);
  }

  // Add spoofing notes as flags if not already covered
  for (const note of intel.spoofingNotes) {
    if (!flags.some((f) => f.includes(note.slice(0, 20)))) {
      flags.push(note);
    }
  }

  score = Math.min(score, 100);
  const result = scoreToResult(score, flags, "Phone Number", PACK.coverage, PACK.reportingBody);
  result.phoneIntel = intel;
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Custom / free-text checker
// ────────────────────────────────────────────────────────────────────────────

export function checkCustom(text: string, blocklist?: Set<string>, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    urgencyWords: URGENCY_WORDS,
    rewardWords: REWARD_WORDS,
    requestWords: REQUEST_WORDS,
    fakeInvestmentPlatforms: FAKE_INVESTMENT_PLATFORMS,
    identityRereg: MYID_REREG_PHRASES,
  } = PACK;
  const flags: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();

  const allSignals = [...URGENCY_WORDS, ...REWARD_WORDS, ...REQUEST_WORDS];
  const hits = allSignals.filter((w) => lower.includes(w));

  if (hits.length > 0) {
    flags.push(`Suspicious keywords found: "${hits.slice(0, 4).join('", "')}"`);
    score += Math.min(hits.length * 8, 60);
  }

  // Check for embedded URLs
  const urls = text.match(/https?:\/\/[^\s]+/gi);
  if (urls) {
    flags.push(`Contains ${urls.length} link(s) — checked separately`);
    const worst = urls.map((u) => checkUrl(u, blocklist, region)).sort((a, b) => b.score - a.score)[0];
    score += Math.floor(worst.score * 0.5);
  }

  // ClickFix "run a command" social engineering (D3 / #74). Pasted fake-CAPTCHA
  // page text is the most likely input path for this here, so mirror the SMS
  // fuzzy match. No legitimate site tells you to press Win+R and paste a command.
  if (/press\s+(win|windows)\s*\+?\s*r\b/i.test(text) ||
      /powershell\s+-[ec]/i.test(text)) {
    flags.push("'Press Win+R' instruction detected — this is ClickFix social engineering: scammers trick you into running malware on your own computer disguised as a 'human verification' step");
    score += 50;
  } else if (isMacClickFix(text)) {
    // The macOS variant matters more here than in checkSms: a pasted fake-CAPTCHA
    // page is the likeliest way this reaches us.
    flags.push(MAC_CLICKFIX_FLAG);
    score += 50;
  }

  // Named fraudulent investment platforms (D4 / #104) — mirror of the checkSms
  // rule so pasted ad text / recruitment messages are caught here too.
  const platformHit = FAKE_INVESTMENT_PLATFORMS.find((p) => lower.includes(p));
  if (platformHit) {
    flags.push(PACK.fakeInvestmentPlatformFlag(platformHit));
    score += 50;
  }

  // myID forced re-registration phishing (D6 / #106) — mirror for pasted email
  // bodies routed through the free-text checker.
  if (MYID_REREG_PHRASES.some((p) => lower.includes(p))) {
    flags.push(PACK.identityReregFlag);
    score += 25;
  }

  if (flags.length === 0) {
    flags.push("No obvious scam signals found in the text");
    score = 10;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "Custom", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

// Coverage honesty: a "safe" verdict asserts we looked and found nothing. That
// assertion is only true where we have rules to look with. Under partial or no
// regional coverage a low score can equally mean "no rule matched because no
// rule exists", so a clean result is downgraded to "unknown" — not enough to go
// on, rather than a confident pass.
//
// Only the clean case is touched. A positive detection is still a positive
// detection: base signals (shorteners, abused TLDs, credential asks) fire
// everywhere, so anything they caught is reported as found, regardless of
// coverage.
function downgradeForCoverage(result: CheckResult, coverage: RegionCoverage): CheckResult {
  if (coverage === "full" || result.verdict !== "safe") return result;
  return {
    ...result,
    verdict: "unknown",
    details:
      "We don't have full scam-detection rules for your region yet, so we can't give this a clean bill of health. " +
      "Nothing in our universal checks flagged it — but treat that as 'not checked', not 'safe'.",
  };
}

function scoreToResult(
  score: number,
  flags: string[],
  category: string,
  coverage: RegionCoverage = "full",
  // Where to report a confirmed scam. Named per region — telling a UK or US
  // user to contact Scamwatch would send them to an agency with no remit
  // over their case.
  reportingBody: string = resolveRegionPack(DEFAULT_REGION).reportingBody,
): CheckResult {
  let verdict: CheckResult["verdict"];
  let details: string;

  if (score < 20) {
    verdict = "safe";
    details = "Looks pretty right to us — but always keep your wits about ya.";
  } else if (score < 45) {
    verdict = "suspicious";
    details = "Something's a bit sus here. Don't click any links, share personal info, or send money until you've verified this yourself.";
  } else if (score < 70) {
    verdict = "likely_scam";
    details = "This is giving strong scam vibes. Do NOT engage, click links, or provide any information.";
  } else {
    verdict = "likely_scam";
    details = `Crikey, this is almost certainly a scam. Delete it, block the sender, and report it to ${reportingBody}.`;
  }

  return downgradeForCoverage({ verdict, score, flags, details, category, coverage }, coverage);
}

// ────────────────────────────────────────────────────────────────────────────
// Per-identifier orchestration
// ────────────────────────────────────────────────────────────────────────────
//
// Rather than blend everything into one verdict, pull each distinct identifier
// out of the input and assess it on its own — so a pasted email yields a
// separate card for the sender, each embedded link, and any phone number.

export interface AnalyzedIdentifier {
  kind: "url" | "email" | "phone" | "message";
  value: string;          // raw identifier (or a snippet for "message"); defanged at display
  result: CheckResult;
}

const MAX_CARDS = 5;
const URL_GLOBAL = /https?:\/\/[^\s<>"']+/gi;

// Expands a shortened URL and merges the destination analysis into the base result.
// If expansion fails or times out, the base result is returned unchanged.
async function applyExpansion(url: string, base: CheckResult, blocklist?: Set<string>, region?: RegionInput): Promise<CheckResult> {
  if (!isShortened(url)) return base;

  const { expandedUrl, hops } = await expandUrl(url);
  if (!expandedUrl) return base;

  const destResult = checkUrl(normaliseForAnalysis(expandedUrl), blocklist, region);
  const destDefanged = defang(expandedUrl);
  const mergedScore = Math.min(Math.max(base.score, destResult.score), 100);
  const mergedFlags = [
    ...base.flags,
    `Shortened URL expanded — real destination: ${destDefanged}`,
    ...destResult.flags,
    ...(hops.length > 1 ? [`Multi-hop chain (${hops.length} redirects) — extra suspicious`] : []),
  ];
  const pack = resolveRegionPack(region);
  const merged = scoreToResult(mergedScore, mergedFlags, "URL", pack.coverage, pack.reportingBody);
  return { ...merged, score: mergedScore, flags: mergedFlags, expandedUrl: destDefanged, category: "URL" };
}

export async function analyzeContent(content: string, blocklist?: Set<string>, region?: RegionInput): Promise<AnalyzedIdentifier[]> {
  const text = content.trim();
  if (!text) return [];

  const type = detectType(text);
  const ids = extractIdentifiers(text);
  const headers = parseEmailHeaders(text);
  const out: AnalyzedIdentifier[] = [];

  // Distinct URLs found anywhere in the input (trailing punctuation trimmed).
  const urls = Array.from(
    new Set((text.match(URL_GLOBAL) || []).map((u) => u.replace(/[.,;:!?)]+$/, ""))),
  ).slice(0, 3);

  // Overall "message" assessment, by detected type.
  if (type === "email") {
    out.push({ kind: "email", value: headers.fromAddress || ids.scamEmail || "sender", result: checkEmail(text, blocklist, region) });
  } else if (type === "sms") {
    out.push({ kind: "message", value: text.slice(0, 80), result: checkSms(text, blocklist, region) });
  } else if (type === "phone") {
    out.push({ kind: "phone", value: text, result: checkPhone(text, region) });
  } else if (type === "url") {
    // A bare URL is assessed by the per-URL cards below; if the regex missed it
    // (e.g. a "www." host with no scheme), assess the whole string as a URL.
    if (urls.length === 0) {
      const normalised = normaliseForAnalysis(text);
      const base = checkUrl(normalised, blocklist, region);
      const result = await applyExpansion(normalised, base, blocklist, region);
      out.push({ kind: "url", value: text, result });
    }
  } else {
    out.push({ kind: "message", value: text.slice(0, 80), result: checkCustom(text, blocklist, region) });
  }

  // A card per embedded URL (normalised first to close percent-encoding tricks).
  // Expansion runs for each URL that resolves to a known shortener host.
  for (const u of urls) {
    const normalised = normaliseForAnalysis(u);
    const base = checkUrl(normalised, blocklist, region);
    const result = await applyExpansion(normalised, base, blocklist, region);
    out.push({ kind: "url", value: u, result });
  }

  // Phone card only when the whole input is a number (extractIdentifiers is
  // deliberately conservative about in-text numbers).
  if (ids.scamPhone && type !== "phone") {
    out.push({ kind: "phone", value: ids.scamPhone, result: checkPhone(ids.scamPhone, region) });
  }

  // De-dup by kind+value, keep highest score first, always return ≥1 card.
  const seen = new Set<string>();
  const deduped = out.filter((c) => {
    const key = `${c.kind}:${c.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length === 0) {
    deduped.push({ kind: "message", value: text.slice(0, 80), result: checkCustom(text, blocklist, region) });
  }
  return deduped.sort((a, b) => b.result.score - a.result.score).slice(0, MAX_CARDS);
}
