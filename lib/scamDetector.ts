import { parseEmailHeaders, analyseEmailIdentities, domainOf } from "@/lib/emailHeaders";
import { extractIdentifiers, normaliseForAnalysis, defang } from "@/lib/urlSanitizer";
import { detectType } from "@/lib/detectType";
import { analysePhone, PhoneIntel } from "@/lib/phoneIntel";
import { isShortened, expandUrl } from "@/lib/urlExpander";

export type ScamType = "url" | "sms" | "email" | "phone" | "qr" | "custom";
export type { PhoneIntel };

export interface CheckResult {
  verdict: "safe" | "suspicious" | "likely_scam" | "unknown";
  score: number; // 0-100, higher = more scammy
  flags: string[];
  details: string;
  category?: string;
  phoneIntel?: PhoneIntel;
  expandedUrl?: string; // defanged real destination when the input was a shortened URL
}

// ────────────────────────────────────────────────────────────────────────────
// Shared signal lists
// ────────────────────────────────────────────────────────────────────────────

const URGENCY_WORDS = [
  "urgent", "immediately", "act now", "limited time", "expires today",
  "account suspended", "verify now", "confirm now", "last chance",
  "final notice", "your account", "security alert", "unusual activity",
  "click here", "click link", "tap here", "don't ignore", "action required",
  "respond immediately", "within 24 hours", "within 48 hours",
  // Toll-road smishing (D2 / #53) — Linkt/EastLink/E-Toll campaigns
  "unpaid toll", "outstanding toll", "overdue toll", "toll payment",
  "toll fine", "toll invoice", "final toll notice",
  // AusPost parcel/delivery lures (D10 / #48)
  "parcel held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "invalid postal code",
  // AI voice-clone follow-up text signals (D17 — watchlist)
  "i've been in an accident", "don't tell mum", "don't tell anyone",
  "western union", "wire transfer",
];

const REWARD_WORDS = [
  "winner", "won", "congratulations", "prize", "reward", "free",
  "gift card", "voucher", "lucky", "selected", "chosen", "claim",
  "unclaimed", "$1000", "$500", "cash", "jackpot",
  // Loyalty-points expiry phishing (D6 / #57). "reward points"/"loyalty
  // points" are deliberately the longer two-word phrases, not bare "points",
  // to keep legitimate transactional mail from tripping on a single word —
  // and the scorer only reaches likely_scam when these compound with a URL
  // or urgency signal.
  "points will expire", "points expiring", "reward points",
  "loyalty points", "points forfeited",
];

const REQUEST_WORDS = [
  "bank details", "credit card", "password", "pin", "medicare",
  "tax file number", "tfn", "mygovid", "mygov", "centrelink",
  "ato", "date of birth", "social security", "confirm identity",
  "verify identity", "personal information", "account number", "bsb",
  "crypto", "bitcoin", "gift card", "itunes", "google play",
  // Remote-access-tool scams — ACSC/ASD impersonation (D8 / #55)
  "teamviewer", "anydesk", "remote access", "remote desktop",
  "download software", "install software", "give us access",
  // Pig-butchering / wallet-approval phishing (D12 / #51)
  "connect wallet", "approve transaction", "wallet approval",
  "sign transaction", "recharge your account", "top up your account",
];

const SCAM_DOMAINS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "short.io",
  "rb.gy", "cutt.ly", "is.gd", "v.gd", "tiny.cc", "shorte.st",
];

const SUSPICIOUS_TLDS = [
  ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".win",
  ".loan", ".work", ".click", ".link", ".online", ".site", ".live",
  // High-abuse 2026 TLDs (D4 / #50, #58) — Shortdot-managed + ICANN expansion
  ".cyou", ".icu", ".sbs", ".cfd", ".bar", ".beauty", ".hair", ".makeup",
  // Immigration/visa scams using .pn (Pitcairn) to look semi-official (D14 / #50)
  ".pn",
];

// Public IPFS gateways — decentralised hosting used for takedown-resistant
// phishing. Any host serving the /ipfs/<CID> path is also caught in checkUrl.
const IPFS_GATEWAYS = new Set([
  "ipfs.io", "dweb.link", "cloudflare-ipfs.com",
  "w3s.link", "gateway.pinata.cloud", "nftstorage.link", "ipfs.fleek.co",
]);

const LEGIT_AU_DOMAINS = [
  "gov.au", "ato.gov.au", "mygov.gov.au", "centrelink.gov.au",
  "myhealth.gov.au", "australia.gov.au", "afp.gov.au", "accc.gov.au",
  "scamwatch.gov.au", "cyber.gov.au", "servicesaustralia.gov.au",
  "medicare.gov.au", "abf.gov.au", "homeaffairs.gov.au",
];

// ────────────────────────────────────────────────────────────────────────────
// URL checker
// ────────────────────────────────────────────────────────────────────────────

export function checkUrl(raw: string, blocklist?: Set<string>): CheckResult {
  const flags: string[] = [];
  let score = 0;
  let urlObj: URL | null = null;

  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;

  try {
    urlObj = new URL(input);
  } catch {
    return {
      verdict: "suspicious",
      score: 60,
      flags: ["Couldn't parse this as a valid URL — dodgy already"],
      details: "The link format looks off. Legit sites don't usually send malformed URLs.",
    };
  }

  const hostname = urlObj.hostname.toLowerCase();
  const fullUrl = input.toLowerCase();

  // Legit AU gov domains — strong positive signal
  if (LEGIT_AU_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
    return {
      verdict: "safe",
      score: 5,
      flags: ["Verified Australian government domain"],
      details: "This looks like a legit Aussie government website. Still be cautious about what you're entering.",
    };
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

  // Typosquatting common AU brands
  const auBrands = ["commbank", "westpac", "anz", "nab", "mybank", "mygov", "centrelink", "medicare", "paypal", "ebay", "amazon", "netflix", "telstra", "optus", "tpg",
    // Toll operators (D1 / #53) and immigration portals (D14 / #50)
    "linkt", "eastlink", "etoll", "homeaffairs", "dibp", "immi"];
  for (const brand of auBrands) {
    if (hostname.includes(brand) && !hostname.endsWith(".gov.au") && !hostname.endsWith(".com.au")) {
      flags.push(`Looks like it's impersonating "${brand}" — classic phishing move`);
      score += 45;
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
  return scoreToResult(score, flags, "URL");
}

// ────────────────────────────────────────────────────────────────────────────
// SMS checker
// ────────────────────────────────────────────────────────────────────────────

export function checkSms(text: string, blocklist?: Set<string>): CheckResult {
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

  // Contains a URL
  const urlMatch = text.match(/https?:\/\/[^\s]+/gi);
  if (urlMatch) {
    flags.push(`Contains link: ${urlMatch[0].slice(0, 50)}...`);
    score += 15;
    // Check the embedded URL too
    const urlCheck = checkUrl(urlMatch[0], blocklist);
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
      /\bscan\s+to\s+(verify|update|claim|pay|confirm)/i.test(text)) {
    flags.push("QR code scan prompt — 'quishing' attacks hide malicious URLs inside QR images to dodge link scanners");
    score += 20;
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

  // Sender mentions a gov agency but is a random number
  const govMentions = ["ato", "myGov", "mygov", "centrelink", "medicare", "services australia", "afp", "police",
    // ACSC/ASD impersonation (D7 / #55)
    "acsc", "asd", "cyber security centre", "australian signals directorate", "cyber.gov.au",
    // Toll operators (D1 / #53) and AusPost parcel lures (D10 / #48)
    "linkt", "eastlink", "e-toll", "etoll", "australia post", "auspost"];
  if (govMentions.some((g) => lower.includes(g.toLowerCase()))) {
    flags.push("Claims to be from a government agency — verify directly via official channels");
    score += 25;
  }

  // Asks to call back a number
  if (/call\s+(back|now|us|this number)/i.test(text)) {
    flags.push("Asks you to call a number — scammers use this to run up your phone bill or gather info");
    score += 20;
  }

  // Grammar/typo signals
  const typos = text.match(/recieve|reciept|ur account|u have|pls|plz|kindly/gi);
  if (typos && typos.length > 0) {
    flags.push("Spelling/grammar patterns common in scam messages");
    score += 10;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "SMS");
}

// ────────────────────────────────────────────────────────────────────────────
// Email checker
// ────────────────────────────────────────────────────────────────────────────

export function checkEmail(text: string, blocklist?: Set<string>): CheckResult {
  const flags: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();

  // Reuse SMS signals for body content
  const smsCheck = checkSms(text, blocklist);
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
    // Impersonation pattern: official name in the body but a mismatched domain
    const officialNames = ["ato", "mygov", "centrelink", "medicare", "commbank", "westpac", "anz", "nab"];
    if (officialNames.some((n) => lower.includes(n)) && senderDomain && !senderDomain.endsWith(".gov.au") && !senderDomain.endsWith(".com.au")) {
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
  if (/open.{0,20}(attachment|file|document|invoice)/i.test(text)) {
    flags.push("Prompts you to open an attachment — common malware delivery method");
    score += 25;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "Email");
}

// ────────────────────────────────────────────────────────────────────────────
// Phone number checker
// ────────────────────────────────────────────────────────────────────────────

export function checkPhone(number: string): CheckResult {
  const intel = analysePhone(number);
  const flags: string[] = [];
  let score = 0;

  // Translate intel into score/flags
  const riskScores: Record<PhoneIntel["spoofingRisk"], number> = {
    low: 15, medium: 30, high: 55, very_high: 75,
  };
  score += riskScores[intel.spoofingRisk];

  if (intel.lineType === "premium") {
    flags.push("Premium rate number (190x) — never call or text back, you'll be charged");
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
    flags.push(`Call originates from ${intel.country} — frequently used as a base for scam operations targeting Australia`);
  }

  if (intel.lineType === "freecall") {
    flags.push("1800 numbers are routinely spoofed by scammers impersonating banks and government agencies");
  }

  if (intel.lineType === "shared_cost") {
    flags.push("1300/13xx numbers are commonly spoofed by scammers impersonating the ATO, myGov, and Centrelink");
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
  const result = scoreToResult(score, flags, "Phone Number");
  result.phoneIntel = intel;
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Custom / free-text checker
// ────────────────────────────────────────────────────────────────────────────

export function checkCustom(text: string, blocklist?: Set<string>): CheckResult {
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
    const worst = urls.map((u) => checkUrl(u, blocklist)).sort((a, b) => b.score - a.score)[0];
    score += Math.floor(worst.score * 0.5);
  }

  if (flags.length === 0) {
    flags.push("No obvious scam signals found in the text");
    score = 10;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "Custom");
}

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

function scoreToResult(score: number, flags: string[], category: string): CheckResult {
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
    details = "Crikey, this is almost certainly a scam. Delete it, block the sender, and report it to Scamwatch.";
  }

  return { verdict, score, flags, details, category };
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
async function applyExpansion(url: string, base: CheckResult, blocklist?: Set<string>): Promise<CheckResult> {
  if (!isShortened(url)) return base;

  const { expandedUrl, hops } = await expandUrl(url);
  if (!expandedUrl) return base;

  const destResult = checkUrl(normaliseForAnalysis(expandedUrl), blocklist);
  const destDefanged = defang(expandedUrl);
  const mergedScore = Math.min(Math.max(base.score, destResult.score), 100);
  const mergedFlags = [
    ...base.flags,
    `Shortened URL expanded — real destination: ${destDefanged}`,
    ...destResult.flags,
    ...(hops.length > 1 ? [`Multi-hop chain (${hops.length} redirects) — extra suspicious`] : []),
  ];
  const { verdict, details } = scoreToResult(mergedScore, mergedFlags, "URL");
  return { verdict, score: mergedScore, flags: mergedFlags, details, expandedUrl: destDefanged, category: "URL" };
}

export async function analyzeContent(content: string, blocklist?: Set<string>): Promise<AnalyzedIdentifier[]> {
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
    out.push({ kind: "email", value: headers.fromAddress || ids.scamEmail || "sender", result: checkEmail(text, blocklist) });
  } else if (type === "sms") {
    out.push({ kind: "message", value: text.slice(0, 80), result: checkSms(text, blocklist) });
  } else if (type === "phone") {
    out.push({ kind: "phone", value: text, result: checkPhone(text) });
  } else if (type === "url") {
    // A bare URL is assessed by the per-URL cards below; if the regex missed it
    // (e.g. a "www." host with no scheme), assess the whole string as a URL.
    if (urls.length === 0) {
      const normalised = normaliseForAnalysis(text);
      const base = checkUrl(normalised, blocklist);
      const result = await applyExpansion(normalised, base, blocklist);
      out.push({ kind: "url", value: text, result });
    }
  } else {
    out.push({ kind: "message", value: text.slice(0, 80), result: checkCustom(text, blocklist) });
  }

  // A card per embedded URL (normalised first to close percent-encoding tricks).
  // Expansion runs for each URL that resolves to a known shortener host.
  for (const u of urls) {
    const normalised = normaliseForAnalysis(u);
    const base = checkUrl(normalised, blocklist);
    const result = await applyExpansion(normalised, base, blocklist);
    out.push({ kind: "url", value: u, result });
  }

  // Phone card only when the whole input is a number (extractIdentifiers is
  // deliberately conservative about in-text numbers).
  if (ids.scamPhone && type !== "phone") {
    out.push({ kind: "phone", value: ids.scamPhone, result: checkPhone(ids.scamPhone) });
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
    deduped.push({ kind: "message", value: text.slice(0, 80), result: checkCustom(text, blocklist) });
  }
  return deduped.sort((a, b) => b.result.score - a.result.score).slice(0, MAX_CARDS);
}
