// Australia — region pack.
//
// Signals here are AU-specific: national agencies, toll operators, the tax and
// superannuation system, and locally-warned platforms. Anything that would hold
// true in another market belongs in ./base.ts instead.

import type { RegionDefinition } from "./types";

// Toll-road smishing (D2 / #53) — Linkt/EastLink/E-Toll campaigns.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "overdue toll", "toll payment",
  "toll fine", "toll invoice", "final toll notice",
  // Operation Road Trap escalation (D5 / #84 / Bitdefender April 2026). These
  // threaten loss of vehicle registration — "rego" is AU-specific and unique to
  // the escalated toll script, so FP risk is very low.
  "rego restrictions", "toll penalty", "vehicle registration suspended",
  "recovery action",
];

// AusPost parcel/delivery lures (D10 / #48).
const URGENCY_PARCEL = [
  "parcel held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "invalid postal code",
];

// NBN Co disconnection-threat smishing (D7 / #67).
const URGENCY_UTILITY = [
  "internet will be disconnected", "broadband will be cut off",
  "nbn technician", "service disconnected within", "disconnected within 24 hours",
  "internet disconnected", "broadband disconnected",
];

// Superannuation phishing urgency (D3/D4/D11 / #64).
const URGENCY_PENSION = [
  "secure your super", "your super balance", "preservation age",
  "super fund deadline", "super account suspended",
];

// Fake product-recall SMS lures (D1 / #80 / Amazon campaign May-June 2026).
// Amazon, eBay, Kmart and Big W all have confirmed policies against using SMS
// for product recalls, so "safety recall" in an SMS with a link is essentially
// a confirmed scam signal. "safety review" is kept because it's the softened
// variant used to widen hit-rate.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review",
];

// Tax-time cost-of-living lures (D1/D2/D10 / #73 / ATO-myGov peak season).
// Scammers weaponise real government relief policies as bait. These appear in
// legitimate gov comms too, so they lean on the compound scorer
// (authorityMentions + URL) rather than firing hard on their own.
const URGENCY_TAX = [
  "cost of living payment", "cost of living relief", "cost-of-living supplement",
  "energy rebate", "energy bill relief", "electricity rebate",
  "tax recalculation", "your tax has been recalculated", "compensation payment",
  "government rebate", "tax refund waiting", "refund is waiting",
];

// ATO debt / audit coercion lures (D7 / #124). The threat framing is
// psychologically distinct from the refund lures above and reaches a different
// demographic (business owners, contractors, older Australians) ahead of EOFY
// and the August BAS deadline. The real ATO does contact people about genuine
// debts, so these lean on the compound scorer the same way URGENCY_TAX does —
// an authorityMentions "ato" hit alongside one of these is what escalates.
// "arrest warrant" is deliberately absent: it already lives in
// URGENCY_FOREIGN_AUTHORITY and listing it twice would double-score.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "ato debt",
  "audit notice", "tax audit", "subject to audit",
  "tfn suspended", "tfn cancell", "tax file number suspended",
  "legal action will be taken", "warrant issued", "federal police",
  "your assets will be",
];

// Foreign-authority threat phrases (D3 / #103). AFP May 2026 and Victoria
// Police advisories describe scammers impersonating Chinese police and
// consular officials to threaten Australian residents — particularly
// international students — with arrest or deportation unless a "security
// deposit" is paid. In an AU consumer context these phrases arriving by
// unsolicited SMS have no legitimate use.
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "involved in criminal activity",
];

// myID forced re-registration phishing (D6 / #106). The myGovID → myID rebrand
// spawned a wave of "re-verify your digital identity" lures that deliberately
// omit the word "myid" — so they slip past authorityMentions. These are long,
// specific multi-word phrases, keeping false positives low even where "digital
// identity" appears in legitimate HR/tech copy. Services Australia never sends
// unsolicited re-verification requests.
const IDENTITY_REREG = [
  "re-verify your digital identity", "digital identity verification",
  "your identity verification has expired", "complete your identity verification",
  "myid has been suspended", "set up your new digital identity",
  "migrate to the new digital identity", "myid verification is pending",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
const AUTHORITY_MENTIONS = [
  "ato", "mygov", "centrelink", "medicare", "services australia",
  "afp", "police",
  // ACSC/ASD impersonation (D7 / #55)
  "acsc", "asd", "cyber security centre", "australian signals directorate",
  "cyber.gov.au",
  // ACCC / Scamwatch / NASC impersonation (D5 / #65) — the fraud-reporting
  // authority is itself used as a lure. The ACCC never cold-calls consumers.
  "accc", "scamwatch", "national anti-scam centre", "nasc",
  "consumer watchdog", "competition and consumer commission",
  // Toll operators (D1 / #53) and AusPost parcel lures (D10 / #48)
  "linkt", "eastlink", "e-toll", "etoll", "australia post", "auspost",
  // myGov digital-identity layer rebranding to myID in 2026 (D2 / #73).
  "myid", "my id app",
];

// ATO/myGov/Medicare/Centrelink/Australia Post removed links from their
// unsolicited SMS in 2024 (D1 / #73) — so any link alongside one of these
// senders is a scam. Scoped to the confirmed no-link senders so the flag
// wording stays accurate (toll operators, by contrast, do use links).
const NO_LINK_SENDERS = [
  "ato", "mygov", "myid", "medicare", "centrelink",
  "services australia", "australia post", "auspost",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "chinese police", "beijing police", "shanghai police", "chinese consulate",
  "embassy of china", "chinese customs", "chinese immigration authority",
  "chinese authorities",
];

// AU-specific identifiers and schemes solicited by scammers. These are national
// terms (tax file number, Medicare, BSB, superannuation) with no meaning in
// other markets, so they sit here rather than in the base request list.
const REQUEST_WORDS = [
  "medicare", "tax file number", "tfn", "mygovid", "mygov", "centrelink",
  "ato", "bsb",
  // Superannuation early-access phishing (D3/D4/D11 / #64). "smsf" and "early
  // super release" are AU-specific regulatory terms rarely seen outside a scam.
  "access your super", "unlock your super", "smsf", "self managed super",
  "early super release", "super withdrawal", "superannuation transfer",
  "early access to super",
  // Rental/property bond redirect fraud (D5 / #105) is covered by "bsb" above
  // plus the bond composite, which reads bankIdentifiers. A separate "new bsb"
  // entry would double-score one phrase, since requestWords is substring-matched.
];

// ASIC-regulated products are legally prohibited from being promoted as
// regulator-endorsed, and ASIC never proactively endorses platforms via
// SMS/email — so these are exclusively false-legitimacy claims (D6 / #85).
const REWARD_WORDS = ["verified by asic", "asic-approved"];

const LEGIT_DOMAINS = [
  "gov.au", "ato.gov.au", "mygov.gov.au", "centrelink.gov.au",
  "myhealth.gov.au", "australia.gov.au", "afp.gov.au", "accc.gov.au",
  "scamwatch.gov.au", "cyber.gov.au", "servicesaustralia.gov.au",
  "medicare.gov.au", "abf.gov.au", "homeaffairs.gov.au",
];

// AU crypto exchanges (D6 / #123). The TOAD variant sends "account suspended,
// call support" with a phone number and no link — the same shape as the base
// coinbase/bitcoin entries, so it reuses that signal rather than adding a
// parallel one.
const CALLBACK_BRANDS = ["coinspot", "swyftx", "binance"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — see TYPOSQUAT_WORD below for
// the ones that aren't.
const TYPOSQUAT_BRANDS = [
  "commbank", "westpac", "anz", "nab", "mybank", "mygov", "centrelink",
  "medicare", "paypal", "ebay", "amazon", "netflix", "telstra", "optus", "tpg",
  // Toll operators (D1 / #53) and immigration portals (D14 / #50)
  "linkt", "eastlink", "etoll", "homeaffairs", "dibp", "immi",
  // Food delivery platforms (D6 / #66)
  "doordash", "ubereats", "menulog", "deliveroo",
  // Super funds (D3/D4 / #64)
  "australiansuper", "unisuper", "sunsuper", "cbus", "hesta", "ampsuper",
  // Loyalty programs (D2 / #81) — ACCC Feb 2026 Qantas impersonation alert;
  // top-3 impersonated AU loyalty brands. Already in emailHeaders.ts
  // IMPERSONATED_BRANDS; this closes the URL-checker gap. Real domains end in
  // .com.au, which the trusted-suffix guard already excludes.
  "qantas", "velocity",
  // Energy retailers (D3 / #121). AGL and Origin Energy both have documented
  // AU phishing campaigns; August is peak winter billing season. Bare "agl" is
  // deliberately absent — it lives in the word-boundary list below, because
  // substring matching would score eagle.org, flagler.com and bagelshop.io.
  "originenergy", "energyaustralia", "alintaenergy",
  // Crypto exchanges (D6 / #123). "binance" is long enough to be distinctive.
  "coinspot", "swyftx", "binance",
];

// Brands too short for substring matching in a hostname. Previously excluded
// from detection entirely to dodge the false positives; the word-boundary list
// lets them be caught without the collisions ("agl-billing.com" hits,
// "bagelshop.io" doesn't).
const TYPOSQUAT_WORD_BRANDS = ["agl"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  "doordash", "uber eats", "ubereats", "menulog", "deliveroo",
  "nbn co", "nbnco", "nbn", "national broadband network",
  // Fake-recruiter SMS impersonation (D3 / #82 / Scamwatch June 2026). Amazon
  // does text customers legitimately (medium FP for "amazon" alone); YouTube
  // never cold-recruits by SMS. The jobSignals composite in scamDetector is the
  // stronger signal when the recruiter pattern is present.
  "amazon", "youtube",
  // Energy retailers impersonated in billing/refund SMS scams (D3 / #121).
  // MailGuard documented multi-step Origin Energy "$150 overpayment" and
  // "billing error" campaigns; AGL warns customers about fake-site SMS.
  "origin energy", "originenergy", "energy australia", "energyaustralia",
  "alinta energy",
  // AU crypto exchanges (D6 / #123) — "suspicious login" / "account
  // suspended" credential and 2FA harvesting.
  "coinspot", "swyftx", "binance", "crypto exchange",
];

// "agl" would fire on "bagel", "eagle" and "flagship" as a bare substring.
const BRAND_MENTION_WORDS = ["agl"];

// Names whose genuine mail always comes from a .gov.au / .com.au domain, so a
// mismatched sender domain is textbook impersonation.
const OFFICIAL_SENDER_NAMES = [
  "ato", "mygov", "centrelink", "medicare", "commbank", "westpac", "anz", "nab",
];

// ── Number plan (ACMA) ────────────────────────────────────────────────────────
// Moved here from phoneIntel in Phase 4. libphonenumber handles parsing,
// validity, line type and country for every region; what stays ours is the
// scam-relevant reading of the plan.

// Geographic STD codes → region names.
const AU_STD: Record<string, string> = {
  "02": "New South Wales / ACT",
  "03": "Victoria / Tasmania",
  "07": "Queensland",
  "08": "Western Australia / South Australia / Northern Territory",
};

// 04xx prefixes commonly allocated to VoIP/virtual number providers. Number
// portability makes carrier-level attribution unreliable, but these ranges are
// often used by VoIP MVNOs, burner SIM providers and virtual number services —
// all of which make spoofing trivial.
const AU_VOIP_MOBILE_PREFIXES = [
  "0480", "0481", "0482", "0483", "0484",
  "0485", "0486", "0487", "0488", "0489",
];

export const AU: RegionDefinition = {
  code: "AU",
  name: "Australia",
  coverage: "full",

  urgency: {
    foreignAuthority: URGENCY_FOREIGN_AUTHORITY,
    toll: URGENCY_TOLL,
    parcel: URGENCY_PARCEL,
    utility: URGENCY_UTILITY,
    pension: URGENCY_PENSION,
    recall: URGENCY_RECALL,
    tax: URGENCY_TAX,
    taxThreat: URGENCY_TAX_THREAT,
  },

  authorityMentions: AUTHORITY_MENTIONS,
  noLinkSenders: NO_LINK_SENDERS,
  noLinkSendersFlag:
    "The ATO, myGov, Medicare, Centrelink and Australia Post removed links from their unsolicited SMS messages in 2024 — an SMS from one of these bodies with a clickable link is a scam",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign police or government authority — Chinese police, customs and consulate officials have no law-enforcement powers in Australia and never demand payments, transfers or secrecy. This is a known scam targeting the Chinese-Australian community (AFP warning, May 2026).",

  bankIdentifiers: ["bsb"],

  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "myID/digital-identity re-registration lure — Services Australia and myID never send unsolicited requests to 're-verify' or 'set up' your digital identity. Go to my.gov.au directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — ASIC and Scamwatch have issued specific warnings that this is a scam. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  trustedHostSuffixes: [".gov.au", ".com.au"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  legitDomainFlag: "Verified Australian government domain",
  legitDomainDetails:
    "This looks like a legit Aussie government website. Still be cautious about what you're entering.",

  // ACMA Sender ID register (D2 / #122). Since 1 July 2026 legitimate AU
  // senders must register their SMS Sender ID, so "ignore the Unverified
  // label" is a scam tell — but only in Australia, hence its place here.
  senderIdFlag:
    "'Unverified' label override attempt — since 1 July 2026, legitimate Australian senders must register their SMS Sender ID with ACMA. A message asking you to ignore an 'Unverified' label is almost certainly a scam.",

  reportingBody: "Scamwatch",

  phonePlan: {
    premiumPrefixes: ["0190"],
    premiumFlag:
      "Premium rate number — calling or texting this costs significantly more than a standard call",
    voipMobilePrefixes: AU_VOIP_MOBILE_PREFIXES,
    areaCodes: AU_STD,
    emergencyNumbers: ["000", "112", "106"],
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers pretending to be banks or government — always verify by calling the number from the organisation's official website",
    sharedCostFlag:
      "1300/13xx numbers are commonly faked by scammers pretending to be the ATO, myGov, or Centrelink — verify by calling the number from the government website",
  },

  callbackBrands: CALLBACK_BRANDS,
  // Domestic exchanges; binance/coinbase come from base.
  cryptoExchanges: ["coinspot", "swyftx"],
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
