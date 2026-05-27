export type ScamType = "url" | "sms" | "email" | "phone" | "qr" | "custom";

export interface CheckResult {
  verdict: "safe" | "suspicious" | "likely_scam" | "unknown";
  score: number; // 0-100, higher = more scammy
  flags: string[];
  details: string;
  category?: string;
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
];

const REWARD_WORDS = [
  "winner", "won", "congratulations", "prize", "reward", "free",
  "gift card", "voucher", "lucky", "selected", "chosen", "claim",
  "unclaimed", "$1000", "$500", "cash", "jackpot",
];

const REQUEST_WORDS = [
  "bank details", "credit card", "password", "pin", "medicare",
  "tax file number", "tfn", "mygovid", "mygov", "centrelink",
  "ato", "date of birth", "social security", "confirm identity",
  "verify identity", "personal information", "account number", "bsb",
  "crypto", "bitcoin", "gift card", "itunes", "google play",
];

const SCAM_DOMAINS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "short.io",
  "rb.gy", "cutt.ly", "is.gd", "v.gd", "tiny.cc", "shorte.st",
];

const SUSPICIOUS_TLDS = [
  ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".win",
  ".loan", ".work", ".click", ".link", ".online", ".site", ".live",
];

const LEGIT_AU_DOMAINS = [
  "gov.au", "ato.gov.au", "mygov.gov.au", "centrelink.gov.au",
  "myhealth.gov.au", "australia.gov.au", "afp.gov.au", "accc.gov.au",
  "scamwatch.gov.au", "cyber.gov.au", "servicesaustralia.gov.au",
  "medicare.gov.au", "abf.gov.au", "homeaffairs.gov.au",
];

// ────────────────────────────────────────────────────────────────────────────
// URL checker
// ────────────────────────────────────────────────────────────────────────────

export function checkUrl(raw: string): CheckResult {
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

  // Typosquatting common AU brands
  const auBrands = ["commbank", "westpac", "anz", "nab", "mybank", "mygov", "centrelink", "medicare", "paypal", "ebay", "amazon", "netflix", "telstra", "optus", "tpg"];
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

export function checkSms(text: string): CheckResult {
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
    const urlCheck = checkUrl(urlMatch[0]);
    if (urlCheck.score > 40) {
      flags.push("...and that link looks dodgy too");
      score += 20;
    }
  }

  // Sender mentions a gov agency but is a random number
  const govMentions = ["ato", "myGov", "mygov", "centrelink", "medicare", "services australia", "afp", "police"];
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

export function checkEmail(text: string): CheckResult {
  const flags: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();

  // Reuse SMS signals for body content
  const smsCheck = checkSms(text);
  flags.push(...smsCheck.flags);
  score += Math.floor(smsCheck.score * 0.7); // Email gets a bit more lenience

  // Extract sender email if present
  const senderMatch = text.match(/from:\s*([^\s<>]+@[^\s<>]+)/i);
  if (senderMatch) {
    const senderDomain = senderMatch[1].split("@")[1]?.toLowerCase();
    const suspTlds = SUSPICIOUS_TLDS.find((t) => senderDomain?.endsWith(t));
    if (suspTlds) {
      flags.push(`Sender email uses a dodgy domain extension (${suspTlds})`);
      score += 30;
    }
    // Impersonation pattern: official name but weird domain
    const officialNames = ["ato", "mygov", "centrelink", "medicare", "commbank", "westpac", "anz", "nab"];
    if (officialNames.some((n) => lower.includes(n)) && senderDomain && !senderDomain.endsWith(".gov.au") && !senderDomain.endsWith(".com.au")) {
      flags.push(`Sender claims to be official but domain doesn't match — textbook impersonation`);
      score += 40;
    }
  }

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
  const flags: string[] = [];
  let score = 0;
  const cleaned = number.replace(/[\s\-().+]/g, "");

  // International prefix from known scam-heavy countries (not exhaustive, indicative)
  const riskyPrefixes = ["237", "216", "234", "256", "260", "263", "381", "385", "386", "387", "389", "420", "421"];
  if (riskyPrefixes.some((p) => cleaned.startsWith(p))) {
    flags.push("International prefix associated with frequent scam calls");
    score += 30;
  }

  // Fake Australian numbers
  if (cleaned.startsWith("61") || cleaned.startsWith("0")) {
    const local = cleaned.startsWith("61") ? cleaned.slice(2) : cleaned.slice(1);
    // Premium rate numbers in AU
    if (local.startsWith("190")) {
      flags.push("190x number — premium rate, will cost you a lot to call back");
      score += 50;
    }
    // Spoofed sequential numbers
    if (/^(\d)\1{6,}/.test(local)) {
      flags.push("Repetitive digit pattern — likely a spoofed/fake number");
      score += 40;
    }
  }

  // Caller ID spoofing indicator
  if (cleaned.length < 6) {
    flags.push("Very short number — likely caller ID spoofing");
    score += 45;
  }

  if (flags.length === 0) {
    flags.push("Number format looks okay, but phone scams are hard to detect by number alone — always be cautious");
    score = 20;
  }

  score = Math.min(score, 100);
  return scoreToResult(score, flags, "Phone Number");
}

// ────────────────────────────────────────────────────────────────────────────
// Custom / free-text checker
// ────────────────────────────────────────────────────────────────────────────

export function checkCustom(text: string): CheckResult {
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
    const worst = urls.map((u) => checkUrl(u)).sort((a, b) => b.score - a.score)[0];
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
