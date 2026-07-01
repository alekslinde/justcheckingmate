# Threat Intelligence Roadmap — 2026-07-01

> **Weekly brief for Just Checking, Mate**
> Detection code lives in `lib/`. This file is research-and-proposals only — no `lib/` files are modified here.
> Previous roadmap: `docs/threat-intel/2026-06-21-threat-roadmap.md` (all D1–D17 from that run are now implemented).

---

## (a) Executive Summary — Top 5 Ship-This-Week Changes

Ranked by **impact × ease** (all are string/regex additions to existing functions — no architecture changes required):

| # | Recommendation | Why now |
|---|---|---|
| 1 | **Flag `*.workers.dev`, `*.pages.dev`, `*.trycloudflare.com` as suspicious hosting** in `checkUrl()` | Cloudflare free-tier products are the dominant phishing hosting platform of 2025-2026; 344+ AU orgs hit in March 2026 wave; `workers.dev` slips past enterprise URL filters as "trusted" |
| 2 | **Add superannuation phishing keywords** to `REQUEST_WORDS` / `URGENCY_WORDS` | ASIC media release Jan 2026; active AustralianSuper impersonation campaign May-June 2026; "secure your super" phishing exploited a false June 1 deadline; "smsf" / "early release" combos are zero-FP for an AU consumer detector |
| 3 | **Add ACCC, Scamwatch, and NASC to `govMentions`** in `checkSms()` | Scamwatch issued a specific alert in June 2026 about scammers spoofing the ACCC's own phone number (1300 302 502); neither "accc" nor "scamwatch" nor "national anti-scam centre" appears anywhere in the current detection code |
| 4 | **Add food delivery platform brand impersonation** (`ubereats`, `doordash`, `menulog`, `deliveroo`) to `auBrands` and `IMPERSONATED_BRANDS` | Scamwatch alert (published ≈3 weeks ago) warns of active scams targeting DoorDash, Uber Eats, restaurants, and drivers; none of these brands are currently detected |
| 5 | **Add NBN disconnection threat + NBN Co to `govMentions` / `URGENCY_WORDS`** | Persistent AU-specific scam heavily reported in 2026; "nbn" is absent from every current signal list; the "disconnected within 24 hours" script has a distinct detectable phrase structure |

---

## (b) New / Evolved Threats This Week

### T1. Cloudflare Workers / Pages / Trycloudflare as Phishing Infrastructure (CRITICAL — escalating)

**What:** Cybercriminals have systematically weaponised Cloudflare's free-tier developer products as phishing-hosting infrastructure. `*.workers.dev` (Cloudflare Workers), `*.pages.dev` (Cloudflare Pages), and `*.trycloudflare.com` (ephemeral HTTPS tunnels) are used to host credential-harvesting pages, run transparent proxy kits, and exfiltrate stolen data. Because these subdomains inherit Cloudflare's own SSL certificate and reputation, enterprise URL-categorisation services rate them as benign by default.

**Novel evolution in 2026:** The "EvilTokens" Phishing-as-a-Service kit (sold since February 2026) combined Cloudflare Workers redirects with Railway.app as the final credential collector — making the chain workers.dev → Railway, with no self-hosted infrastructure for defenders to pivot on. A wave in March 2026 hit 344 organisations across the US, Canada, **Australia**, New Zealand, and Germany.

**Why it bypasses current detection:** `checkUrl()` only flags IPFS gateways and the two hard-coded `REDIRECT_HOSTS` (`lnkd.in` and `cdn.ampproject.org`). `workers.dev` and `pages.dev` are not in any current list.

**AU relevance:** Confirmed Australian organisations in the March 2026 EvilTokens campaign. Cloudflare's own 2026 threat report names AU-targeting as significant. Tax-agency impersonation on Cloudflare-fronted domains is reported against AU, UK, and Swiss users.

**IOCs / patterns:**
- Hostname: `*.workers.dev` (e.g. `ato-verify-abc123.workers.dev`)
- Hostname: `*.pages.dev` (e.g. `mygov-login.pages.dev`)
- Hostname: `*.trycloudflare.com` (ephemeral tunnels; e.g. `willing-bones-random.trycloudflare.com`)
- Hostname: `*.railway.app` (credential exfiltration endpoint in multi-hop chains)
- Hostname: `*.vercel.app` (same pattern — Vercel free-tier abused similarly)
- Multi-hop pattern: legitimate-looking host → workers.dev redirect → harvester

**Sources:**
- https://ringsafe.in/cloudflare-fronted-phishing-in-2026-how-workers-pages-tunnels-and-r2-became-default-phishing-infrastructure/
- https://cofense.com/blog/how-cloudflare-services-are-abused-for-credential-theft-and-malware-distribution
- https://www.fortra.com/blog/cloudflare-pages-workers-domains-increasingly-abused-for-phishing
- https://labs.cloudsecurityalliance.org/research/csa-research-note-oauth-device-code-phishing-m365-20260325-c/
- https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html
- https://www.anptech.com.au/cloudflare-threat-report-2026-australia/

---

### T2. Superannuation Phishing ("Secure Your Super" Campaign) (HIGH — AU-specific)

**What:** A new wave of phishing targeting Australians' superannuation accounts emerged in May–June 2026. Scammers impersonate major super funds (AustralianSuper, UniSuper, REST, MLC, AMP) via email and SMS, warning members of a false regulatory deadline ("secure your super before June 1") or offering early access via a fake Self-Managed Super Fund (SMSF) setup service. ASIC issued a media release (26-014MR, January 2026) urging super trustees to improve anti-scam protections. ASIC also deregistered 95 shell companies used in crypto-super scams.

**Novel elements:**
1. **SMSF early-access fraud** — victims pay upfront "administration fees" to unlock super early, then identity is stolen to also drain the fund.
2. **Fake ATO co-branding** — phishing pages replicate the ATO myGov linked-account flow, asking for TFN + super account number + myGov password in one harvest.
3. **Super preservation age misinformation** — messages falsely claim "preservation age rising to 70 by 2030" to create urgency.

**AU relevance:** $2.6 billion in super scam losses reported; preservation age confusion is unique to AU regulatory context. "AustralianSuper" impersonation campaign specifically named in ASIC release.

**IOCs / patterns:**
- Keywords: `"secure your super"`, `"access your super early"`, `"unlock your super"`, `"early super release"`, `"smsf setup"`, `"self managed super"`, `"superannuation withdrawal"`, `"preservation age"`, `"super fund transfer"`, `"your super balance"`
- Combined lures: ATO impersonation + "super" = almost certainly a scam
- Sender domains: `ato-super[.]xyz`, `australiansuper-verify[.]top`, `mysuper[.]icu` (pattern — not stable)
- Subject lines: "Action required — secure your super before 1 June", "Your superannuation account: verify before deadline"

**Sources:**
- https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-014mr-asic-urges-super-trustees-to-step-up-and-address-serious-gaps-in-anti-scam-and-fraud-protections/
- https://moneysmart.gov.au/financial-scams/superannuation-scams
- https://kalkine.com.au/news/smsf/smsf-scams-and-early-access-ato-warnings-for-australians
- https://bellpotter.com.au/ideas/advice-opportunities-for-the-2026-financial-year-2/

---

### T3. ACCC / Scamwatch Phone Number Spoofing (HIGH — official Scamwatch alert)

**What:** Scamwatch issued a dedicated alert in June 2026 warning that scammers are spoofing real ACCC telephone numbers — including the Scamwatch report line (1300 795 995) and the ACCC inquiry line (1300 302 502) — to fraudulently claim they are calling from "the ACCC", "Scamwatch", or "the consumer watchdog". The irony is maximal: the fraud-reporting authority being impersonated as a lure for investment fraud or data theft.

**Script patterns:** Callers claim to be investigating a scam the victim has already been a victim of, and ask the victim to transfer funds to a "safe account" while the investigation runs — a classic tag-team overlay onto existing bank-impersonation scripts. Some callers speak in languages other than English while impersonating the ACCC, suggesting an organised call-centre operation.

**Current gap:** `govMentions` in `checkSms()` includes "ato", "centrelink", "afp", "police", "acsc", "asd", etc. — but **"accc"**, **"scamwatch"**, and **"national anti-scam centre"** are entirely absent.

**AU relevance:** Australia-only. The ACCC is specifically an Australian consumer regulator.

**IOCs / patterns:**
- Caller/sender claims: `"accc"`, `"scamwatch"`, `"national anti-scam centre"`, `"nasc"`, `"consumer watchdog"`, `"competition and consumer commission"`
- Script phrases: "we're investigating a scam that targeted you", "move your money to a safe account while we investigate", "ACCC investigator calling"

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-accc-phone-numbers-spoofed-by-scammers
- https://www.nasc.gov.au/news/warning-issued-after-accc-phone-numbers-spoofed-by-scammers

---

### T4. Food Delivery Platform Impersonation (HIGH — Scamwatch alert ≈ June 2026)

**What:** Scamwatch issued an alert (approximately 3 weeks before July 1, 2026) about a new wave of scams targeting food delivery platforms. Scammers impersonate DoorDash, Uber Eats, Menulog, and Deliveroo — targeting three groups:
1. **Customers** — fake order confirmation or refund phishing; asks for card details to "process a refund".
2. **Restaurants** — impersonators call claiming to be platform support and request login credentials or banking changes.
3. **Delivery workers** — messages about "cancelled orders" or "payment issues" that redirect earnings to scammer-controlled accounts.

**AU relevance:** AU food delivery market is among the most competitive in Asia-Pacific; these platforms have tens of millions of monthly active users. Scamwatch alert explicitly names "DoorDash", "Uber Eats" and "restaurant" targets.

**Current gap:** None of `"doordash"`, `"ubereats"`, `"uber eats"`, `"menulog"`, `"deliveroo"` appear in `auBrands` (URL typosquatting), `IMPERSONATED_BRANDS` (email header analysis), or `govMentions` (SMS brand checks).

**IOCs / patterns:**
- Brand impersonation: DoorDash, Uber Eats / UberEats, Menulog, Deliveroo
- Sender domains: `doordash-support[.]com.au`, `ubereats-refund[.]top`, `menulog-verify[.]xyz`
- Lure messages: "Your Uber Eats order has been cancelled — click here for your refund", "DoorDash: account suspended, verify now", "Menulog: your payment failed, update details"
- Ask: one-time code, login credentials, bank BSB/account

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-food-delivery-scams
- https://help.uber.com/en-AU/ubereats/restaurants/article/beware-of-phishing-scams-spoofing-ubereats

---

### T5. NBN Disconnection Threat / Telco Impersonation (MEDIUM-HIGH — persistent, code gap)

**What:** A long-running but persistently reported scam uses automated calls and SMS claiming to be from "NBN Co" threatening broadband disconnection within 24–48 hours unless the victim calls back or downloads software. In 2026, the tactic has evolved to include: (a) **live agent escalation** after the robocall to maintain pressure, and (b) a new SMS variant that sends a "disconnection notice" with a link to "confirm your account" — which is a credential-harvesting page.

**Current gap:** `"nbn"` and `"nbn co"` do not appear anywhere in the detection codebase — not in `govMentions`, `auBrands`, or anywhere in the signal lists. The disconnection threat phrase structure (`"will be disconnected within"`, `"internet will be disconnected"`) is also not covered.

**AU relevance:** Exclusively Australian — the NBN is Australia's national broadband network.

**IOCs / patterns:**
- Brand claims: `"nbn co"`, `"nbn"`, `"national broadband network"`, `"nbnco"`
- Threat phrases: `"internet will be disconnected"`, `"service disconnected within 24 hours"`, `"nbn technician"`, `"broadband will be cut off"`, `"press 1 to be connected to a technician"`
- Combined with remote-access ask: caller transitions from "NBN technician" to "let me connect to your computer" (remote access already in REQUEST_WORDS, but the NBN entry point is missing)

**Sources:**
- https://www.scamnet.wa.gov.au/scamnet/Scam_types-Attempts_to_gain_your_personal_information-Phishing-NBN_Scams.htm
- https://intrusionx.com.au/blog/nbn-scam-australia-fake-technician-call/
- https://channeltechsupport.com.au/2026/03/06/new-scams-australia-2026/

---

### T6. AI Voice-Clone "Bail Money / Stranded Overseas" Escalation (MEDIUM — evolved signal gap)

**What:** The previous roadmap added basic AI voice-clone follow-up signals ("i've been in an accident", "don't tell mum", "western union"). These are now confirmed in the codebase. However, the 2026 variant has expanded its SMS follow-up text patterns — particularly targeting grandparents (grandparent-fraud evolution) with more elaborate scenarios:

- **Bail scenario:** "I've been arrested / I'm in jail / I need bail money — please don't call the police"
- **Stranded scenario:** "I'm stuck overseas / stranded in [country] / my wallet was stolen — need emergency wire transfer"
- **Kidnapping scenario:** "We have your [child/grandchild] — do not call police — wire $X immediately"

These scripts are distinct enough from the existing signals to warrant expansion. The clue that distinguishes them from legitimate messages is the combination of urgent money request + secrecy instruction ("don't tell anyone", "don't call police") + specific wire payment mechanism.

**IOCs / patterns (new, not yet in codebase):**
- `"bail money"`, `"bail bond"`, `"need bail"`, `"post bail"`, `"get me out"`
- `"stranded overseas"`, `"stuck overseas"`, `"stranded abroad"`, `"wallet stolen overseas"`
- `"don't call the police"`, `"do not contact police"`, `"don't call anyone"`
- `"emergency wire"`, `"emergency transfer"`, `"emergency funds"` (note: "wire transfer" already present; these extensions are not)
- `"we have your"` (kidnapping opener — high specificity)

**Sources:**
- https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
- https://www.investigatetv.com/2026/01/23/ai-voice-cloning-scams-target-families-with-fake-kidnapping-calls/
- https://www.unboxfuture.com/2026/05/the-rise-of-ai-voice-cloning-scams-in.html

---

### T7. Device Code Phishing / EvilTokens PhaaS (MEDIUM — enterprise, some AU consumer relevance)

**What:** A Phishing-as-a-Service kit named "EvilTokens" (sold since February 2026) weaponises the OAuth Device Authorization flow (RFC 8628 — originally designed for input-constrained devices like Smart TVs) to steal Microsoft 365 access tokens without requiring victims to enter credentials on a lookalike site. The victim receives a legitimate-looking request to visit `microsoft.com/devicelogin` and enter a device code. The code, however, was generated by the attacker, who receives a valid M365 session token.

**AU relevance:** 344+ organisations confirmed compromised globally March 2026; financial services and healthcare sectors in Australia confirmed affected. The FBI's IC3 issued a public advisory (PSA260521) about Kali365, a related PhaaS kit.

**Consumer-side detection signal:** Lure emails contain phrases like "enter this code at microsoft.com/devicelogin", "device activation required", or "verify device access". These are not legit patterns in normal consumer email flow.

**IOCs / patterns:**
- URL: `microsoft.com/devicelogin` in email lure (legitimate page, illegitimate use)
- Keywords in email body: `"enter device code"`, `"activate your device"`, `"visit microsoft.com/devicelogin"`, `"device authorization code"`, `"your device code is"`
- Subject lines: "Microsoft: Verify New Device", "Action Required: Sign In from New Device"

**Sources:**
- https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html
- https://www.ic3.gov/PSA/2026/PSA260521
- https://pushsecurity.com/blog/device-code-phishing/
- https://www.helpnetsecurity.com/2026/04/07/microsoft-device-code-phishing-campaign/

---

### T8. Deepfake Celebrity Investment Bait (MEDIUM — AU-specific evolving)

**What:** AI-generated deepfake videos of prominent Australians — particularly Gina Rinehart, Andrew "Twiggy" Forrest, Dick Smith, and popular TV hosts — are used in Facebook and Instagram advertisements to promote fraudulent crypto investment platforms. Victims are directed to convincing fake trading portals that show inflated "profits" to build trust before requesting larger deposits and then vanishing. Australia saw a 25% jump in such "celebrity-bait" investment ads in 2026. CommBank found 27% of surveyed Australians had encountered a deepfake scam in the past year.

**Current state:** The existing pig-butchering signals in `checkSms()` (task-job funnel) and `REQUEST_WORDS` (wallet approval, crypto) catch some downstream signals. The upstream "celebrity endorsement" recruitment text — which is often what's pasted in — is not currently detected.

**IOCs / patterns:**
- Platform lures: "Andrew Forrest investment platform", "Gina Rinehart recommends", "as seen on Channel 9", "endorsed by [famous Australian]"
- Investment promises: `"guaranteed returns"`, `"100% profit guarantee"`, `"double your money"`, `"risk-free investment"`, `"exclusive investment opportunity"`, `"early access platform"`
- Social proof fraud: `"I made $8,000 in my first week"`, `"this is not a scam — verified by ASIC"` (legitimate ASIC never verifies platforms this way)

**Sources:**
- https://bluntmag.com.au/gaming/ai-deepfake-crypto-scams-2026
- https://www.nsw.gov.au/departments-and-agencies/id-support-nsw/learn/scams/celebrity-deepfake
- https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html
- https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams

---

### T9. SMS Sender ID Register — New "Unverified" Label Context (LOW — informational, 1 July 2026)

**What:** The ACMA's SMS Sender ID Register came into force **today, 1 July 2026**. From this date, any business sending SMS using an alphanumeric Sender ID (e.g. "NAB", "ATO", "myGov") must register that ID with ACMA. Unregistered sender IDs claiming to be from known brands will be displayed to recipients as **"[BrandName] - Unverified"** by Australian carriers.

**Implication for detection:** If a user pastes an SMS that claims to be from ATO, NAB, or Linkt — and that message contains a link — it is now even more likely to be fraudulent, since legitimate senders have registered. This doesn't change our heuristic scores directly, but it creates an opportunity to add explanatory text to flags, noting that "from 1 July 2026, legitimate AU businesses must register their Sender ID with ACMA — if this appeared as 'Unverified', it is almost certainly a scam."

**Action required:** This is an educational signal addition to flag descriptions, not a new detection rule. Can be added to the existing `govMentions` flag message or as a footnote in `scoreToResult()` output for SMS checks.

**Sources:**
- https://www.acma.gov.au/sms-sender-id-register
- https://stateofsurveillance.org/news/australia-sms-sender-id-registration-acma-2026/
- https://www.pickr.com.au/qa/2026/why-changes-to-the-sender-id-could-prevent-sms-scams/

---

### T10. Physical QR Code Sticker Attacks on Parking / EV Charger Infrastructure (LOW — hard to detect in text)

**What:** Fraudulent QR code stickers have been found placed over legitimate QR codes on parking meters, council payment kiosks, and public EV charging stations in Australia and globally. Victims scan what they believe is the official payment code, are redirected to a fake payment page, and have their credit card details harvested. This differs from digital quishing (SMS QR prompts already detected) in that the trigger is entirely physical — no advance text message.

**Detectability note:** Very limited text-side signal when a user pastes a URL from a scanned QR code. The only detectable element is the URL's characteristics (suspicious TLD, typosquatted brand name like "wilson-parking-pay.xyz", excessive hyphens). The existing `checkUrl()` rules already catch many of these. There is no additional phrase pattern to detect.

**Watch for:** Domain patterns: `[council-name]-pay[.]xyz`, `park-pay-au[.]top`, `ev-charge[.]icu`, `parking-fine[.]site`. These already score high under existing TLD and hyphen rules.

**Sources:**
- https://www.bankaust.com.au/blog/qr-code-scams-are-rising-in-australia-heres-how-to-protect-yourself
- https://www.legendarylandscapes.co.uk/news/100/2026-02-24-the-quishing-alert-why-you-should-never-scan-a-qr-code-on-a-parking-meter-in-2026/
- https://www.choice.com.au/electronics-and-technology/phones/mobile-phones/articles/qr-code-scams

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | FP Risk | Priority |
|---|--------|---------------|-------------|---------|----------|
| D1 | Cloudflare Workers/Pages hosting | In `checkUrl()`, add a `SUSPICIOUS_HOSTING` set containing `"workers.dev"`, `"pages.dev"`, `"trycloudflare.com"`; check `hostname.endsWith(h)` for each; flag `"Hosted on a free cloud dev platform commonly used to disguise phishing pages"` (+35 score) | `lib/scamDetector.ts` | Low-Medium — legitimate dev preview sites exist, but AU consumer services never use these URLs; score should NOT be as high as IPFS to allow for FP headroom | HIGH |
| D2 | Railway/Vercel as phishing exfil | Add `"railway.app"` and `"vercel.app"` to the same `SUSPICIOUS_HOSTING` check as D1 (+25 score, slightly lower than D1 as Vercel especially has many legit preview sites) | `lib/scamDetector.ts` | Medium — more legitimate use than workers.dev; lower score addition justified | HIGH |
| D3 | Superannuation phishing keywords | Add to `REQUEST_WORDS`: `"access your super"`, `"unlock your super"`, `"smsf"`, `"self managed super"`, `"early super release"`, `"super withdrawal"`, `"superannuation transfer"`. Add to `URGENCY_WORDS`: `"secure your super"`, `"your super balance"`, `"preservation age"`, `"super fund deadline"` | `lib/scamDetector.ts` | Low — "smsf" and "early super release" are extremely AU-specific and scam-specific; "your super balance" has some FP risk in legitimate super fund newsletters but those don't also have urgency signals | HIGH |
| D4 | Super fund brand impersonation (email) | Add to `IMPERSONATED_BRANDS` in `emailHeaders.ts`: `"australiansuper"`, `"unisuper"`, `"rest super"`, `"hesta"`, `"sunsuper"`, `"cbus"`, `"amp super"`, `"mlc"` | `lib/emailHeaders.ts` | Low — brand-name specific, won't match general finance emails | HIGH |
| D5 | ACCC/Scamwatch spoofing in SMS | Add to `govMentions` in `checkSms()`: `"accc"`, `"scamwatch"`, `"national anti-scam centre"`, `"nasc"`, `"consumer watchdog"`, `"competition and consumer commission"` | `lib/scamDetector.ts` | Low — the ACCC never cold-calls consumers; any SMS claiming to be from Scamwatch is almost certainly a scam | HIGH |
| D6 | Food delivery brand impersonation | Add to `auBrands` in `checkUrl()`: `"doordash"`, `"ubereats"`, `"menulog"`, `"deliveroo"`. Add same to `IMPERSONATED_BRANDS` in `emailHeaders.ts`. Add `"doordash"`, `"uber eats"`, `"ubereats"`, `"menulog"`, `"deliveroo"` to `govMentions` / brand-mention check in `checkSms()` | `lib/scamDetector.ts` + `lib/emailHeaders.ts` | Low — brand-name specific, only fires when combined with suspicious domain patterns | HIGH |
| D7 | NBN disconnection threat | Add to `govMentions` in `checkSms()`: `"nbn co"`, `"nbn"`, `"national broadband network"`. Add to `URGENCY_WORDS`: `"internet will be disconnected"`, `"broadband will be cut off"`, `"nbn technician"`, `"service disconnected within"`, `"disconnected within 24 hours"` | `lib/scamDetector.ts` | Low-Medium — "nbn" alone has FP risk in legitimate ISP comms; composite trigger (nbn + disconnection threat) is very specific | HIGH |
| D8 | AI voice-clone bail/kidnap/stranded keywords | Add to `URGENCY_WORDS`: `"bail money"`, `"need bail"`, `"stranded overseas"`, `"stuck overseas"`, `"stranded abroad"`, `"do not call police"`, `"don't call the police"`, `"emergency transfer"`, `"emergency funds needed"`, `"we have your"` | `lib/scamDetector.ts` | Medium — "emergency funds" and "stuck overseas" can appear in legitimate contexts; however the composite score with secrecy instructions keeps FP rate acceptable | MEDIUM |
| D9 | Device code phishing email lures | Add a block in `checkEmail()` to detect `"enter.*device code"`, `"microsoft.com/devicelogin"`, `"device authorization code"`, `"your device code is"` paired with any of the existing impersonation signals; flag `"Device code phishing — scammers abuse Microsoft's device login flow to steal credentials without a fake login page"` (+30) | `lib/scamDetector.ts` | Low — `microsoft.com/devicelogin` in an email body outside of IT onboarding contexts is a very high-confidence scam signal | MEDIUM |
| D10 | Investment celebrity bait | Add to `REWARD_WORDS` or a new composite check: `"guaranteed returns"`, `"risk-free investment"`, `"double your money"`, `"exclusive investment opportunity"`, `"verified by asic"` (the last phrase is counter-intuitively used in scams to falsely claim legitimacy) | `lib/scamDetector.ts` | Medium — "exclusive investment opportunity" may appear in spam; composite with crypto/wallet signals reduces FP; do NOT add celebrity names (too many FPs) | MEDIUM |
| D11 | Super brand impersonation in URL | Add to `auBrands` in `checkUrl()`: `"australiansuper"`, `"unisuper"`, `"sunsuper"`, `"cbus"`, `"hesta"`, `"ampsuper"` | `lib/scamDetector.ts` | Low | MEDIUM |
| D12 | Sender ID Register educational flag update | Update the flag message for `govMentions` hits in `checkSms()` to append: `"From 1 July 2026, legitimate AU businesses must register their Sender ID with ACMA — if this message appeared on your phone as 'Unverified', it is almost certainly a scam."` | `lib/scamDetector.ts` | None — purely informational addition to existing flag text | LOW |
| D13 | Physical quishing URL pattern (parking/council) | No new rule needed — existing `SUSPICIOUS_TLDS`, hyphen-count, and brand-impersonation checks in `checkUrl()` already catch the URL patterns used in parking-meter sticker attacks. Document explicitly in comments rather than adding rules. | — | N/A — already covered | WATCHLIST |

---

## (d) Lower-Priority / Watchlist Items

- **`*.railway.app` and `*.vercel.app`** — Included as D2 above with a lower score addition. If FP reports accumulate from devs, consider restricting to: only flag when combined with a suspicious query string or subdomain that mimics a known brand (e.g. `ato-login.railway.app`). This can be refined post-launch.

- **Pig-butchering via AI chatbot on LINE/KakaoTalk** — Platforms LINE and KakaoTalk are mentioned in 2026 reporting as recruitment channels. Adding `"line app"`, `"kakaotalk"` to the task-job composite (`jobSignals`) might reduce FPs vs. adding them to `REQUEST_WORDS` directly. Current two-signal composite already catches the most common patterns.

- **Fake e-commerce stores (`.store`, `.shop` TLDs)** — Previously watchlisted. No new AU-specific escalation this week; still higher FP risk than the TLDs already in `SUSPICIOUS_TLDS`. Hold until AU-specific campaigns confirmed.

- **EvilTokens / OAuth device code for consumer Microsoft accounts** — Currently more enterprise-focused. If reports of consumer Microsoft account takeover via device code appear in AU Scamwatch data, escalate D9 priority.

- **MyID (new myGov app rebrand)** — myGov is rebranding its digital identity layer to "myID" in 2026. Scammers will follow. Watch for "myid" and "my id" as new impersonation keywords; add to `govMentions` and `LEGIT_AU_DOMAINS` when the rebrand is confirmed complete.

- **Deepfake video scams** — Still no text-side detection available. The celebrity names themselves have too many FPs. Best addressed through user-education UI rather than signal rules. Instagram/Facebook URL detection (flagging fb.gg, Instagram referral links combined with investment keywords) may be a future angle.

- **Fake Australia Post OTP multi-step harvest** — UI/flow-level pattern, not detectable in a single message snippet. Continue watchlist.

- **SIM-swap fraud** — Carrier-side issue, no text/URL/phone signal available. Watchlist only.

---

## (e) Full Source List

1. ASIC — Super scam media release 26-014MR: https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-014mr-asic-urges-super-trustees-to-step-up-and-address-serious-gaps-in-anti-scam-and-fraud-protections/
2. Scamwatch — ACCC phone numbers spoofed: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-accc-phone-numbers-spoofed-by-scammers
3. NASC — ACCC spoofing warning: https://www.nasc.gov.au/news/warning-issued-after-accc-phone-numbers-spoofed-by-scammers
4. Scamwatch — Food delivery scams: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-food-delivery-scams
5. Uber Eats Help AU — Phishing warning: https://help.uber.com/en-AU/ubereats/restaurants/article/beware-of-phishing-scams-spoofing-ubereats
6. ACMA — SMS Sender ID Register: https://www.acma.gov.au/sms-sender-id-register
7. State of Surveillance — ACMA SMS Sender ID: https://stateofsurveillance.org/news/australia-sms-sender-id-registration-acma-2026/
8. Pickr — SMS Sender ID changes AU: https://www.pickr.com.au/qa/2026/why-changes-to-the-sender-id-could-prevent-sms-scams/
9. RingSafe — Cloudflare-fronted phishing 2026: https://ringsafe.in/cloudflare-fronted-phishing-in-2026-how-workers-pages-tunnels-and-r2-became-default-phishing-infrastructure/
10. Cofense — Cloudflare credential theft: https://cofense.com/blog/how-cloudflare-services-are-abused-for-credential-theft-and-malware-distribution
11. Fortra — Cloudflare pages/workers domains abused: https://www.fortra.com/blog/cloudflare-pages-workers-domains-increasingly-abused-for-phishing
12. CSA Labs — EvilTokens device code phishing M365: https://labs.cloudsecurityalliance.org/research/csa-research-note-oauth-device-code-phishing-m365-20260325-c/
13. The Hacker News — Device code phishing 340 orgs: https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html
14. ANP Technology AU — Cloudflare 2026 threat report: https://www.anptech.com.au/cloudflare-threat-report-2026-australia/
15. Push Security — Device code phishing analysis: https://pushsecurity.com/blog/device-code-phishing/
16. IC3 — Kali365 PhaaS advisory PSA260521: https://www.ic3.gov/PSA/2026/PSA260521
17. Help Net Security — Microsoft device code phishing: https://www.helpnetsecurity.com/2026/04/07/microsoft-device-code-phishing-campaign/
18. MoneySmart — Superannuation scams: https://moneysmart.gov.au/financial-scams/superannuation-scams
19. Kalkine — SMSF early access ATO warnings: https://kalkine.com.au/news/smsf/smsf-scams-and-early-access-ato-warnings-for-australians
20. CNN — AI voice cloning scams 2026: https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
21. InvestigateTV — AI voice clone kidnapping calls: https://www.investigatetv.com/2026/01/23/ai-voice-cloning-scams-target-families-with-fake-kidnapping-calls/
22. UnboxFuture — AI voice cloning scam rise: https://www.unboxfuture.com/2026/05/the-rise-of-ai-voice-cloning-scams-in.html
23. Bank Australia — QR code quishing AU: https://www.bankaust.com.au/blog/qr-code-scams-are-rising-in-australia-heres-how-to-protect-yourself
24. Channel Tech Support — New AU scams 2026: https://channeltechsupport.com.au/2026/03/06/new-scams-australia-2026/
25. ScamNet WA — NBN scams: https://www.scamnet.wa.gov.au/scamnet/Scam_types-Attempts_to_gain_your_personal_information-Phishing-NBN_Scams.htm
26. IntrusionX — NBN tech support scam AU: https://intrusionx.com.au/blog/nbn-scam-australia-fake-technician-call/
27. Blunt Magazine AU — AI deepfake crypto scams: https://bluntmag.com.au/gaming/ai-deepfake-crypto-scams-2026
28. NSW Government — Celebrity deepfake investment: https://www.nsw.gov.au/departments-and-agencies/id-support-nsw/learn/scams/celebrity-deepfake
29. CommBank — Can Australians spot deepfakes: https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html
30. WA Government — Celebrity crypto investment losses $30M: https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams
31. ForteClaim — Crypto/pig-butchering 2026: https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/
32. Tech Times — Pig butchering ring $5.5M WhatsApp: https://www.techtimes.com/articles/319398/20260630/pig-butchering-ring-ordered-pay-55m-after-faking-crypto-profits-whatsapp.htm
33. NASC — Targeting scams report 2025 (March 2026): https://www.nasc.gov.au/system/files/targeting-scams-report-2025.pdf
34. ACCC — Scam losses exceed $2 billion: https://www.accc.gov.au/media-release/continued-action-critical-to-combat-fraud-as-annual-scam-losses-exceed-2-billion
35. ACCC — 5,834 scam websites taken down: https://www.accc.gov.au/media-release/thousands-of-scam-websites-taken-down-as-online-scams-continue-to-cost-australians

---

## Issues to Open Manually

*GitHub issue creation output below — use these if automated creation fails.*

---

### Issue A: [threat-intel] Flag Cloudflare Workers/Pages/Trycloudflare as suspicious hosting in checkUrl

**Title:** `[threat-intel] Flag Cloudflare Workers/Pages/Trycloudflare as suspicious phishing hosting`

**Body:**

**Summary:** Cloudflare's free-tier developer platforms (`*.workers.dev`, `*.pages.dev`, `*.trycloudflare.com`) are the dominant phishing-hosting infrastructure of 2025-2026. The EvilTokens PhaaS kit (active since Feb 2026) chains these with Railway.app for credential exfiltration. 344+ organisations in Australia and globally were compromised in a March 2026 wave. These domains are rated "trusted" by enterprise URL filters, making them highly evasive.

**Proposed change to `lib/scamDetector.ts` — `checkUrl()` function:**

Add a `SUSPICIOUS_HOSTING` constant near the existing `IPFS_GATEWAYS` constant:
```typescript
// Free-tier cloud dev platforms used as phishing hosting infrastructure.
// workers.dev, pages.dev (Cloudflare), and trycloudflare.com (ephemeral tunnels)
// are rated "trusted" by URL filters but are the dominant PhaaS hosting
// substrate of 2025-2026. railway.app and vercel.app are abused as
// credential-exfiltration endpoints in multi-hop phishing chains.
const SUSPICIOUS_HOSTING = [
  "workers.dev", "pages.dev", "trycloudflare.com",
  "railway.app", "vercel.app",
];
```

Then in `checkUrl()`, after the IPFS block:
```typescript
const hostingMatch = SUSPICIOUS_HOSTING.find((h) => hostname.endsWith(h));
if (hostingMatch) {
  flags.push(`Hosted on ${hostingMatch} — a free developer platform frequently abused to host phishing pages because it inherits a trusted reputation`);
  score += hostingMatch.endsWith("vercel.app") || hostingMatch.endsWith("railway.app") ? 25 : 35;
}
```

**False-positive risk:** Low for `workers.dev` and `trycloudflare.com` (AU consumer services never use these URLs). Medium for `vercel.app` and `railway.app` (more legitimate preview sites exist) — hence the lower score for those two.

**IOC examples:**
- `ato-verify-abc123.workers.dev`
- `mygov-login-update.pages.dev`
- `willing-bones-random.trycloudflare.com`
- `credential-collector.railway.app`

**Sources:**
- https://ringsafe.in/cloudflare-fronted-phishing-in-2026-how-workers-pages-tunnels-and-r2-became-default-phishing-infrastructure/
- https://labs.cloudsecurityalliance.org/research/csa-research-note-oauth-device-code-phishing-m365-20260325-c/
- https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html

**Roadmap:** `docs/threat-intel/2026-07-01-threat-roadmap.md` (D1, D2)

---

### Issue B: [threat-intel] Add superannuation phishing keywords and super fund brand impersonation

**Title:** `[threat-intel] Detect superannuation phishing — SMSF early access and super fund impersonation`

**Body:**

**Summary:** A phishing campaign in May–June 2026 impersonated major AU super funds (AustralianSuper, UniSuper, REST, etc.) with messages urging victims to "secure your super before June 1" or set up a fake SMSF to access funds early. ASIC issued media release 26-014MR and deregistered 95 shell companies linked to crypto-super scams. Neither "smsf" nor any super fund keyword appears in the current codebase.

**Proposed changes to `lib/scamDetector.ts`:**

Add to `REQUEST_WORDS`:
```typescript
"access your super", "unlock your super", "smsf", "self managed super",
"early super release", "super withdrawal", "superannuation transfer",
"early access to super",
```

Add to `URGENCY_WORDS`:
```typescript
"secure your super", "your super balance", "preservation age",
"super fund deadline", "super account suspended",
```

**Proposed changes to `lib/emailHeaders.ts` — `IMPERSONATED_BRANDS`:**
```typescript
"australiansuper", "unisuper", "rest super", "hesta", "sunsuper",
"cbus", "amp super", "mlc super",
```

**Proposed addition to `lib/scamDetector.ts` — `auBrands` in `checkUrl()`:**
```typescript
"australiansuper", "unisuper", "sunsuper", "cbus", "hesta", "ampsuper",
```

**False-positive risk:** Low. "smsf" and "early super release" are AU-specific regulatory terms rarely appearing in non-scam contexts. "your super balance" has some FP risk in legitimate super fund correspondence, but the compound-score model handles this correctly.

**Example IOC messages:**
- `"AustralianSuper: Your account requires verification before June 1. Secure your super now: [link]"`
- `"SMSF setup service — access your super early, legally. Call us today."`

**Sources:**
- https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-014mr-asic-urges-super-trustees-to-step-up-and-address-serious-gaps-in-anti-scam-and-fraud-protections/
- https://moneysmart.gov.au/financial-scams/superannuation-scams

**Roadmap:** `docs/threat-intel/2026-07-01-threat-roadmap.md` (D3, D4, D11)

---

### Issue C: [threat-intel] Add ACCC/Scamwatch/NASC to govMentions in checkSms

**Title:** `[threat-intel] Detect ACCC and Scamwatch impersonation in SMS/calls`

**Body:**

**Summary:** Scamwatch issued a dedicated alert in June 2026 warning that scammers are spoofing ACCC phone numbers (including 1300 302 502 and 1300 795 995) and claiming to call from "the ACCC", "Scamwatch", or "the National Anti-Scam Centre". The irony is significant: the scam-reporting authority is being used as a lure. Currently, "accc", "scamwatch", and "national anti-scam centre" do not appear anywhere in the detection codebase — not in `govMentions`, `IMPERSONATED_BRANDS`, or elsewhere.

**Proposed change to `lib/scamDetector.ts` — `govMentions` array in `checkSms()`:**

Add:
```typescript
"accc", "scamwatch", "national anti-scam centre", "nasc",
"consumer watchdog", "competition and consumer commission",
```

**False-positive risk:** Very low. The ACCC never cold-calls consumers. Any SMS claiming to be from "Scamwatch" or the "consumer watchdog" is almost certainly a scam. The existing flag message ("Claims to be from a government agency — verify directly via official channels") is appropriate.

**Example IOC messages:**
- `"ACCC investigation team calling re: a scam that targeted you. Call 1300 302 502 to protect your funds."`
- `"Scamwatch: Your account has been flagged for investigation. Do not discuss with others."`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-accc-phone-numbers-spoofed-by-scammers
- https://www.nasc.gov.au/news/warning-issued-after-accc-phone-numbers-spoofed-by-scammers

**Roadmap:** `docs/threat-intel/2026-07-01-threat-roadmap.md` (D5)

---

### Issue D: [threat-intel] Add food delivery platform impersonation (DoorDash, Uber Eats, Menulog, Deliveroo)

**Title:** `[threat-intel] Detect food delivery platform impersonation scams (DoorDash, Uber Eats, Menulog)`

**Body:**

**Summary:** Scamwatch issued an alert (June 2026) about scammers impersonating DoorDash, Uber Eats, Menulog, and Deliveroo — targeting customers (fake refunds), restaurants (credential theft), and delivery workers (payment redirection). None of these platform names appear anywhere in the current detection codebase.

**Proposed changes to `lib/scamDetector.ts`:**

1. Add to `auBrands` in `checkUrl()`:
```typescript
"doordash", "ubereats", "menulog", "deliveroo",
```

2. Add a delivery platform check to `checkSms()` by extending `govMentions` (or better, a new `brandMentions` array):
```typescript
"doordash", "uber eats", "ubereats", "menulog", "deliveroo",
```

Note: These should produce a brand-mention signal, not the same "claims to be from a government agency" wording — the flag message should say "claims to be from a delivery platform". Consider whether this warrants a separate brand-impersonation array or extending `govMentions` with an updated flag message template.

**Proposed change to `lib/emailHeaders.ts` — `IMPERSONATED_BRANDS`:**
```typescript
"doordash", "uber eats", "ubereats", "menulog", "deliveroo",
```

**False-positive risk:** Low. Brand-name specific — the URL check only fires when "doordash" appears in a hostname that doesn't end in `.com.au` or the legitimate domain.

**Example IOC messages:**
- `"UberEats: Your recent order has been cancelled. Click here to claim your $14.90 refund: [link]"`
- `"DoorDash: Unusual activity detected. Verify your account: [link]"`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-food-delivery-scams
- https://help.uber.com/en-AU/ubereats/restaurants/article/beware-of-phishing-scams-spoofing-ubereats

**Roadmap:** `docs/threat-intel/2026-07-01-threat-roadmap.md` (D6)

---

### Issue E: [threat-intel] Add NBN Co impersonation and internet disconnection threat to detection

**Title:** `[threat-intel] Detect NBN disconnection threat scam and NBN Co impersonation`

**Body:**

**Summary:** A persistent AU-specific scam uses automated robocalls and SMS claiming to be from "NBN Co" threatening broadband disconnection within 24-48 hours. In 2026, the tactic has evolved to include live agent escalation after the robocall, and an SMS variant with a credential-harvesting link. "nbn" does not appear anywhere in the current detection codebase.

**Proposed changes to `lib/scamDetector.ts`:**

1. Add to `govMentions` in `checkSms()`:
```typescript
"nbn co", "nbn", "national broadband network", "nbnco",
```

2. Add to `URGENCY_WORDS`:
```typescript
"internet will be disconnected", "broadband will be cut off",
"nbn technician", "service disconnected within", "disconnected within 24 hours",
"internet disconnected", "broadband disconnected",
```

**Note on FP risk:** "nbn" alone in a message has some FP risk (news articles, discussions). The compound scoring model already handles this — a message mentioning only "nbn" without urgency/request words won't reach a high score. The `govMentions` flag fires at +25, which is appropriate.

**Example IOC messages:**
- `"NBN Co: Your internet service will be disconnected within 24 hours. Call 1800 XXX XXX to avoid interruption."`
- `"IMPORTANT: NBN technician has detected an issue with your connection. Click here to verify: [link]"`

**Sources:**
- https://www.scamnet.wa.gov.au/scamnet/Scam_types-Attempts_to_gain_your_personal_information-Phishing-NBN_Scams.htm
- https://intrusionx.com.au/blog/nbn-scam-australia-fake-technician-call/

**Roadmap:** `docs/threat-intel/2026-07-01-threat-roadmap.md` (D7)

---

### Issue F: [threat-intel] Expand AI voice-clone follow-up keywords — bail money, kidnapping, stranded abroad

**Title:** `[threat-intel] Expand AI voice-clone follow-up text signals: bail, kidnapping, stranded overseas`

**Body:**

**Summary:** The 2026 AI voice-clone scam has moved well beyond the "Hi Mum" script. Scammers now use bail scenarios ("I've been arrested"), kidnapping scenarios ("We have your grandchild"), and stranded-abroad scenarios ("My wallet was stolen in Bangkok"). The current codebase detects "i've been in an accident", "don't tell mum", "western union", "wire transfer" — but the new scenarios involve different keywords that are not covered.

**Proposed additions to `URGENCY_WORDS` in `lib/scamDetector.ts`:**
```typescript
// AI voice-clone bail/kidnap/stranded escalation (expansion of D17 from 2026-06-21 roadmap)
"bail money", "need bail", "post bail", "get me out of jail",
"stranded overseas", "stuck overseas", "stranded abroad", "wallet stolen overseas",
"do not call police", "don't call the police", "don't contact police",
"emergency transfer", "emergency funds needed",
"we have your",    // kidnapping opener — high specificity
```

**False-positive risk:** Medium for "emergency transfer" and "emergency funds needed" in isolation (could appear in legitimate crowdfunding appeals). "Bail money", "stranded overseas" + secrecy instruction + wire payment mechanism is high-specificity. The compound model handles single-phrase FPs well. "we have your" is very specific and should be composite-tested with surrounding context.

**Sources:**
- https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
- https://www.investigatetv.com/2026/01/23/ai-voice-cloning-scams-target-families-with-fake-kidnapping-calls/

**Roadmap:** `docs/threat-intel/2026-07-01-threat-roadmap.md` (D8)
