# Threat-Intel Roadmap — 2026-06-21

> **Routine:** Weekly threat-intelligence scan for Just Checking, Mate.
> **Scope:** Australia-first, globally-aware. Detection code is NOT modified by this routine — proposals only.
> **Codebase baseline read:** `lib/scamDetector.ts`, `lib/phoneIntel.ts`, `lib/emailHeaders.ts`, `lib/urlSanitizer.ts`, `lib/urlhausBlocklist.ts`, `lib/emailDistiller.ts`, `lib/forwardedEmail.ts`, `lib/detectType.ts`.

---

## (a) Executive Summary — Top 5 Improvements to Ship This Week

Ranked by **impact × ease of implementation**:

| # | Change | File | Why now |
|---|--------|------|---------|
| 1 | Add `"qantas"` to `auBrands` (scamDetector) and `IMPERSONATED_BRANDS` (emailHeaders) | `scamDetector.ts`, `emailHeaders.ts` | Active ACCC/Scamwatch alert since Feb 2026; surge still ongoing per ACCC March report |
| 2 | Add `"safe account"`, `"move your funds"`, `"transfer to safe"`, `"safe transfer"` to `REQUEST_WORDS` | `scamDetector.ts` | Tag-team bank impersonation now explicitly uses this phrase; it is currently undetected |
| 3 | Add delivery/parcel/toll urgency keywords (`"your parcel"`, `"missed delivery"`, `"toll outstanding"`, `"package held"`, `"delivery fee"`) to `URGENCY_WORDS` | `scamDetector.ts` | AusPost/Linkt smishing is the #1 volume SMS scam in AU H1 2026; current keywords don't catch this lure |
| 4 | Add India (`"91"`) and Philippines (`"63"`) to `HIGH_SCAM_COUNTRY_CODES` in `phoneIntel.ts` | `phoneIntel.ts` | Both are major origination countries for vishing calls targeting Australians, per AFP/ACCC data; currently absent |
| 5 | Add `.shop`, `.info`, `.pw`, `.vip`, `.buzz`, `.icu`, `.rest` to `SUSPICIOUS_TLDS` | `scamDetector.ts` | These appear in current Linkt/AusPost/Qantas phishing domains and are absent from the existing list |

---

## (b) New / Evolved Threats This Week

### 1. Qantas Brand Impersonation (Smishing + Email)
- **First seen:** August 2025, **surge:** February–June 2026
- **ACCC/Scamwatch alert:** Active as of February 2026, still trending
- **Description:** Scammers impersonate Qantas via SMS and email, claiming suspended accounts, expiring loyalty points, or card freezes. They use Qantas logos and branding convincingly. Subject lines include "Avoid Service Interruption" and "Your Qantas card has been frozen."
- **AU relevance:** High — Qantas has ~14 million Frequent Flyer members. ACCC confirmed "spike" in reports.
- **IOCs:**
  - Sender IDs: `"Qantas"`, `"QantasFF"`, `"QantasLoyalty"` (spoofed)
  - Email patterns: urgency + limited-time offers for expiring points
  - Domains observed: lookalike domains with `qantas` in the hostname not ending in `.com.au`
- **Gap:** `"qantas"` is absent from `auBrands` (line 124, `scamDetector.ts`) and `IMPERSONATED_BRANDS` (line 35, `emailHeaders.ts`).
- **Sources:** [Scamwatch — Qantas Impersonation Alert](https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-qantas-impersonation-scam), [ACCC warns of surge in Qantas impersonation scams](https://australianaviation.com.au/2026/02/accc-warns-of-surge-in-qantas-impersonation-scams/), [Trend Micro AU](https://news.trendmicro.com/en-au/2026/02/15/received-a-message-from-qantas-read-this-before-you-click/)

---

### 2. AusPost / Linkt Smishing — Homoglyph Character Substitution
- **First seen:** Dec 2025, **surge:** April–May 2026 (79,000+ messages across 40 campaigns)
- **Description:** A global smishing campaign pushed tens of thousands of fake Linkt/AusPost texts onto Australian phones. The novel evolution: scammers now substitute **Cyrillic lookalike characters** (е, ѕ, м, і, т) for their Latin equivalents in sender IDs and URLs to bypass keyword-based SMS spam filters. Bitdefender observed 2,200+ shortened URLs used.
- **AU relevance:** Critical — AusPost and Linkt are the two most-impersonated brands in AU SMS scams. Both have officially removed clickable links from their legitimate SMS communications.
- **IOCs:**
  - Fake domains: `linkt-au.com`, `linktoll.net`, shortened URLs, Cyrillic-mixed hostnames
  - Lure text: "Your toll is outstanding", "Delivery attempt failed", "Package held at depot"
  - Known lure keywords: "missed delivery", "toll outstanding", "package held", "delivery fee", "your parcel"
- **Gaps:**
  - `URGENCY_WORDS` lacks delivery/parcel/toll lure phrases
  - No Unicode/homoglyph normalisation in `normaliseForAnalysis()` (urlSanitizer.ts) — Cyrillic domains evade `SCAM_DOMAINS` and `SUSPICIOUS_TLDS` matching
- **Sources:** [Bitdefender Labs — Operation Road Trap](https://www.bitdefender.com/en-us/blog/labs/operation-road-trap), [Jim's IT — AusPost/Linkt/MyGov Guide 2026](https://jimsit.com.au/scam-text-australia-post-linkt-mygov/), [Cybermate — Toll Invoice Scam](https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/)

---

### 3. ClickFix / Fake CAPTCHA — Vidar Stealer Campaign (ACSC Advisory)
- **First seen:** Early 2026 globally, **AU advisory:** May 7, 2026 (ASD/ACSC)
- **Description:** Compromised WordPress sites belonging to legitimate Australian businesses display fake Cloudflare verification pages or fake reCAPTCHA prompts. Malicious JavaScript copies a PowerShell command to the clipboard and instructs the user to paste it into the Windows Run dialog. Execution installs **Vidar Stealer** malware (credential harvester). The FTC also issued a fresh warning in June 2026.
- **AU relevance:** High — ACSC explicitly issued AU-targeted advisory. Multiple sectors targeted.
- **IOCs (lure text patterns in web page content):**
  - "Verify you are human"
  - "Press Windows+R, then Ctrl+V, then Enter"
  - "Copy and paste this into your browser"
  - Fake Cloudflare or reCAPTCHA logos
  - C2 indicators: `applicationhost17.com`, `172.94.9.4:443`
- **Gap:** No detection for ClickFix lure phrases in `checkCustom()` or `checkSms()`. The `checkUrl()` function also has no flag for paths containing `/verify-human`, `/captcha`, `/cloudflare-verify`.
- **Sources:** [ACSC Advisory — ClickFix (Security Boulevard)](https://securityboulevard.com/2026/05/australia-warns-of-clickfix-attacks-pushing-vidar-stealer-malware/), [Malwarebytes — 700+ sites hijacked](https://www.malwarebytes.com/blog/bugs/2026/05/700-education-and-tech-websites-hijacked-in-huge-clickfix-malware-campaign), [Bitdefender — ClickFix WordPress AU](https://www.bitdefender.com/en-us/blog/hotforsecurity/clickfix-compromised-wordpress-sites-vidar-stealer-australia)

---

### 4. AI Voice Cloning / Vishing — "Safe Account" Tag-Team Scam
- **Trend period:** 2025–2026, deepfake vishing up 1,600% Q1 2025 vs Q4 2024 (US data; AU following)
- **Description:** Two related threat vectors:
  - **Voice cloning:** Scammers extract a short voice sample from social media/voicemail, clone the voice, and call a victim pretending to be a family member in distress (emergency, hospital). Ask for crypto/wire transfer.
  - **Tag-team bank impersonation:** SMS spoofed from a real bank sender ID tells the victim to expect a call. A second scammer calls from the bank's spoofed number, sometimes playing real bank hold music, and instructs the victim to move money to a "safe account." CBA, NAB, Macquarie all issued alerts.
- **AU relevance:** High — CBA specifically warned Australian customers. AFP issued alert. An AU victim lost $2.5M+ in a voice-clone case.
- **IOCs (keywords):**
  - "safe account", "move your funds to a safe account", "transfer to safe", "safe transfer", "safe wallet"
  - "your family member", "emergency", "hospital" combined with financial request
  - "expect a call from us", "we will call you shortly" in SMS
- **Gaps:**
  - `REQUEST_WORDS` does not include "safe account", "safe transfer", or "safe wallet"
  - No detection for "expect a call" type priming messages
  - AI voice cloning is behavioural (phone call) — no purely text-based signal; note this in watchlist
- **Sources:** [CommBank Warning 2026](https://www.commbank.com.au/articles/newsroom/2026/03/warning-as-impersonation-scams-become-more-sophisticated.html), [CNN — AI Voice Cloning May 2026](https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself), [AFP — Bank Impersonation](https://www.afp.gov.au/news-centre/media-release/banks-dont-rush-scammers-do-callous-impersonation-scams-robbing-everyday)

---

### 5. Quishing (QR Code Phishing) — 146% Volume Spike
- **Period:** Q1–Q2 2026
- **Description:** QR code phishing jumped 146% in 90 days (Microsoft data). Scammers paste fake QR stickers over legitimate ones on parking meters, restaurant tables, and public Wi-Fi signs, or embed QR codes in phishing emails. The QR leads to credential harvesting pages impersonating myGov, ATO, AusPost, or major banks. The ATO and myGov have both issued "we will never send you a QR code" warnings.
- **AU relevance:** High — ACCC confirmed AU impact. ANZ published a dedicated quishing explainer page.
- **IOCs:**
  - QR destinations are typically short-lived domains with suspicious TLDs or URL shorteners
  - Email lure: "Scan the QR code to verify your account", "Use the QR code below to claim your refund"
- **Gaps:**
  - The app has a `"qr"` type in `ScamType` but there is no `checkQr()` function or QR-specific keyword list. QR content currently falls through to the URL checker on the expanded destination, but lure text patterns ("scan the qr code", "use the qr code", "point your camera") are not in any word list.
- **Sources:** [Quishing jumps 146% — ScamWatchHQ](https://scamwatchhq.com/quishing-qr-code-phishing-surge-2026/), [ANZ Quishing page](https://www.anz.com.au/security/types-of-scams/quishing/), [ATO/myGov QR Warning — Yahoo Finance AU](https://au.finance.yahoo.com/news/ato-mygov-issue-qr-code-warning-as-insidious-trend-emerges-we-will-never-043520772.html), [Cyber.gov.au — Quishing](https://www.cyber.gov.au/threats/types-threats/quishing)

---

### 6. Pig Butchering / Fake Investment Platform Scams
- **Trend:** Ongoing, $75B+ stolen globally; AU losses rising sharply, ASIC warning issued 2026
- **Description:** Scammers build fake romantic or friendship relationships (via dating apps, WhatsApp, random "wrong number" texts) over weeks, then introduce a fake cryptocurrency or investment trading platform promising guaranteed returns. AU victim (Sydney) lost $2.5M+ via Bumble contact. ASIC warned specifically about fake crypto trading platforms.
- **AU relevance:** High — ASIC warning, AU losses continuing to climb. The initial lure arrives via SMS or social media DM.
- **IOCs (lure keywords):**
  - "investment platform", "trading platform", "guaranteed returns", "daily profit"
  - "crypto trading", "forex trading", "my uncle's platform", "exclusive investment opportunity"
  - Fake exchange domains: random `.com`, `.io`, `.vip`, `.cc` domains posing as licensed exchanges
- **Gap:** `REQUEST_WORDS` has "crypto" and "bitcoin" but lacks the softer investment-lure language that appears before a victim is asked for funds. Fake platform TLDs like `.io`, `.vip`, `.cc` are not in `SUSPICIOUS_TLDS`.
- **Sources:** [ForteClaim — Crypto Scam Crisis 2026](https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/), [TRM Labs — Pig Butchering](https://www.trmlabs.com/resources/blog/unmasking-pig-butchering-scams-the-4-billion-crypto-scheme-preying-on-vulnerable-investors)

---

### 7. Blob URI / Data URI Phishing (Email Security Evasion)
- **Period:** Growing through 2025–2026
- **Description:** Phishing emails link to legitimate, allowlisted sites (e.g., OneDrive, Google Docs). Those pages then use JavaScript to generate a `blob:` or `data:` URI containing a fully rendered fake login page. The credential harvesting page never exists at an external URL, so URL scanners see nothing. Cofense Intelligence documented multiple campaigns using this against Microsoft 365 credential phishing.
- **AU relevance:** Medium — Technique is global but increasingly used in business email compromise targeting AU organisations.
- **IOC / Pattern:**
  - URLs starting with `blob:https://` or `data:text/html`
  - The initial URL is always a legitimate trusted service — detection requires awareness the redirect chain exists
- **Gap:** `checkUrl()` does not handle `blob:` or `data:` URI schemes. These would currently fail URL parsing silently (`urlObj = null` path) and return score 60/suspicious — accidentally correct but for the wrong reason and without a meaningful flag.
- **Sources:** [Cofense/CyberSecurityNews — Blob URI Phishing](https://cybersecuritynews.com/new-phishing-attack-abusing-blob-urls/), [GBHackers — Blob URIs](https://gbhackers.com/phishing-campaign-uses-blob-urls/)

---

### 8. SMS Sender ID Register — Numeric-Sender Bypass Loophole
- **Date:** Effective 1 July 2026 (ACMA enforcement)
- **Description:** From 1 July 2026, all alphanumeric sender IDs (e.g. "NAB", "myGov") must be registered with ACMA's SMS Sender ID Register. Unregistered IDs display as "Unverified". **However:** the regime only covers alphanumeric IDs, not numeric phone numbers. UK experience (Ofcom trial) showed scammers simply shifted to numeric-only sender IDs after the alphanumeric rules took effect.
- **AU relevance:** High — from July 1, SMS messages claiming to be "myGov" or "ATO" that are legitimate will show as verified. This means any unverified "myGov" text after July 1 is essentially confirmed scam — a new binary signal the detector could eventually use.
- **Detection opportunity (post-July 1):** An SMS that claims in its body to be from ATO/myGov/Centrelink but uses a numeric sender (rather than a verified brand name) will be even more clearly fraudulent. The current govMentions check in `checkSms()` (line 208) could be annotated with this context.
- **Sources:** [ACMA SMS Sender ID Register](https://www.acma.gov.au/sms-sender-id-register), [Addisons Law — SMS Sender ID Response to SMS Scams](https://addisons.com/article/sms-sender-id-register-the-governments-response-to-sms-scams/)

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | Function / Constant | FP Risk | Priority |
|---|--------|---------------|-------------|---------------------|---------|----------|
| 1 | Qantas impersonation | Add `"qantas"` to `auBrands` array (line 124) | `lib/scamDetector.ts` | `auBrands` | Low — Qantas domain ends in `.com.au` so legitimate URLs won't trigger; same guard already in place for other brands | **HIGH** |
| 2 | Qantas impersonation (email) | Add `"qantas"` to `IMPERSONATED_BRANDS` array (line 35) | `lib/emailHeaders.ts` | `IMPERSONATED_BRANDS` | Low — same logic as existing entries | **HIGH** |
| 3 | "Safe account" bank scam | Add `"safe account"`, `"safe transfer"`, `"safe wallet"`, `"move your funds"`, `"transfer to safe"`, `"protect your money"` to `REQUEST_WORDS` | `lib/scamDetector.ts` | `REQUEST_WORDS` | Low — very specific phrases not in everyday legit communication | **HIGH** |
| 4 | AusPost/Linkt smishing lures | Add `"your parcel"`, `"missed delivery"`, `"delivery attempt"`, `"toll outstanding"`, `"package held"`, `"delivery fee"`, `"redelivery"`, `"customs fee"` to `URGENCY_WORDS` | `lib/scamDetector.ts` | `URGENCY_WORDS` | Low-Medium — "your parcel" is generic but in combination scoring it's fine; "toll outstanding" is highly specific | **HIGH** |
| 5 | India/Philippines vishing | Add `"91": "India"` and `"63": "Philippines"` to `HIGH_SCAM_COUNTRY_CODES` | `lib/phoneIntel.ts` | `HIGH_SCAM_COUNTRY_CODES` | Low — AFP/ACCC data confirms both as high-volume AU scam sources | **HIGH** |
| 6 | New phishing TLDs | Add `.shop`, `.info`, `.pw`, `.vip`, `.buzz`, `.icu`, `.rest`, `.cc` to `SUSPICIOUS_TLDS` | `lib/scamDetector.ts` | `SUSPICIOUS_TLDS` | Medium for `.info` and `.shop` (many legitimate sites use these); Low for `.pw`, `.vip`, `.buzz`, `.icu`, `.rest` | **HIGH** |
| 7 | Pig butchering / investment lures | Add `"investment platform"`, `"trading platform"`, `"guaranteed return"`, `"daily profit"`, `"exclusive investment"`, `"forex trading"` to `REQUEST_WORDS` | `lib/scamDetector.ts` | `REQUEST_WORDS` | Low — these phrases don't appear in legitimate financial communications | **HIGH** |
| 8 | ClickFix / fake CAPTCHA | Add `"verify you are human"`, `"press windows"`, `"ctrl+v"`, `"paste into run"`, `"verify you're not a robot and press"` to a new `CLICKFIX_WORDS` list checked in `checkCustom()` and `checkSms()` | `lib/scamDetector.ts` | New constant, used in `checkCustom()` | Low — these exact phrases only appear in ClickFix attacks | **MEDIUM** |
| 9 | QR lure text in emails/SMS | Add `"scan the qr code"`, `"scan qr code to verify"`, `"point your camera at"`, `"use the qr code below"` to `URGENCY_WORDS` or a new `QR_LURE_WORDS` list | `lib/scamDetector.ts` | `URGENCY_WORDS` or new constant | Low-Medium — "scan the qr code" is specific enough | **MEDIUM** |
| 10 | Blob/data URI detection | In `checkUrl()`, before `new URL(input)`, detect `blob:` and `data:` scheme prefixes and add a flag + 50 pts; return early with `likely_scam` | `lib/scamDetector.ts` | `checkUrl()` | Low — `blob:` and `data:text/html` URIs are never legitimately sent in phishing lure messages | **MEDIUM** |
| 11 | Missing AU banks in brand lists | Add `"macquarie"`, `"suncorp"`, `"bendigo"`, `"boq"` (Bank of Queensland), `"ing"` to `auBrands` and `IMPERSONATED_BRANDS` | `lib/scamDetector.ts`, `lib/emailHeaders.ts` | `auBrands`, `IMPERSONATED_BRANDS` | Low — same guard logic as existing entries | **MEDIUM** |
| 12 | Cyrillic/homoglyph in URLs | In `normaliseForAnalysis()`, add Unicode NFKD normalisation before hostname matching, and flag hostnames containing non-ASCII characters | `lib/urlSanitizer.ts` | `normaliseForAnalysis()` | Low for flag; use `Intl.getCanonicalLocales` or regex `[^\x00-\x7F]` on hostname | **MEDIUM** |
| 13 | "Expect a call" SMS priming | Add `"we will call you"`, `"expect a call from"`, `"our agent will call"` to `URGENCY_WORDS` | `lib/scamDetector.ts` | `URGENCY_WORDS` | Low-Medium — some legitimate services do say "we'll call you" | **LOW** |
| 14 | Wangiri — add missing prefixes | Add `"233"` (Ghana), `"231"` (Liberia) to `WANGIRI_PREFIXES` — increasingly reported as Wangiri origins | `lib/phoneIntel.ts` | `WANGIRI_PREFIXES` | Low | **LOW** |

---

## (d) Lower-Priority / Watchlist Items

- **AI voice-clone vishing:** Purely a phone-call vector — no text signal for the detector to catch. Recommend adding an educational note in the UI for phone number checks (e.g., "AI voice cloning is increasingly used; always use a pre-agreed safe word with family"). No code change possible without a new input type.
- **SMS Sender ID register (post-July 2026):** From 1 July, an SMS claiming to be from "myGov" or "ATO" that hasn't been registered will show as "Unverified" in the thread. The detector's govMentions check (`checkSms()` line 208) could eventually add a note about this, but it requires no code change until the system goes live.
- **Scam Prevention Framework (SPF) liability:** ACCC/NASC are moving toward mandatory bank reimbursement for scam losses. No code implication but relevant for product positioning.
- **cPanel CVE-2026-4194:** ASD/ACSC flagged exploitation of this vulnerability in webhost infrastructure. Not relevant to the detection layer but relevant to the app's own hosting security posture.

---

## (e) Full Source List

| Source | URL |
|--------|-----|
| ACCC — Thousands of scam websites taken down | https://www.accc.gov.au/media-release/thousands-of-scam-websites-taken-down-as-online-scams-continue-to-cost-australians |
| ACCC — Annual scam losses exceed $2 billion | https://www.accc.gov.au/media-release/continued-action-critical-to-combat-fraud-as-annual-scam-losses-exceed-2-billion |
| Scamwatch — Qantas impersonation alert | https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-qantas-impersonation-scam |
| Scamwatch — Police/crypto impersonation alert | https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-police-and-digital-currency-exchange-impersonation-scam |
| Scamwatch — ACCC numbers spoofed alert | https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-accc-phone-numbers-spoofed-by-scammers |
| ACCC — Qantas impersonation surge (Australian Aviation) | https://australianaviation.com.au/2026/02/accc-warns-of-surge-in-qantas-impersonation-scams/ |
| ASD/ACSC — ClickFix/Vidar Stealer advisory (Security Boulevard) | https://securityboulevard.com/2026/05/australia-warns-of-clickfix-attacks-pushing-vidar-stealer-malware/ |
| ASD/ACSC — cyber.gov.au alerts | https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories |
| Bitdefender — Operation Road Trap (Linkt/AusPost) | https://www.bitdefender.com/en-us/blog/labs/operation-road-trap |
| Bitdefender — ClickFix/WordPress/Vidar AU | https://www.bitdefender.com/en-us/blog/hotforsecurity/clickfix-compromised-wordpress-sites-vidar-stealer-australia |
| Malwarebytes — 700+ sites hijacked (ClickFix) | https://www.malwarebytes.com/blog/bugs/2026/05/700-education-and-tech-websites-hijacked-in-huge-clickfix-malware-campaign |
| Trend Micro — Qantas scam analysis | https://news.trendmicro.com/en-au/2026/02/15/received-a-message-from-qantas-read-this-before-you-click/ |
| CommBank — Sophisticated impersonation warning | https://www.commbank.com.au/articles/newsroom/2026/03/warning-as-impersonation-scams-become-more-sophisticated.html |
| AFP — Bank impersonation alert | https://www.afp.gov.au/news-centre/media-release/banks-dont-rush-scammers-do-callous-impersonation-scams-robbing-everyday |
| CNN — AI voice cloning scams (May 2026) | https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself |
| Trend Micro — AI voice cloning (April 2026) | https://news.trendmicro.com/2026/04/16/ai-voice-cloning/ |
| ScamWatchHQ — Quishing jumps 146% | https://scamwatchhq.com/quishing-qr-code-phishing-surge-2026/ |
| ANZ — Quishing explainer | https://www.anz.com.au/security/types-of-scams/quishing/ |
| Cyber.gov.au — Quishing threat page | https://www.cyber.gov.au/threats/types-threats/quishing |
| Yahoo Finance AU — ATO/myGov QR code warning | https://au.finance.yahoo.com/news/ato-mygov-issue-qr-code-warning-as-insidious-trend-emerges-we-will-never-043520772.html |
| CyberSecurityNews — Blob URI phishing | https://cybersecuritynews.com/new-phishing-attack-abusing-blob-urls/ |
| GBHackers — Blob URI phishing | https://gbhackers.com/phishing-campaign-uses-blob-urls/ |
| ACMA — SMS Sender ID Register | https://www.acma.gov.au/sms-sender-id-register |
| Addisons Law — SMS Sender ID explainer | https://addisons.com/article/sms-sender-id-register-the-governments-response-to-sms-scams/ |
| ForteClaim — Pig butchering 2026 | https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/ |
| TRM Labs — Pig butchering deep-dive | https://www.trmlabs.com/resources/blog/unmasking-pig-butchering-scams-the-4-billion-crypto-scheme-preying-on-vulnerable-investors |
| Jim's IT — AusPost/Linkt/MyGov 2026 guide | https://jimsit.com.au/scam-text-australia-post-linkt-mygov/ |
| Cybermate — Toll invoice scam 2026 | https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/ |
| TechRadar — Scams in Australia June 2026 | https://www.techradar.com/computing/cyber-security/scams-in-australia |
