# Threat Intelligence Roadmap — 2026-07-26

> **Weekly brief for Just Checking, Mate**
> Detection code lives in `lib/`. This file is research-and-proposals only — no `lib/` files are modified here.
> Previous roadmap: `docs/threat-intel/2026-07-01-threat-roadmap.md` (all D1–D13 from that run are now implemented and shipped in PR #69).

---

## (a) Executive Summary — Top 5 Ship-This-Week Changes

Ranked by **impact × ease** (all are string/regex additions to existing functions — no architecture changes required):

| # | Recommendation | Why now |
|---|---|---|
| 1 | **Add `.shop`, `.store`, `.vip`, `.lol`, `.monster` to `SUSPICIOUS_TLDS`** | Previously watchlisted; Barracuda Q1 2026 report + Brandsec AU 2025-2026 analysis now confirm these in the top-10 abuse TLDs reaching Australian users — .shop is the 10th most abused TLD globally and used in active AU fake-retail/subscription campaigns |
| 2 | **Detect TOAD/callback phishing in `checkEmail()`** — fake subscription renewal email (Norton, McAfee, Geek Squad, Coinbase) with a call-back phone number and NO link | Scamwatch issued a dedicated "Fake purchase callback scam" alert (June 2026); these emails bypass all URL-scanner defences because there is no link; current code has no signal for this vector in the email checker |
| 3 | **Add Chinese authority/foreign official impersonation signals** | AFP and Victoria Police issued warnings about surging "zhǐ huī" (authority) scams targeting AU Chinese students via WeChat; median loss ~$55,000; zero detection today in any signal list |
| 4 | **Flag named deepfake investment platforms** (Quantum AI, Immediate Edge, Immediate Connect, Quantum Trade Wave) | ASIC and FCA have issued explicit platform-name warnings; these names have near-zero FP risk and are not yet in the codebase; the generic signals ("guaranteed returns", "verified by asic") already in REWARD_WORDS catch the claims, but not the platform-name lures themselves |
| 5 | **Add rental/property bond "updated bank details" fraud signals** | New campaign specifically intercepting rental communications to redirect bond payments; AU-specific property terminology ("rental bond", "BSB and account") makes this very low FP; not previously covered |

---

## (b) New / Evolved Threats This Week

### T1. TOAD / Callback Phishing — Fake Subscription Renewal Emails (HIGH — Scamwatch alert active)

**What:** Telephone-Oriented Attack Delivery (TOAD) / callback phishing sends a fake email claiming you have been billed for a renewal — common cover brands in AU: Norton Antivirus, McAfee, Geek Squad (Best Buy), DocuSign, Microsoft 365, PayPal, Coinbase. The email contains **no malicious link** — only a prominently displayed phone number and instructions to "call immediately to dispute this charge before funds are debited". When the victim calls, a live scammer impersonates customer support and either:
- (a) steals banking credentials under the guise of "processing a refund", or
- (b) instructs the victim to download AnyDesk or TeamViewer for "verification" (remote access takeover).

**Why it bypasses current detection:** The email variant of TOAD contains no URL, so `checkUrl()` is never called. The `checkEmail()` function calls `checkSms()` for body signals, which only adds +20 for "call back a number" — not enough to reach `likely_scam` on its own. The fake brand names (Norton, McAfee, Geek Squad) are not in any current signal list. The combined pattern of a fake renewal brand + dollar amount + "call to dispute" is the high-confidence signal.

**AU relevance:** Scamwatch published a dedicated "Fake purchase callback scam" alert, noting in Q1 2026 that ~half of all scam losses ($38.3M in Q1 alone) originated through online contact. The Senior (an AU-focused news outlet) specifically reported the Norton/PayPal callback variant targeting older Australians.

**IOCs / patterns:**
- Brand names used as lures: `norton`, `mcafee`, `geek squad`, `best buy`, `docusign`, `coinbase`, `bitcoin` (purchase bait)
- Urgency phrases: `"your subscription has been renewed"`, `"you have been charged"`, `"order confirmation"`, `"renewal notice"`, `"call to cancel"`, `"call to dispute"`, `"invoice #"` followed by a phone number
- Dollar amounts in subject/body: $299–$2,000 range (no reliable regex, but the combo of brand + "call" + amount is high-signal)
- No URL present (or only a PDF invoice attachment link with no actual phishing destination)
- Phone number in body is the only action item

**Proposed detection (see §c, D2 below)**

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-purchase-callback-scams
- https://www.thesenior.com.au/story/9310856/fake-purchase-callback-scam-mimics-norton-and-paypal-bills/
- https://www.malwarebytes.com/blog/threat-intel/2026/06/we-found-this-fake-invoice-campaign-while-scammers-were-still-building-it
- https://www.malwarebytes.com/blog/news/2025/07/microsoft-paypal-docusign-and-geek-squad-faked-in-callback-phishing-scams
- https://keepnetlabs.com/blog/how-toads-are-attacking-businesses-risks-impacts-and-solutions

---

### T2. High-Abuse TLD Escalation — .shop, .store, .vip, .lol, .monster (HIGH — watchlist promoted)

**What:** The previous roadmap (2026-07-01) watchlisted `.store` and `.shop` due to insufficient AU-specific evidence. The Barracuda Networks 2026 Email Threats Report (published Q1 2026) and Brandsec AU's "Top TLD Risk and Abuse Trends in 2025-2026" now provide the evidence needed to promote these to the main `SUSPICIOUS_TLDS` list:

- **`.shop`** — 10th most abused TLD globally (Brandsec 2025-2026); used in AU-targeting fake retail stores and subscription-renewal domains (e.g. `norton-renew[.]shop`, `auspost-track[.]shop`)
- **`.store`** — used for fake e-commerce front stores harvesting payment card details; active in AU-targeting campaigns per Krebs on Security (Dec 2024, still trending)
- **`.vip`** — in top-10 abuse TLDs in APWG reports; used as a prestige-signalling domain in pig-butchering investment funnels (e.g. `trading-vip[.]vip`, `investment-club[.]vip`)
- **`.lol`** and **`.monster`** — new cheap ICANN TLDs heavily weaponised since late 2025; abuse rate >60% at launch (CSC DBS research); used in ClickFix-adjacent campaigns

**AU relevance:** Krebs explicitly calls .shop a favourite for impersonating Australian retail brands. The Brandsec report is Australia-specific. `.vip` appears in multiple AU pig-butchering cases in Scamwatch 2026 data.

**Current gap:** `SUSPICIOUS_TLDS` in `lib/scamDetector.ts` (line 171) includes `.tk`, `.ml`, `.xyz`, `.cyou`, `.sbs`, `.cfd`, `.bar`, `.beauty`, `.hair`, `.makeup`, `.pn`, `.zip`, `.mov`, `.lat` — but not `.shop`, `.store`, `.vip`, `.lol`, or `.monster`.

**Sources:**
- https://www.barracuda.com/reports/2026-email-threats-report
- https://www.brandsec.com.au/top-tld-risk-and-abuse-trends-in-2025-2026/
- https://krebsonsecurity.com/2024/12/why-phishers-love-new-tlds-like-shop-top-and-xyz/
- https://www.cscdbs.com/blog/the-highest-threat-tlds-part-1/

---

### T3. Chinese Authority / Foreign Official Impersonation — Diaspora Targeting (HIGH — AU Police alerts)

**What:** A persistent and escalating scam targets members of the Chinese-Australian community — particularly international students — via WeChat, phone, and email. Scammers impersonate:
1. **Chinese police officers** — claiming the victim is "wanted for questioning" or has been named in a money-laundering investigation in China
2. **Chinese consulate officials** — claiming the victim's visa or residency status is at risk
3. **Chinese health insurance / government departments** — used as an entry point before escalating to the police impersonation

Victims are told they must pay "security deposits", "bail bonds", or wire funds to "clear their name", under strict secrecy ("do not tell anyone or your case will be escalated"). Average reported loss is ~$55,000. The AFP (May 2026) and Victoria Police both issued dedicated warnings. The scam is conducted primarily via WeChat but the follow-up payment instructions arrive via SMS, email, and phone.

**AU relevance:** Australia-only context. International student population (~750,000 in 2026) and large Chinese-Australian community are the primary targets. AFP press release (May 8, 2026) documents two specific cases in Sydney within a single week.

**Current gap:** `govMentions` in `checkSms()` includes "afp", "police", "acsc", "asd", "accc", "scamwatch" — but none of the **foreign authority** impersonation signals. A message claiming to be from "Chinese police" or "Beijing police" is unambiguously a scam when received in Australia.

**IOCs / patterns:**
- Sender claims: `"chinese police"`, `"beijing police"`, `"shanghai police"`, `"chinese authorities"`, `"chinese consulate"`, `"embassy of china"`, `"chinese customs"`, `"chinese immigration"`
- Threat phrases: `"arrest warrant"`, `"detention order"`, `"money laundering investigation"`, `"your visa will be cancelled"`, `"deportation notice"`, `"involved in criminal activity in china"`
- Secrecy instructions (already partly covered by `URGENCY_VOICE_CLONE`): `"do not tell anyone"`, `"contact no one"`
- Payment request: wire transfer or crypto to "clear your name"

**Sources:**
- https://afp.gov.au/news-centre/media-release/scam-warning-complex-scams-targeting-australian-public-and-international
- https://www.police.vic.gov.au/scams-targeting-mandarin-speaking-community
- https://www.scamwatch.gov.au/types-of-scams/threat-scams/chinese-authority-scams

---

### T4. Named Deepfake Investment Platforms — Quantum AI, Immediate Edge, etc. (HIGH — ASIC/FCA named alerts)

**What:** ASIC and the UK FCA have issued named warnings about specific fraudulent AI trading platforms that are actively promoted to Australians via AI-generated deepfake video ads on Facebook and Instagram, featuring cloned voices and likenesses of Andrew Forrest, Gina Rinehart, Rebel Wilson, Chris Hemsworth, and Robert Irwin. These platforms share a common playbook: initial "test deposit" of ~$250, a fabricated profit dashboard, then withdrawal blocked pending "tax payment" or "compliance fee".

**Named platforms (confirmed by ASIC/Scamwatch):**
- `Quantum AI` / `Quantum Trade AI`
- `Immediate Edge`
- `Immediate Connect`
- `Immediate X3`
- `Quantum Trade Wave`
- `Bitcoin Era` / `Bitcoin Trader`

**Current gap:** `REWARD_WORDS` already contains `"guaranteed returns"`, `"risk-free investment"`, `"double your money"`, `"verified by asic"`, `"asic-approved"` — excellent generic signals. However the **platform names themselves** are not present. A user pasting "I saw a Quantum AI ad featuring Andrew Forrest — is it real?" would score only 5-10 today. These platform names have extremely low FP risk (nobody legitimately discusses these names without it being scam-related).

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-celebrity-online-investment-scams
- https://financefraudmonitor.com/quantum-ai/
- https://fraudbrokers.net/quantum-ai/
- https://bluntmag.com.au/gaming/ai-deepfake-crypto-scams-2026
- https://www.accc.gov.au/media-release/its-a-scam-celebrities-are-not-getting-rich-from-online-investment-trading-platforms
- https://securitybrief.com.au/story/ai-deepfakes-fuel-rise-in-celebrity-scam-losses-for-australians

---

### T5. Rental / Property Bond "Updated Bank Details" Fraud (MEDIUM — active AU campaign)

**What:** Scammers intercept or impersonate real estate agencies and property managers, sending emails or texts claiming the landlord/agency has "updated their bank account details" and directing tenants to deposit bond, rent, or holding deposits to a new BSB/account number. The Residential Tenancies Authority (QLD) and multiple state consumer protection agencies have issued alerts. Western Australia recorded 20 victims losing $51,000+ in 2025, with continued escalation in 2026.

**Two entry points:**
1. **Email impersonation** — scammer sends an email impersonating the real estate agency with "updated payment details" just before the bond due date
2. **SMS variant** — "Your property application was successful. Please transfer the bond to the following NEW account: BSB XXX-XXX Acc XXXXXXXX"

**Current gap:** `"bank details"` and `"bsb"` are in `REQUEST_WORDS` — excellent baseline. However, the rental-specific context phrases are not present: `"rental bond"`, `"holding deposit"`, `"lease agreement"`, `"property manager"`, `"updated bank details"` (the "updated" qualifier combined with a bank account ask is the unique high-signal pattern in this scam — legitimate comms change bank details very rarely and never under time pressure).

**Sources:**
- https://www.rta.qld.gov.au/before-renting/choosing-a-rental-property/rental-scams
- https://flagmylisting.com/platforms/realestate-com-au
- https://horizonbank.com.au/blog/blog-article/how-to-protect-yourself-from-rental-scams/

---

### T6. myID "Re-Registration" / "Account Migration" Phishing (MEDIUM — evolving from watchlist)

**What:** The myGovID → myID rebrand (confirmed complete mid-2024) has sustained a wave of phishing emails and SMS claiming that users must "set up a new myID", "re-verify their digital identity", or that their "myID has been suspended". The Biometric Update (May 2026) documented that the AU Credential Register blocked 750,000 fraudulent ID checks post-Optus breach — many using stolen myGov credentials obtained via these phishing campaigns.

**Current state:** `"myid"` and `"my id app"` are present in `govMentions` (line 492, `scamDetector.ts`) — so any SMS mentioning "myid" already triggers the government agency flag (+25). However, the specific **re-registration** phishing variant uses phrases that don't say "myid" alone — they say "re-verify your digital identity", "your identity verification has expired", "action required to keep your myGov access" (without explicitly saying "myid"). These bypass the current pattern.

**IOCs / patterns:**
- `"re-verify your digital identity"`, `"your identity verification has expired"`
- `"you must complete identity verification by"` (false deadline)
- `"myid has been suspended"`, `"myid account suspended"`
- `"set up your new digital identity"`, `"migrate to the new digital identity system"`
- `"your myid verification is pending"`, `"complete your myid verification"`

**Sources:**
- https://www.biometricupdate.com/202411/scammers-capitalize-on-australias-myid-rebrand
- https://www.biometricupdate.com/202605/australia-credential-register-blocks-750000-fraudulent-id-checks-post-optus-breach
- https://www.myid.gov.au/security-and-privacy/how-to-verify-or-report-a-scam
- https://accountantbusiness.com.au/protect-yourself-from-myid-scams/

---

### T7. PDF-Embedded QR Code "Scanception" Attacks (MEDIUM — escalating in email channel)

**What:** Attackers embed QR codes inside PDF attachments to bypass email security filters (which can't scan images inside PDFs). The PDF appears to be a legitimate invoice, parcel notification, or HR document — and the embedded QR code redirects to a credential-harvest page with real-time MFA bypass (AiTM proxy). Microsoft's Q1 2026 threat data found QR-in-email attacks rose 146% in Q1, reaching their highest volume in at least a year.

**Current coverage assessment:** `checkEmail()` calls `checkSms()`, which already contains the QR scan prompt regex (line 416: `scan\s+(the\s+|this\s+)?(qr\s*code|code)\s*(to|and)?`). This catches cases where the QR prompt is in the email *body text*. The PDF-embedded variant's only text-side signal is if the email body says something like "see the attached PDF and scan the QR code to verify" — which the existing regex would catch. The gap is when the body text is generic ("please find attached") and all the QR content is inside the PDF itself — no text-side detection possible.

**Recommendation:** No new detection rule possible for the pure PDF-only case. However, adding `"scan the qr code in the attached"` and `"attachment contains a qr code"` to the existing QR prompt check in `checkSms()` (which feeds `checkEmail()`) would catch the hybrid case where the body references the PDF QR. Low-effort improvement, modest gain.

**Sources:**
- https://cybersecuritynews.com/new-qr-code-attack-via-pdfs/
- https://www.barracuda.com/reports/2026-email-threats-report
- https://www.thehackacademy.com/news/qr-code-phishing-surges-as-microsoft-detects-8-3-billion-email-threats-in-q1-2026/

---

### T8. SIM Swap / Phone Porting Fraud — Escalation Alert (LOW — no text-side signal, watchlist)

**What:** IDCARE reported a 240% increase in SIM-swap/phone-porting cases in 2024 vs 2023, continuing into 2026. Criminals socially-engineer telco customer service staff to port the victim's number to a SIM they control, then intercept SMS 2FA codes to drain bank accounts. The Scamwatch mobile fraud alert (June 2026) specifically names this as an active threat.

**Detectability:** Still very limited. SIM swap is a carrier-side attack — the victim's phone simply loses signal. No incoming SMS can be scanned because the victim's number has been ported. The only text-side signal would be a *preparatory* SMS sent to build a pretext (e.g. "Telstra: confirm your account to process your number transfer request" — a fake message used to extract a one-time code). This preparatory SMS would be caught by the existing `brandMentions` check ("telstra", "optus") combined with `REQUEST_WORDS` ("confirm identity", "account number").

**Action:** No new rule needed — existing brand + request word detection covers the known preparatory SMS variant. Watchlist only.

**Sources:**
- https://www.choice.com.au/electronics-and-technology/phones/mobile-phones/articles/sim-swap-and-phone-porting-scams
- https://www.idcare.org/learning-centre/newsletters/hijacked-connections-the-reality-of-phone-porting-and-sim-swap-scams
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-watch-out-for-mobile-fraud

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | FP Risk | Priority |
|---|--------|---------------|-------------|---------|----------|
| D1 | High-abuse TLD escalation (.shop, .store, .vip, .lol, .monster) | Add all five to `SUSPICIOUS_TLDS` constant near line 171 of `scamDetector.ts`: `".shop", ".store", ".vip", ".lol", ".monster"` — same logic as existing TLD suffix check; each scores +30 | `lib/scamDetector.ts` | Low-Medium — `.shop` and `.store` have some legitimate e-commerce use, but FP is mitigated by the compound scorer; `.vip`, `.lol`, `.monster` have near-zero legitimate consumer use | HIGH |
| D2 | TOAD/callback phishing — fake subscription email (Norton, McAfee, Geek Squad, Coinbase) | In `checkEmail()` (after the device-code block), add a new `callbackPhishing` detection block: match 2+ of these brand names (`"norton"`, `"mcafee"`, `"geek squad"`, `"best buy"`, `"coinbase"`, `"docusign"`) OR a high-value dollar amount pattern (`/\$[3-9]\d{2,}|\$[1-9]\d{3,}/`) AND ("call" within context of "dispute" or "cancel") AND no URL present → flag `"Fake subscription callback scam — this looks like a fraudulent invoice designed to make you call a scammer; no legitimate company sends invoices this way"` (+40) | `lib/scamDetector.ts` | Low — the no-URL + fake-brand + call-to-dispute combination is highly specific; "norton" alone in a security newsletter won't trigger because the compound requires additional signals | HIGH |
| D3 | Chinese authority/foreign official impersonation | Add to `govMentions` array (near line 482): `"chinese police"`, `"beijing police"`, `"shanghai police"`, `"chinese consulate"`, `"embassy of china"`, `"chinese customs"`, `"chinese immigration authority"`, `"chinese authorities"`. Also add to `URGENCY_WORDS`: `"arrest warrant"`, `"detention order"`, `"deportation notice"` (note: these three phrases should be scoped carefully — they're rare enough in AU legitimate comms that FP risk is very low) | `lib/scamDetector.ts` | Low — "chinese police" in a message received by someone in Australia has essentially zero legitimate use; "arrest warrant" in an SMS is very high-signal | HIGH |
| D4 | Named deepfake investment platforms | Add a new `FAKE_INVESTMENT_PLATFORMS` constant and check in `checkSms()` / `checkEmail()` / `checkCustom()`: `["quantum ai", "quantum trade ai", "immediate edge", "immediate connect", "immediate x3", "quantum trade wave", "bitcoin era", "bitcoin trader"]` — if any name is found, flag `"Named fraudulent investment platform — ASIC and Scamwatch have issued specific warnings about this platform; it is not a legitimate investment service"` (+50). Score should be high because these names have near-zero false-positive risk | `lib/scamDetector.ts` | Very low — ASIC and FCA have officially named and warned against exactly these platforms; encountering them in any message is a confirmed scam signal | HIGH |
| D5 | Rental / property bond "updated bank details" fraud | Add to `URGENCY_WORDS` or a new `URGENCY_PROPERTY` sub-list: `"rental bond"`, `"holding deposit"`, `"lease agreement"` (as compound triggers). Add to `REQUEST_WORDS`: `"updated bank details"`, `"new account details"`, `"changed bank account"`, `"new bsb"` — these already compound with the existing `"bank details"` and `"bsb"` signals but the "updated" + rental context phrases are missing. Optionally add a composite: if `"rental bond"` OR `"holding deposit"` appears with `"bsb"` or `"bank details"`, score +25 additional | `lib/scamDetector.ts` | Low — "updated bank details" in context with a rental/property term is a highly specific scam signal; "rental bond" alone is not scored, only in compound | HIGH |
| D6 | myID re-registration / identity verification phishing phrases | Add to `govMentions` (complementing the existing `"myid"` entry): `"re-verify your digital identity"`, `"digital identity verification"`, `"your identity verification has expired"`, `"complete your identity verification"`, `"myid has been suspended"`, `"set up your new digital identity"`. These trigger the existing +25 gov-agency flag and the no-link-from-gov-bodies secondary flag where appropriate | `lib/scamDetector.ts` | Low-Medium — "digital identity verification" could appear in legitimate HR/onboarding contexts; mitigated by the compound model (only scores high when combined with a link or urgency signal) | MEDIUM |
| D7 | PDF + QR code hybrid body signal | In the QR scan prompt regex block in `checkSms()` (lines 416-420), extend with: `\bscan\s+the\s+qr\s*(code)?\s+in\s+the\s+(attached|attachment|pdf)\b` and `\battachment\s+contains\s+a\s+qr\s+code\b` — catches the body-text version of PDF-embedded quishing where the author mentions the PDF | `lib/scamDetector.ts` | Low — very specific phrasing | MEDIUM |

---

## (d) Lower-Priority / Watchlist Items

- **SIM swap fraud** — No text-side detection opportunity. Existing `brandMentions` (Telstra, Optus) + `REQUEST_WORDS` already cover the known preparatory-SMS variant. Watchlist only.

- **TOAD with AI voice synthesis (enterprise-grade)** — Large-scale enterprise TOAD attacks now use real-time AI voice synthesis to impersonate specific internal people (CFO voice-clone for wire transfer approvals). Consumer-facing AU text/SMS equivalent not yet confirmed at scale. Monitor ACSC advisories.

- **F5 / Fortinet credential-stuffing** (ACSC July 9 advisory) — Infrastructure-level attack on business VPNs. Not detectable via consumer-paste-based text analysis. Out of scope.

- **Fake real estate document theft** (property inspection → lease → bond fraud) — Multi-stage; only the bond-payment step is detectable (covered by D5 above). Earlier stages (fake inspection booking links) already caught by URL checker's suspicious TLD and brand-impersonation rules.

- **LINE / KakaoTalk pig-butchering funnels** — Mentioned in Q2 2026 reporting. Watchlisted from 2026-07-01 roadmap, still insufficient AU-specific evidence to add platform names without FP risk. The two-signal `investmentGroupSignals` composite already catches the post-contact messaging.

- **ICANN 2026 new gTLD window** — New TLDs from the 2026 round won't resolve until late 2026/2027. Monitor for `.sucks`, `.cheap`, `.buy` etc. appearing in AU-targeting campaigns post-launch.

- **Deepfake video scams (text-detection gap)** — Platform names (D4 above) are now added, but video-only deepfake distribution has no text-side signal. Addressed through D4's platform-name detection as the user-input proxy.

- **cPanel/WebHost CVE-2026-4194** (ACSC critical, July 2026) — Exploited for web-server compromise, not consumer phishing. Out of scope.

---

## (e) Full Source List

1. Scamwatch — Fake purchase callback scam alert: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-purchase-callback-scams
2. The Senior AU — Norton/PayPal callback scam: https://www.thesenior.com.au/story/9310856/fake-purchase-callback-scam-mimics-norton-and-paypal-calls/
3. Malwarebytes — Fake invoice campaign (June 2026): https://www.malwarebytes.com/blog/threat-intel/2026/06/we-found-this-fake-invoice-campaign-while-scammers-were-still-building-it
4. Malwarebytes — Microsoft/PayPal/DocuSign/Geek Squad callback phishing: https://www.malwarebytes.com/blog/news/2025/07/microsoft-paypal-docusign-and-geek-squad-faked-in-callback-phishing-scams
5. Keepnet Labs — TOAD attack explainer: https://keepnetlabs.com/blog/how-toads-are-attacking-businesses-risks-impacts-and-solutions
6. Latitude Financial — April-June 2026 scam hub: https://www.latitudefinancial.com.au/scams-hub/april-june-2026.html
7. Barracuda — 2026 Email Threats Report: https://www.barracuda.com/reports/2026-email-threats-report
8. Brandsec AU — Top TLD Risk and Abuse Trends 2025-2026: https://www.brandsec.com.au/top-tld-risk-and-abuse-trends-in-2025-2026/
9. Krebs on Security — Why phishers love .shop, .top, .xyz: https://krebsonsecurity.com/2024/12/why-phishers-love-new-tlds-like-shop-top-and-xyz/
10. CSC DBS — Highest threat TLDs part 1: https://www.cscdbs.com/blog/the-highest-threat-tlds-part-1/
11. Security Brief AU — New TLDs and phishing risk: https://securitybrief.com.au/story/new-tlds-and-phishing-risk-what-security-teams-should-know
12. AFP — Scam warning targeting Chinese community / international students: https://afp.gov.au/news-centre/media-release/scam-warning-complex-scams-targeting-australian-public-and-international
13. Victoria Police — Fake authority scams targeting Mandarin-speaking community: https://www.police.vic.gov.au/scams-targeting-mandarin-speaking-community
14. Scamwatch — Chinese authority scams: https://www.scamwatch.gov.au/types-of-scams/threat-scams/chinese-authority-scams
15. Scamwatch — Fake celebrity online investment scams: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-celebrity-online-investment-scams
16. Finance Fraud Monitor — Quantum AI review/warnings: https://financefraudmonitor.com/quantum-ai/
17. FraudBrokers — Quantum AI ASIC/FCA warnings 2026: https://fraudbrokers.net/quantum-ai/
18. ACCC — Celebrities not getting rich from investment platforms: https://www.accc.gov.au/media-release/its-a-scam-celebrities-are-not-getting-rich-from-online-investment-trading-platforms
19. Security Brief AU — AI deepfakes fuel celebrity scam losses: https://securitybrief.com.au/story/ai-deepfakes-fuel-rise-in-celebrity-scam-losses-for-australians
20. Blunt Magazine AU — AI deepfake crypto scams 2026: https://bluntmag.com.au/gaming/ai-deepfake-crypto-scams-2026
21. RTA Queensland — Rental scams: https://www.rta.qld.gov.au/before-renting/choosing-a-rental-property/rental-scams
22. FlagMyListing — realestate.com.au rental scams 2026: https://flagmylisting.com/platforms/realestate-com-au
23. Horizon Bank AU — Protect yourself from rental scams: https://horizonbank.com.au/blog/blog-article/how-to-protect-yourself-from-rental-scams/
24. Biometric Update — Scammers capitalise on AU myID rebrand: https://www.biometricupdate.com/202411/scammers-capitalize-on-australias-myid-rebrand
25. Biometric Update — AU credential register blocks 750k fraudulent ID checks: https://www.biometricupdate.com/202605/australia-credential-register-blocks-750000-fraudulent-id-checks-post-optus-breach
26. myID — How to verify or report a scam: https://www.myid.gov.au/security-and-privacy/how-to-verify-or-report-a-scam
27. CyberSecurity News — QR code attack via PDFs: https://cybersecuritynews.com/new-qr-code-attack-via-pdfs/
28. The Hack Academy — Microsoft detects 8.3B threats, QR surge 146%: https://www.thehackacademy.com/news/qr-code-phishing-surges-as-microsoft-detects-8-3-billion-email-threats-in-q1-2026/
29. CHOICE — SIM swap and phone porting scams: https://www.choice.com.au/electronics-and-technology/phones/mobile-phones/articles/sim-swap-and-phone-porting-scams
30. IDCARE — Phone porting and SIM swap reality: https://www.idcare.org/learning-centre/newsletters/hijacked-connections-the-reality-of-phone-porting-and-sim-swap-scams
31. Jam Cyber — Monthly Cyber Brief July 2026: https://jamcyber.com/blog/cyber-insights/july-2026-cyber-brief/
32. Cyber.gov.au — Alerts and advisories: https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories
33. CommBank — Warning on impersonation scams (March 2026): https://www.commbank.com.au/articles/newsroom/2026/03/warning-as-impersonation-scams-become-more-sophisticated.html

---

## Issues to Open Manually

> GitHub issue creation via MCP tools — see below for the 6 HIGH-priority issue bodies.

---

### Issue A: [threat-intel] Add .shop, .store, .vip, .lol, .monster to SUSPICIOUS_TLDS

**Title:** `[threat-intel] Add .shop, .store, .vip, .lol, .monster to SUSPICIOUS_TLDS`

**Body:**

**Summary:** Previously watchlisted in 2026-07-01 roadmap. Now promoted to HIGH priority based on Barracuda's 2026 Email Threats Report and Brandsec AU's 2025-2026 TLD abuse analysis. These five TLDs are now confirmed in the top-10 globally abused TLDs reaching Australian users.

| TLD | Evidence |
|-----|----------|
| `.shop` | 10th most abused TLD globally (Brandsec 2025-26); AU fake-retail and subscription-renewal campaigns (e.g. `norton-renew.shop`, `auspost-track.shop`) |
| `.store` | Used in fake e-commerce card-harvest stores; active in AU-targeting campaigns (Krebs, Dec 2024, still trending) |
| `.vip` | Top-10 abuse TLDs (APWG reports); used as prestige signal in AU pig-butchering funnels |
| `.lol` | New cheap ICANN TLD, >60% abuse rate at launch (CSC DBS); used in ClickFix-adjacent campaigns |
| `.monster` | Same cohort as `.lol`; used in credential-harvest campaigns targeting AU users |

**Proposed change to `lib/scamDetector.ts` — `SUSPICIOUS_TLDS` constant (near line 171):**

```typescript
// High-abuse 2026 TLDs promoted from watchlist (2026-07-26 roadmap).
// .shop and .store are 10th-most-abused globally (Brandsec AU 2025-2026);
// .vip appears in top-10 APWG abuse charts and AU pig-butchering funnels;
// .lol and .monster are new ICANN TLDs with >60% abuse rate at launch.
".shop", ".store", ".vip", ".lol", ".monster",
```

These slot directly into the existing `SUSPICIOUS_TLDS` array and are picked up by the existing `tldMatch` suffix-check loop in `checkUrl()` at +30 score, same as the other suspicious TLDs.

**False-positive risk:** Low-Medium for `.shop` and `.store` (legitimate e-commerce), mitigated by compound scoring — a `.shop` domain on its own won't reach `likely_scam` without other signals. `.vip`, `.lol`, `.monster` — near-zero legitimate AU consumer use.

**Sources:**
- https://www.brandsec.com.au/top-tld-risk-and-abuse-trends-in-2025-2026/
- https://www.barracuda.com/reports/2026-email-threats-report
- https://krebsonsecurity.com/2024/12/why-phishers-love-new-tlds-like-shop-top-and-xyz/

**Roadmap:** `docs/threat-intel/2026-07-26-threat-roadmap.md` (D1)

---

### Issue B: [threat-intel] Detect TOAD/callback phishing — fake subscription email with no link

**Title:** `[threat-intel] Detect TOAD callback phishing: fake Norton/McAfee/Geek Squad/Coinbase invoice email`

**Body:**

**Summary:** Telephone-Oriented Attack Delivery (TOAD) callback phishing is now among the top email threat vectors per Barracuda 2026 and Malwarebytes June 2026 analysis. Scamwatch issued a dedicated "Fake purchase callback scam" alert. The attack emails contain **no malicious URL** — only a fake invoice and a phone number. Existing URL-based detection fires on nothing; the only current signal is the weak "call back a number" match (+20) in `checkSms()`. This is insufficient to reach `likely_scam` and doesn't address the email-checker path.

**Cover brands confirmed in AU campaigns:** Norton, McAfee, Geek Squad (Best Buy), DocuSign, Microsoft (renewal), PayPal, Coinbase, Bitcoin (fake purchase).

**Proposed change to `lib/scamDetector.ts` — in `checkEmail()`, after the `deviceCodeHit` block:**

```typescript
// TOAD/callback phishing — fake subscription or purchase email with a
// phone number to call. No link is present; the scam happens on the
// phone. Cover brands confirmed in AU Scamwatch alert (June 2026).
// Require ≥2 signals so a legitimate Norton-related newsletter doesn't fire.
const CALLBACK_BRANDS = [
  "norton", "mcafee", "geek squad", "best buy", "docusign",
  "coinbase", "bitcoin", "geeksquad",
];
const callbackBrandHits = CALLBACK_BRANDS.filter((b) => lower.includes(b)).length;
const hasCallToDispute =
  /call\s.{0,20}(dispute|cancel|reverse|refund|unauthori[sz]ed)/i.test(text) ||
  /to\s+(dispute|cancel|reverse)\s+(this|the)\s+(charge|payment|order|invoice)/i.test(text);
const hasLargeAmount = /\$\s*[3-9]\d{2}|\$\s*[1-9]\d{3}/.test(text);
const hasNoUrl = !/https?:\/\//i.test(text);

if (callbackBrandHits >= 1 && hasCallToDispute && hasLargeAmount && hasNoUrl) {
  flags.push(
    "Fake subscription callback scam — this looks like a fraudulent invoice designed to make you call a scammer. No legitimate company sends a billing dispute this way. Do not call the number."
  );
  score += 40;
} else if (callbackBrandHits >= 2 && hasCallToDispute) {
  flags.push(
    "Possible fake invoice callback scam — multiple fake subscription brand names combined with a call-to-dispute pattern."
  );
  score += 25;
}
```

**False-positive risk:** Low. The compound `callbackBrandHits >= 1 && hasCallToDispute && hasLargeAmount && hasNoUrl` is very specific. A legitimate Norton renewal email would contain a link to the Norton website, so `hasNoUrl` would be false.

**Example IOC emails:**
- Subject: `"Your Norton Antivirus subscription has been renewed — $349.99 has been charged to your account. Call 1-800-XXX-XXXX to cancel."`
- Subject: `"McAfee invoice #INV-0024819: You have been billed $299. To dispute, call immediately."`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-purchase-callback-scams
- https://www.malwarebytes.com/blog/threat-intel/2026/06/we-found-this-fake-invoice-campaign-while-scammers-were-still-building-it

**Roadmap:** `docs/threat-intel/2026-07-26-threat-roadmap.md` (D2)

---

### Issue C: [threat-intel] Detect Chinese authority/foreign official impersonation (diaspora targeting)

**Title:** `[threat-intel] Detect Chinese authority and foreign official impersonation scams targeting AU diaspora`

**Body:**

**Summary:** AFP (May 8, 2026) and Victoria Police issued dedicated warnings about scams targeting the Chinese-Australian community — particularly international students. Scammers impersonate Chinese police, consulate officials, and Chinese government departments via WeChat and phone, claiming victims are under investigation for money laundering or have an "arrest warrant" issued in China. Median loss reported by IDCARE for culturally and linguistically diverse victims: ~$55,000. Currently no signals for foreign-authority impersonation in any `govMentions` or related list.

**Proposed change to `lib/scamDetector.ts` — `govMentions` array in `checkSms()` (near line 482):**

```typescript
// Foreign authority impersonation targeting AU Chinese community (D3 / 2026-07-26
// roadmap). AFP May 2026 advisory. Chinese police NEVER have jurisdiction over
// people in Australia; any message claiming authority from a foreign police
// force is a scam.
"chinese police", "beijing police", "shanghai police", "chinese consulate",
"embassy of china", "chinese customs", "chinese immigration authority",
"chinese authorities",
```

**Also add to `URGENCY_WORDS` (or a new `URGENCY_FOREIGN_AUTHORITY` sub-group):**

```typescript
// Foreign-authority threat scam urgency phrases. "Arrest warrant" and
// "detention order" received via SMS or unsolicited call are unambiguous
// scam signals in an Australian consumer context.
"arrest warrant", "detention order", "deportation notice",
"money laundering investigation", "your visa will be cancelled",
"involved in criminal activity",
```

**Note:** `"arrest warrant"` and `"deportation notice"` are AU-specific enough (no legitimate institution sends these via SMS) that FP risk is very low. Consider higher-than-standard scoring (+35 for the foreign authority name match vs. normal +25 for govMentions).

**Sources:**
- https://afp.gov.au/news-centre/media-release/scam-warning-complex-scams-targeting-australian-public-and-international
- https://www.police.vic.gov.au/scams-targeting-mandarin-speaking-community
- https://www.scamwatch.gov.au/types-of-scams/threat-scams/chinese-authority-scams

**Roadmap:** `docs/threat-intel/2026-07-26-threat-roadmap.md` (D3)

---

### Issue D: [threat-intel] Flag named deepfake investment platforms (Quantum AI, Immediate Edge, etc.)

**Title:** `[threat-intel] Flag named fraudulent AI trading platforms confirmed by ASIC and Scamwatch`

**Body:**

**Summary:** ASIC and Scamwatch have issued explicit named warnings about specific fraudulent "AI trading platforms" used in deepfake celebrity investment scam campaigns targeting Australians. The platforms use deepfake videos of Andrew Forrest, Gina Rinehart, Rebel Wilson, and others. Current `REWARD_WORDS` catches the generic claims ("guaranteed returns", "verified by asic") but not the platform names — which are near-zero FP and would catch users pasting ad text, WhatsApp invitations, or platform URLs.

**Confirmed fraudulent platform names (ASIC/Scamwatch/FCA named):**
- Quantum AI / Quantum Trade AI
- Immediate Edge
- Immediate Connect
- Immediate X3
- Quantum Trade Wave
- Bitcoin Era / Bitcoin Trader

**Proposed change to `lib/scamDetector.ts` — add a new constant and check in `checkSms()`, `checkEmail()`, `checkCustom()`:**

```typescript
// Named fraudulent AI trading platforms — ASIC (media release 26-063MR) and
// Scamwatch have explicitly named these as fraudulent investment scams. No
// false-positive use case exists for these names in consumer contexts.
const FAKE_INVESTMENT_PLATFORMS = [
  "quantum ai", "quantum trade ai", "quantum trade wave",
  "immediate edge", "immediate connect", "immediate x3",
  "bitcoin era", "bitcoin trader",
];
```

Detection in `checkSms()` (and similarly in `checkCustom()`):

```typescript
const platformHit = FAKE_INVESTMENT_PLATFORMS.find((p) => lower.includes(p));
if (platformHit) {
  flags.push(
    `Named fraudulent investment platform detected ("${platformHit}") — ASIC and Scamwatch have issued specific warnings that this is a scam. Do not invest.`
  );
  score += 50;
}
```

**False-positive risk:** Very low. ASIC has officially deregistered/warned against each of these exact names. Nobody encounters "Quantum AI" or "Immediate Edge" in a legitimate AU financial context.

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-celebrity-online-investment-scams
- https://fraudbrokers.net/quantum-ai/
- https://financefraudmonitor.com/quantum-ai/

**Roadmap:** `docs/threat-intel/2026-07-26-threat-roadmap.md` (D4)

---

### Issue E: [threat-intel] Detect rental/property bond "updated bank details" fraud

**Title:** `[threat-intel] Detect rental bond payment fraud — "updated bank details" redirect scam`

**Body:**

**Summary:** Scammers intercept or impersonate real estate agency communications, contacting tenants with "updated bank account details" just before a bond or rent payment is due. 20 WA victims lost $51,000+ in 2025; trend continues in 2026. The key signal is `"updated bank details"` or `"new account details"` in a rental/property context — real estate agencies change bank details very rarely, and never under time pressure. The existing `"bsb"` and `"bank details"` in `REQUEST_WORDS` partially cover this but miss the rental-specific context and the distinctive "updated" qualifier.

**Proposed change to `lib/scamDetector.ts`:**

1. Add to `REQUEST_WORDS` (the "updated" phrasing is the distinctive scam signal):
```typescript
// Rental/property bond fraud (2026-07-26 roadmap). "Updated bank details"
// in a rental context is the unique high-signal phrase — legitimate agencies
// rarely change payment details and never under time pressure via SMS.
"updated bank details", "new account details", "changed bank account",
"new bsb", "rental bond", "holding deposit",
```

2. Optionally add a composite rule in `checkSms()` near the existing `requestHits` block: if `("rental bond" OR "holding deposit" OR "lease" OR "property") AND ("bsb" OR "bank details" OR "account number")` both fire, add an extra `+25` with flag `"Property bond fraud pattern — scammers intercept rental communications to redirect bond payments to their own accounts; always verify bank detail changes by calling the agency on a number from their official website"`.

**False-positive risk:** Low. "Updated bank details" combined with a rental term is a very specific combination that doesn't appear in legitimate correspondence without a verifiable account-change process. The standalone phrases ("rental bond" alone) would need compound signals to score high.

**Example IOC messages:**
- `"Hi, please note our agency has updated our bank details for bond collection. New BSB: 062-111 Acc: 12345678. Please transfer your $4,200 bond today."`
- `"Your tenancy application was approved. Please pay holding deposit $500 to our NEW account (details changed last week): BSB 012-345 Acc 987654321."`

**Sources:**
- https://www.rta.qld.gov.au/before-renting/choosing-a-rental-property/rental-scams
- https://flagmylisting.com/platforms/realestate-com-au

**Roadmap:** `docs/threat-intel/2026-07-26-threat-roadmap.md` (D5)

---

### Issue F: [threat-intel] Add myID re-registration / forced re-verify phishing phrases to govMentions

**Title:** `[threat-intel] Add myID forced re-registration phishing phrases to govMentions`

**Body:**

**Summary:** The myGovID → myID rebrand created a persistent phishing wave where scammers send messages saying users must "set up a new myID", "re-verify your digital identity", or that their "myID has been suspended". The AU Credential Register blocked 750,000 fraudulent ID checks in the 12 months post-Optus breach (Biometric Update, May 2026). Currently `"myid"` and `"my id app"` are in `govMentions`, but the re-registration variant often omits "myid" entirely — saying "digital identity" or "your identity verification has expired" instead, which bypasses current detection.

**Proposed change to `lib/scamDetector.ts` — extend `govMentions` array:**

```typescript
// myID re-registration phishing (2026-07-26 roadmap). These phrases target
// users who don't say "myid" explicitly but use "digital identity" framing.
// The myGovID→myID rebrand has driven a sustained phishing wave.
// Legitimate Services Australia never sends unsolicited re-verify requests.
"re-verify your digital identity", "digital identity verification",
"your identity verification has expired", "complete your identity verification",
"myid has been suspended", "set up your new digital identity",
"migrate to the new digital identity", "myid verification is pending",
```

**Note:** These are longer phrase matches (multi-word) so FP risk is very low — "digital identity verification" could appear in legitimate HR/onboarding but won't score high without other signals under the compound model.

**Sources:**
- https://www.biometricupdate.com/202411/scammers-capitalize-on-australias-myid-rebrand
- https://www.biometricupdate.com/202605/australia-credential-register-blocks-750000-fraudulent-id-checks-post-optus-breach
- https://www.myid.gov.au/security-and-privacy/how-to-verify-or-report-a-scam

**Roadmap:** `docs/threat-intel/2026-07-26-threat-roadmap.md` (D6)
