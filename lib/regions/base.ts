// Universal signals — shared by every region.
//
// Nothing here should reference a specific country's agencies, brands or number
// plan. If a signal only makes sense in one country, it belongs in that
// region's pack instead. Anything added here is inherited by every region for
// free, so the bar is "would this be true in any market?".

import type { BaseSignals } from "./types";

// Generic pressure/urgency language common to nearly all scam messaging.
const URGENCY_GENERIC = [
  "urgent", "immediately", "act now", "limited time", "expires today",
  "account suspended", "verify now", "confirm now", "last chance",
  "final notice", "your account", "security alert", "unusual activity",
  "click here", "click link", "tap here", "don't ignore", "action required",
  "respond immediately", "within 24 hours", "within 48 hours",
];

// AI voice-clone scams. The first block is the original "Hi Mum" follow-up
// signals (D17 — watchlist); the second is the 2026 bail/kidnap/stranded
// escalation (D8 / #68), arriving as text after a cloned-voice call.
const URGENCY_VOICE_CLONE = [
  "i've been in an accident", "don't tell mum", "don't tell anyone",
  "western union", "wire transfer",
  "bail money", "need bail", "post bail", "get me out of jail",
  "stranded overseas", "stuck overseas", "stranded abroad", "wallet stolen overseas",
  "do not call police", "don't call the police", "don't contact police",
  "emergency transfer", "emergency funds needed", "we have your",
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
  // Celebrity-deepfake investment bait (D6 / #85 / WA Gov 2026). Promising
  // "guaranteed returns" or "risk-free" investment is prohibited conduct for
  // licensed financial products in every regulated market, so these phrases
  // are red flags regardless of region. Regulator-endorsement claims
  // ("verified by <regulator>") live in the region packs, since the named
  // body differs.
  "guaranteed returns", "guaranteed profit", "risk-free investment",
  "double your money", "exclusive investment opportunity",
];

const REQUEST_WORDS = [
  "bank details", "credit card", "password", "pin",
  "date of birth", "social security", "confirm identity",
  "verify identity", "personal information", "account number",
  "crypto", "bitcoin", "gift card", "itunes", "google play",
  // Remote-access-tool scams (D8 / #55)
  "teamviewer", "anydesk", "remote access", "remote desktop",
  "download software", "install software", "give us access",
  // Pig-butchering / wallet-approval phishing (D12 / #51)
  "connect wallet", "approve transaction", "wallet approval",
  "sign transaction", "recharge your account", "top up your account",
  // Bank "safe account" tag-team scam (#47). SMS primes the victim, then a
  // spoofed-number caller tells them to move money to a "safe account" — a
  // phrase real banks never use (CBA/NAB/AFP advisories confirm this, and the
  // script is used internationally).
  "safe account", "safe transfer", "safe wallet",
  "move your funds", "transfer to safe", "protect your money",
  // ClickFix fake-CAPTCHA social engineering (D3 / #74 / ACSC advisory May 2026).
  // Compromised sites display a fake Cloudflare overlay telling users to press
  // Win+R, paste a PowerShell command and run it. No legitimate site asks this;
  // the dedicated regex in scamDetector scores the strongest variants higher.
  "press windows+r", "press win+r", "press windows + r",
  "ctrl+v then enter", "ctrl v and enter",
  "paste this command", "paste the following command", "paste the command below",
  "run this to verify", "run the following to verify", "run this fix",
  "open run dialog", "open the run dialog",
  "copy and paste this fix", "paste to fix your browser",
  // ClickFix macOS variant (D3 / #143 / ACSC ASC-2026-0809, Sophos X-Ops,
  // CrowdStrike, CISA — all 9 Aug 2026). Same tactic, different keystroke: the
  // fake overlay says press Cmd+Space, open Terminal, paste a `curl | bash`.
  //
  // These are deliberately the *weaker* half of the signal. "open terminal" and
  // "run in terminal" appear verbatim in legitimate developer documentation, so
  // they only inform the compound score — a lone hit is +15 in checkSms and +8
  // in checkCustom, both well under the 20-point "suspicious" threshold, so an
  // install guide stays "safe" on its own. The high-confidence path is
  // isMacClickFix in scamDetector, which requires a Terminal/Spotlight cue and a
  // paste instruction together.
  //
  // No `curl … | bash` entry here: this list is matched with a plain substring
  // test, and a real command has a URL between the flags and the pipe
  // ("curl -s https://… | sh"), so a literal "curl | bash" can never match. The
  // piped-shell case is handled by the shellPipe regex in isMacClickFix, which
  // can span the URL.
  "open terminal", "press cmd+space", "press command+space",
  "open spotlight", "paste in terminal", "run in terminal",
  // Rental/property bond redirect fraud (D5 / #105). Scammers impersonate or
  // intercept real estate agency comms and send "updated bank details" just
  // before the bond is due. Legitimate agencies rarely change payment details
  // and never under time pressure via SMS, so the "updated/new/changed"
  // qualifier is the distinguishing signal — bare "rental bond" doesn't score.
  //
  // "updated bank details" is deliberately absent: this list is
  // substring-matched and "bank details" above already matches it, so listing
  // both scored one phrase twice (+30 instead of +15). The qualifier did no
  // filtering — it only inflated the score. The two entries below carry no such
  // overlap ("account details" and "bank account" are not listed alone), so the
  // redirect-fraud signal is unaffected; the rental *context* is what escalates
  // it, via the bond composite in checkSms.
  "new account details", "changed bank account",
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
  // File-extension TLDs (Google 2023, D6 / #77) — auto-linked by some platforms
  // to look like file downloads (invoice.zip, message.mov); no legitimate
  // consumer use.
  ".zip", ".mov",
  // .lat — high phishing-abuse ratio, appearing in AU-targeting campaigns 2025-26.
  ".lat",
  // High-abuse 2026 TLDs promoted from watchlist (D1 / #101). .shop and .store
  // are top-10 globally abused TLDs (Brandsec AU 2025-2026) seen in
  // fake-retail and subscription-renewal campaigns; .vip appears in the APWG
  // top-10 and in pig-butchering funnels; .lol and .monster are cheap ICANN
  // TLDs that launched with >60% abuse rates. .shop/.store carry some
  // legitimate e-commerce use, so they lean on compound scoring rather than
  // reaching a scam verdict alone.
  ".shop", ".store", ".vip", ".lol", ".monster",
];

// Public IPFS gateways — decentralised hosting used for takedown-resistant
// phishing. Any host serving the /ipfs/<CID> path is also caught in checkUrl.
const IPFS_GATEWAYS = new Set([
  "ipfs.io", "dweb.link", "cloudflare-ipfs.com",
  "w3s.link", "gateway.pinata.cloud", "nftstorage.link", "ipfs.fleek.co",
]);

// Free-tier cloud dev platforms used as phishing hosting infrastructure (D1/D2
// / #63). workers.dev, pages.dev (Cloudflare) and trycloudflare.com (ephemeral
// tunnels) are rated "trusted" by URL filters but are the dominant PhaaS hosting
// substrate of 2025-2026. railway.app and vercel.app are abused as
// credential-exfiltration endpoints in multi-hop chains — scored lower because
// legitimate preview sites on those two are more common.
const SUSPICIOUS_HOSTING = [
  "workers.dev", "pages.dev", "trycloudflare.com",
  "railway.app", "vercel.app",
  // Cloudflare R2 object storage (D4 / #83) — named alongside workers.dev/
  // pages.dev as a core phishing hosting layer in 2026 reporting; used to serve
  // static credential-harvest pages. Scored lower (+25) like railway/vercel
  // because R2 has legitimate public static-hosting use.
  "r2.dev",
  // ngrok ephemeral reverse-proxy tunnels (D1 / #119). Random-subdomain HTTPS
  // URLs that inherit ngrok.com's reputation and bypass URL filters exactly
  // like trycloudflare.com. No consumer service ships public ngrok URLs, so
  // these sit at the full +35 tier.
  "ngrok.io", "ngrok-free.app",
  // Static-site platforms abused for "trusted reputation" phishing (D2 / #120).
  // netlify.app matches the vercel.app FP profile (+25). github.io is scored
  // lowest (+15) because legitimate developer portfolios and project docs are
  // common there — it only matters when it compounds with another signal.
  "github.io", "netlify.app",
];

// Per-platform score overrides for SUSPICIOUS_HOSTING. Anything not listed here
// scores the default +35 (see checkUrl). Lower tiers exist where the platform
// has substantial legitimate consumer-visible use, so a bare URL shouldn't
// reach a "suspicious" verdict on hosting alone.
const HOSTING_SCORES: Record<string, number> = {
  "vercel.app": 25,
  "railway.app": 25,
  "r2.dev": 25,
  "netlify.app": 25,
  "github.io": 15,
};

// Named fraudulent AI-trading platforms (D4 / #104). These are promoted via
// deepfake celebrity video ads internationally, not to one market, and no
// legitimate financial service uses any of these names — so a bare match is
// near-zero false-positive. Regions may append their own locally-warned names.
const FAKE_INVESTMENT_PLATFORMS = [
  "quantum ai", "quantum trade ai", "quantum trade wave",
  "immediate edge", "immediate connect", "immediate x3",
  "bitcoin era", "bitcoin trader",
];

// Cover brands for TOAD / callback phishing (D2 / #102). Fake subscription or
// purchase-invoice emails naming one of these, with a phone number and NO link,
// are the core signal — the scam happens on the phone, not via a URL. These are
// the globally-operating brands; regions append their own (e.g. local crypto
// exchanges).
const CALLBACK_BRANDS = [
  "norton", "mcafee", "geek squad", "geeksquad", "best buy",
  "docusign", "coinbase", "bitcoin",
];

// Globally-operating crypto exchanges used in the "your account is suspended,
// call us" SMS script. Binance and Coinbase operate in essentially every market,
// so they sit in base; regions append their domestic exchanges.
//
// Named brands only. The TOAD flag quotes whichever entry matched, so a generic
// phrase like "crypto exchange" would render "crypto exchange and other
// exchanges never ring customers" — defeating the point of naming the brand.
// The generic phrasing is still caught as a brand mention via brandMentions.
const CRYPTO_EXCHANGES = ["binance", "coinbase", "kraken"];

export const BASE_SIGNALS: BaseSignals = {
  urgency: {
    generic: URGENCY_GENERIC,
    voiceClone: URGENCY_VOICE_CLONE,
  },
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
  shortenerDomains: SCAM_DOMAINS,
  suspiciousTlds: SUSPICIOUS_TLDS,
  ipfsGateways: IPFS_GATEWAYS,
  suspiciousHosting: SUSPICIOUS_HOSTING,
  hostingScores: HOSTING_SCORES,
  fakeInvestmentPlatforms: FAKE_INVESTMENT_PLATFORMS,
  callbackBrands: CALLBACK_BRANDS,
  cryptoExchanges: CRYPTO_EXCHANGES,
};
