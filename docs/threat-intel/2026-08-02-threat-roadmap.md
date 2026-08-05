# Threat Intelligence Roadmap — 2026-08-02

> **Weekly brief for Just Checking, Mate**
> Detection code lives in `lib/`. This file is research-and-proposals only — no `lib/` files are modified here.
> Previous roadmap: `docs/threat-intel/2026-07-01-threat-roadmap.md`
> Note: The 2026-07-26 run's detection changes shipped via PR #109 (TOAD callback, fake investment platforms, myID re-reg) and PR #111 (.shop/.store/.vip TLDs, Chinese authority impersonation, rental bond fraud). That run's roadmap doc was not committed; issue #113 (Scanception PDF QR hybrid) remains open from that run.

---

## (a) Executive Summary — Top 5 Ship-This-Week Changes

Ranked by **impact × ease** (all are additions to existing constants/regex — no architecture changes required):

| # | Recommendation | Why now |
|---|---|---|
| 1 | **Add ngrok.io / ngrok-free.app to `SUSPICIOUS_HOSTING`** | ngrok ephemeral tunnels are the fastest-growing phishing hosting vector of 2025-2026, used identically to `trycloudflare.com`; random-subdomain URLs bypass all reputation filters. Actively documented by Rewterz, Cyble, and Huntress |
| 2 | **Add `github.io` and `netlify.app` to `SUSPICIOUS_HOSTING`** | GitHub Pages and Netlify are now the top-2 "trusted reputation abuse" platforms after Cloudflare — github.io accounts for 47% of all GitHub-abuse credential-phishing (Cofense Q1 2026); Netlify is used in AI-generated phishing and APT Sidewinder government impersonation campaigns |
| 3 | **Add energy utility company brands to detection lists** — AGL, Origin Energy, EnergyAustralia | Origin Energy had an active customer data breach (9.7M records); both AGL and Origin are running documented SMS and email phishing campaigns in AU winter billing season (August 2026). Neither brand appears anywhere in the current codebase |
| 4 | **Add fake voicemail notification signal to `checkSms()` / `checkEmail()`** | Scamwatch has a dedicated Flubot/voicemail-lure page; a new "UpCrypter" campaign using fake voicemail emails was confirmed active August 2025. "You have a new voicemail" is a high-specificity signal with very low FP risk |
| 5 | **Add AU crypto exchange impersonation signals** — CoinSpot, Swyftx | AFP issued a specific warning (2025) about rising AU crypto-exchange impersonation; NASC Q1 2025 crypto phishing losses up 200% ($11.1M). CoinSpot and Swyftx have 2.8M combined AU customers — neither appears in any detection list |

---

## (b) New / Evolved Threats This Week

### T1. ngrok Ephemeral Tunnel Abuse for Phishing (HIGH — escalating, code gap)

**What:** Attackers route phishing pages through ngrok's reverse-proxy tunnels, identical in concept to `trycloudflare.com` (already in `SUSPICIOUS_HOSTING`). ngrok generates random alphanumeric subdomains on `*.ngrok.io` and `*.ngrok-free.app`, making URLs like `3a8b2f.ngrok-free.app` or `random-word.ngrok.io` that have no link to the attacker's actual infrastructure and change after each session. Because `ngrok.io` itself is a legitimate developer platform, corporate URL filters and reputation services pass these through untouched.

**Novel evolution in 2025-2026:** Phishing kits specifically bundle ngrok as a hosting layer (alongside Cloudflare Workers) to create a two-hop evasion chain where both legs inherit trusted reputations. Financial phishing targeting Australian banks (CommBank, ANZ, Westpac) has been observed using this chain.

**AU relevance:** ngrok usage in AU-targeting campaigns is documented in Huntress and Rewterz threat intelligence; the pattern is identical to trycloudflare.com which is already in the codebase.

**Current gap:** `SUSPICIOUS_HOSTING` covers `"trycloudflare.com"` but not `"ngrok.io"` or `"ngrok-free.app"`.

**IOC examples:**
- `3a8b2f.ngrok.io`
- `commbank-verify.ngrok-free.app`
- `ato-login.0.tcp.ngrok.io` (ngrok TCP tunnel variant)

**Sources:**
- https://www.socinvestigation.com/phishing-with-reverse-tunnels-and-url-shorteners-detection-response/
- https://rewterz.com/rewterz-news/rewterz-threat-alert-ngrok-platform-abused-in-phishing-attacks-targeting-financial-organizations
- https://cyble.com/blog/ngrok-platform-abused-by-hackers-to-deliver-a-new-wave-of-phishing-attacks/
- https://www.huntress.com/blog/abusing-ngrok-hackers-at-the-end-of-the-tunnel

---

### T2. GitHub Pages and Netlify as Credential-Phishing Hosting (HIGH — escalating)

**What:** From 2021 to 2025, abuse of GitHub and GitLab Pages has grown year-over-year, with 2025 accounting for ~45% of all observed malicious campaigns using these services (Cofense). `github.io` delivers credential phishing in 47% of GitHub-abuse campaigns. Netlify hosts AI-generated phishing pages (using Lovable, Vercel, and Netlify builders) and was used by APT Sidewinder to impersonate government portals in South Asia — a TTY that will reach AU targets.

**Current gap:** `SUSPICIOUS_HOSTING` already covers `"workers.dev"`, `"pages.dev"`, `"vercel.app"`, and `"r2.dev"` but misses `"github.io"` and `"netlify.app"`. These two now complete the "trusted dev-platform hosting" tier.

**FP consideration:** `github.io` has many legitimate developer sites (portfolios, project docs). Score lower (+20) than workers.dev (+35) to allow for this. `netlify.app` has a similar FP profile to `vercel.app` (currently at +25).

**IOC examples:**
- `ato-gov-au.github.io`
- `mygov-login.netlify.app`
- `commbank-secure.github.io`

**Sources:**
- https://securityboulevard.com/2026/04/the-growing-abuse-of-github-and-gitlab-in-phishing-campaigns/
- https://cofense.com/blog/the-growing-abuse-of-github-and-gitlab-in-phishing-campaigns
- https://ironscales.com/threat-intelligence/rfi-phishing-netlify-credential-harvesting-construction-bid-scam
- https://hunt.io/blog/apt-sidewinder-netlify-government-phishing

---

### T3. Energy Utility Company Impersonation — AGL and Origin Energy (HIGH — active, AU-specific)

**What:** Two documented phishing campaigns impersonating Australian electricity retailers have been running in 2025-2026:

1. **Origin Energy**: MailGuard intercepted a multi-step phishing campaign offering a fake $150 overpayment refund. The phishing flow captures name, address, DOB, email, phone, and then credit-card number + CVV. A second variant claims a "billing error / double charge" and redirects to a credential-harvesting page. Origin Energy also experienced a real customer data breach (names, addresses, DOB, phone numbers disclosed), making personalised follow-up phishing more convincing.

2. **AGL**: Fake SMS messages directing recipients to counterfeit AGL websites. AGL's own security page explicitly warns about these SMS campaigns and references the ACMA Sender ID register.

**AU relevance:** AGL and Origin Energy are the two largest electricity retailers in Australia by customer count. August is the peak of winter billing in AU — household energy bills are at their highest, and "you were overcharged" or "billing dispute" lures are particularly credible right now.

**Current gap:** Neither `"agl"`, `"origin energy"`, `"originenergy"`, `"energyaustralia"`, nor `"energy australia"` appear anywhere in `auBrands`, `IMPERSONATED_BRANDS`, `brandMentions`, or `govMentions`.

**IOC examples:**
- Sender claims: `"AGL"`, `"Origin Energy"`, `"EnergyAustralia"`, `"Alinta Energy"`
- Domains: `agl-refund.top`, `originenergy-billing.xyz`, `energy-australia-account.shop`
- Lure messages: `"AGL: A credit of $86.50 has been applied to your account. To receive your refund, verify your bank details: [link]"`, `"Origin Energy: We've detected a billing error on your account. Click to claim your $150 refund."`

**Sources:**
- https://www.mailguard.com.au/blog/fake-origin-energy-refund-email-targets-australians-with-multi-step-scam
- https://www.mailguard.com.au/blog/origin-energy-billing-mistake-email-a-con
- https://www.agl.com.au/customer-security/scams-phishing-and-fraud/recent-scams
- https://www.sbs.com.au/news/article/not-just-phishing-the-scams-to-watch-for-if-youre-an-origin-energy-customer/3jauqz344

---

### T4. Fake Voicemail Notification Lures — SMS and Email (HIGH — documented Scamwatch page)

**What:** Fake "you have a missed call / new voicemail" SMS messages direct victims to click a link to "listen". The link either:
- Installs malware (historically Flubot, which Scamwatch has a dedicated alert for)
- Redirects to a fake Microsoft 365 / Google Workspace login page (current UpCrypter campaign, August 2025)

The lure generates fake alerts from legitimate services: RingCentral, Microsoft Teams, Google Voice. Crucially, **the voicemail lure is channel-agnostic** — it arrives via SMS and email equally, and the text-side signal is always the same.

**UpCrypter variant (August 2025):** A new phishing campaign uses fake voicemail email attachments to deliver a RAT payload loader. The campaign has targeted manufacturing, technology, healthcare, construction, and retail — with Australia in the geographic spread.

**AU relevance:** Scamwatch has a dedicated Flubot scams page. Australia was one of the primary Flubot targets. The voicemail delivery mechanism remains active in post-Flubot campaigns.

**Current gap:** The word `"voicemail"` does not appear anywhere in `checkSms()`, `checkEmail()`, or any signal list. No detection exists for this very common lure format.

**Proposed signal:** A regex matching voicemail notification patterns in SMS and email bodies, applied in `checkSms()` (and inherited by `checkEmail()` via delegation):

```
/you\s+have\s+a?\s*(new\s+)?(unheard\s+|missed\s+|pending\s+)?voicemail/i
/\d+\s+unheard\s+voicemail/i
/listen\s+(to|your)\s+(new\s+)?voicemail/i
/missed\s+call\s+notification.*click/i
```

**FP risk:** Low. Legitimate voicemail-to-email services (Google Voice, Teams, Zoom) deliver the audio inline, not via click-through links in separate SMS messages. The pattern "listen to your voicemail at: [link]" arriving by SMS is essentially never legitimate.

**IOC examples:**
- `"You have 1 new voicemail. Listen here: https://abc.ngrok-free.app/vm"`
- `"Missed call: 3 minutes ago. Click to listen to your voicemail: https://storage.click/v"`
- `"Microsoft Teams: You have a new voicemail from +61 4XX XXX XXX. Listen: https://mgt.azurestaticapps.net/vm?id=..."`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts/flubot-scams
- https://thehackernews.com/2025/08/phishing-campaign-uses-upcrypter-in.html
- https://hoxhunt.com/blog/fake-voicemail-notification-phishing-scam
- https://wtop.com/cyber-security/2025/10/data-doctors-beware-of-fake-voicemail-notifications/

---

### T5. AU Crypto Exchange Impersonation — CoinSpot and Swyftx (HIGH — AFP warning)

**What:** The Australian Federal Police issued a specific media release warning Australians about rising cryptocurrency exchange impersonation scams. The National Anti-Scam Centre received over 16,700 phishing reports in Q1 2025, resulting in $11.1 million in losses — a **200% increase** year-on-year, with more than 75% of losses tied to cryptocurrency phishing.

Scammers contact victims by SMS claiming their CoinSpot or Swyftx account has been "compromised" or "locked", directing them to a fake login page that captures credentials and real-time 2FA codes in an Adversary-in-the-Middle (AiTM) chain. CoinSpot and Swyftx together have approximately 2.8 million Australian customers.

Swyftx explicitly warns users about: "unsolicited SMS messages appearing to be from Swyftx" and "fake versions of Swyftx websites".

**Current gap:** The existing code detects `"coinbase"` in `CALLBACK_BRANDS` (for TOAD/callback phishing), but no AU-specific crypto exchange appears in `auBrands` (URL typosquatting), `IMPERSONATED_BRANDS` (email header check), or `brandMentions` (SMS brand-claim check).

**IOC examples:**
- SMS: `"CoinSpot: Unusual activity detected on your account. Verify your identity to prevent suspension: https://coinspot-verify.top"`
- SMS: `"Swyftx Security: Your account has been locked due to suspicious login. Restore access: https://swyftx-account.xyz"`
- Domains: `coinspot-secure.com.au`, `swyftx-verify.top`, `coinspot-login.shop`

**Sources:**
- https://www.afp.gov.au/news-centre/media-release/australian-victims-warned-over-rising-cryptocurrency-exchange
- https://www.nasc.gov.au/news/criminals-use-%E2%80%98account-compromise-scams-to-scare-australians-and-steal-their-money-or-cryptocurrency
- https://swyftx.com/au/security/latest-scams/
- https://coinspot.zendesk.com/hc/en-us/articles/4936454600719-Know-your-Social-Media-Scams

---

### T6. ATO Outstanding Tax Debt / Audit Threat SMS — Tax Season Escalation (HIGH — 75% July increase)

**What:** The ATO received **7,420 impersonation scam reports in July 2025 alone** — a 75% jump over June and the highest single-month total recorded. The surge corresponds to the start of AU tax return season (lodgements open July 1). Scam messages move away from the refund/rebate lure (already detected via `URGENCY_TAXTIME`) and instead use a **debt-threat script** designed to create fear:

> *"The ATO has detected an outstanding tax debt on your account. Failure to respond within 48 hours will result in legal action and penalties."*

This is distinct from the existing `URGENCY_TAXTIME` signals (`"tax refund waiting"`, `"refund is waiting"`, `"government rebate"`) which target the reward-seeking response rather than the fear response. The ATO explicitly states: *"The ATO will never send an unsolicited SMS containing a hyperlink."* A real ATO debt notice arrives in the myGov inbox or by post.

**AU relevance:** Peak AU tax season (July–October). The ATO confirmed the 75% increase in July 2025 reporting.

**Current gap:** `URGENCY_TAXTIME` covers refund/rebate lures; `govMentions` covers "ato" (which fires +25 for claiming to be a government agency). But the **debt-threat vocabulary** is not in any URGENCY list, meaning these messages only score via the generic "ato" mention + any URL. Adding debt-threat language to `URGENCY_TAXTIME` will correctly compound with the existing govMentions hit.

**Proposed additions to `URGENCY_TAXTIME`:**
- `"outstanding tax debt"`, `"tax debt notice"`, `"overdue tax debt"`
- `"avoid ato penalties"`, `"ato penalty notice"`, `"ato legal action"`
- `"ato audit notice"`, `"your account has been flagged for audit"`, `"ato has flagged your account"`
- `"tax debt referred to recovery"`, `"recovery action has commenced"`

**FP risk:** Medium for isolated phrases in newsletters/financial news. Compound scoring (ato mention + debt threat + URL) correctly flags scam patterns while generic financial articles won't compound.

**Sources:**
- https://thekalculators.com.au/tax-scams-and-how-to-avoid-them/
- https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts
- https://gotaxaustralia.com/en/2025/02/12/avoid-scams-spot-fake-ato-sms/
- https://itp.com.au/protect-yourself-from-ato-tax-scams-2025-safety-guide/

---

### T7. Fake International Parcel Customs Duty / Clearance Fee SMS (MEDIUM — Scamwatch documented)

**What:** A persistent scam variant targets online shoppers by claiming their international parcel is held at customs pending a small "customs processing fee" (typically $1.99–$8.99). Victims are sent to a fake Australia Post or Border Force lookalike page that captures credit-card details after payment of the nominal fee. Scamwatch has a dedicated page for this variant.

**Key distinction from existing signals:** The existing `URGENCY_PARCEL` signals cover **delivery failure** lures (`"parcel held"`, `"delivery failed"`, `"redelivery fee"`, `"invalid postal code"`). The **customs fee** variant uses completely different vocabulary — `"customs"`, `"import duty"`, `"clearance fee"`, `"held at customs"` — and arrives at a different moment in the shopping journey (post-purchase, before delivery) with different emotional levers.

**Australia Border Force states:** *"The ABF will NEVER contact Australians via email or SMS stating it requires payment of duty, GST or other charges in order for the purchaser to receive their goods."* This makes "customs fee" in any SMS with a link a near-zero false-positive scam signal.

**IOC examples:**
- `"Your international parcel is held at Australian customs. A fee of $4.99 is required for clearance: auspost-customs[.]com"`
- `"AusPost: Customs clearance required. Pay the $2.50 import duty to release your package."`
- `"BORDER FORCE: Your parcel has been flagged. Customs fee $8.99 must be paid within 24 hours."`

**Proposed additions to `URGENCY_PARCEL`:**
- `"customs fee"`, `"customs charge"`, `"customs clearance"`, `"import duty"`, `"clearance fee"`
- `"held at customs"`, `"release your parcel"`, `"held at border"`

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/fake-customs-email-targets-online-shoppers
- https://auspost.com.au/about-us/about-our-site/online-security-scams-fraud
- https://scamchecker.app/guides/parcel-delivery-scams-australia
- https://phony.com.au/guides/australia-post-scam

---

### T8. Medibank / Private Health Insurer Impersonation (MEDIUM — ongoing post-breach exploitation)

**What:** Scamwatch has a dedicated advisory about scammers exploiting the Medibank data breach (October 2022, 9.7 million customer records). Medibank's own social media confirmed an "active SMS phishing campaign targeting Australians". Scammers use stolen contact data to send personalised lures appearing to come from Medibank, Bupa, nib, or HCF.

The lure types include: policy renewal reminders with embedded payment links; Medicare rebate phishing (Medibank rebates often arrive alongside Medicare); "your private health insurance is about to lapse" urgency messages; and data-breach follow-up lures ("we need to verify your identity was not compromised").

**AU relevance:** Private health insurance in Australia has an annual deadline cycle; the July/August window coincides with the Australian Government Rebate calculation period, making it a seasonally active lure.

**Current gap:** `"medibank"`, `"bupa"`, `"nib"`, `"hcf"` do not appear anywhere in `brandMentions`, `IMPERSONATED_BRANDS`, or `auBrands`.

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts/medibank-private-data-breach
- https://www.cyber.gov.au/about-us/alerts/medibank-private-cyber-security-incident
- https://www.medibank.com.au/help/security-and-privacy/article/how-to-spot-scam-text-messages/

---

### T9. State Government Agency Impersonation — VicRoads, Revenue NSW (MEDIUM — MailGuard documented)

**What:** MailGuard documented a phishing email campaign impersonating VicRoads (Victoria's roads authority) and VCAT (Victorian Civil and Administrative Tribunal), delivering a malware payload. State government agencies are a natural phishing target in AU: they handle driver licences, vehicle registration, fines, land tax and stamp duty — all of which create urgent payment scenarios that mirror scam scripts.

Likely state-level impersonation targets based on service profiles:
- **VicRoads** — rego renewal, driver licence, traffic infringement notices
- **Revenue NSW / Service NSW** — land tax, payroll tax, stamp duty, driver licence
- **Queensland Revenue Office / Transport and Main Roads** — vehicle registration, fines
- **Western Australian Department of Transport** — rego renewal

**Current gap:** `govMentions` includes ATO, myGov, Centrelink, AFP, ACCC, Scamwatch, ACSC etc. (all federal) but no state government agencies.

**Sources:**
- https://www.mailguard.com.au/blog/payload-email-scam-spoofing-vicroads-and-vcat-circulates
- https://www.nsw.gov.au/ministerial-releases/avoid-click-trap-and-stay-scam-aware

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | FP Risk | Priority |
|---|--------|---------------|-------------|---------|----------|
| D1 | ngrok ephemeral tunnel hosting | Add `"ngrok.io"`, `"ngrok-free.app"` to `SUSPICIOUS_HOSTING`; score +35 (same as workers.dev — identical evasion profile) | `lib/scamDetector.ts` | Low — no AU consumer service ever uses ngrok URLs | HIGH |
| D2 | GitHub Pages / Netlify hosting | Add `"github.io"` (+20) and `"netlify.app"` (+25) to `SUSPICIOUS_HOSTING`; lower scores than workers.dev to account for legitimate dev portfolios | `lib/scamDetector.ts` | Medium — many legitimate project/portfolio sites on github.io; compound scoring handles this | HIGH |
| D3 | Energy utility impersonation (URL) | Add `"agl"`, `"originenergy"`, `"energyaustralia"`, `"alintaenergy"` to `auBrands` in `checkUrl()` | `lib/scamDetector.ts` | Low — "agl" matches in brand check are specific; `.com.au` guard already excludes real domains | HIGH |
| D4 | Energy utility impersonation (SMS/email) | Add `"agl"`, `"origin energy"`, `"originenergy"`, `"energy australia"`, `"energyaustralia"`, `"alinta energy"` to `brandMentions` in `checkSms()`; add to `IMPERSONATED_BRANDS` in `emailHeaders.ts` | `lib/scamDetector.ts`, `lib/emailHeaders.ts` | Low — brand-name specific; "energy australia" is the specific trading name | HIGH |
| D5 | Fake voicemail lure | Add a `voicemailLure` regex block to `checkSms()` (which `checkEmail()` delegates to): match `"you have a new voicemail"`, `"unheard voicemail"`, `"listen to your voicemail"`, `"missed call notification.*click"` patterns; flag +20 | `lib/scamDetector.ts` | Low — "listen to your voicemail at: [link]" in an SMS has essentially no legitimate use | HIGH |
| D6 | AU crypto exchange impersonation | Add `"coinspot"`, `"swyftx"` to `auBrands` in `checkUrl()`; add `"coinspot"`, `"swyftx"`, `"binance"` (global reach, AU customers) to `brandMentions` in `checkSms()` and `IMPERSONATED_BRANDS` in `emailHeaders.ts` | `lib/scamDetector.ts`, `lib/emailHeaders.ts` | Low — very specific brand names | HIGH |
| D7 | ATO tax debt threat language | Add to `URGENCY_TAXTIME`: `"outstanding tax debt"`, `"tax debt notice"`, `"overdue tax debt"`, `"ato penalty notice"`, `"ato legal action"`, `"ato audit notice"`, `"flagged for audit"`, `"referred to recovery"` | `lib/scamDetector.ts` | Medium — individual phrases appear in financial media; compound model (+ ato govMentions hit + URL) correctly identifies scams | HIGH |
| D8 | Parcel customs / import duty fee | Add to `URGENCY_PARCEL`: `"customs fee"`, `"customs charge"`, `"customs clearance"`, `"import duty"`, `"clearance fee"`, `"held at customs"`, `"release your parcel"`, `"held at border"` | `lib/scamDetector.ts` | Low — ABF never requests payment via SMS; "customs fee" in any SMS is essentially scam-specific | MEDIUM |
| D9 | Private health insurer impersonation | Add `"medibank"`, `"bupa"`, `"nib"`, `"hcf"`, `"ahm"` to `brandMentions` in `checkSms()`; add to `IMPERSONATED_BRANDS` in `emailHeaders.ts`; add `"medibank"`, `"bupa"` to `auBrands` in `checkUrl()` | `lib/scamDetector.ts`, `lib/emailHeaders.ts` | Low — brand-name specific | MEDIUM |
| D10 | State government impersonation | Add `"vicroads"`, `"revenue nsw"`, `"service nsw"`, `"servicensw"`, `"transport nsw"`, `"qld transport"`, `"vcat"` to `govMentions` in `checkSms()` | `lib/scamDetector.ts` | Low — these agency names don't appear in consumer contexts outside official comms | MEDIUM |

---

## (d) Lower-Priority / Watchlist Items

- **`glitch.me`, `azurestaticapps.net`, `render.com`** — Additional free-tier cloud hosts with documented phishing abuse. Lower priority than github.io/netlify.app due to smaller AU footprint; add in next run if campaigns are confirmed.

- **`Lovable.ai` / AI-generated phishing sites** — Trend Micro tracked a surge in phishing using AI website builders (Lovable, V0, Bolt). The hosting domain varies; pattern-matching the builder is not practical — existing TLD and hosting checks catch the landing pages when they use known hosting.

- **PayID / NPP fraud** — "Your PayID has been locked" or "A $X payment to your PayID is pending — confirm here" lures are emerging. No specific text patterns confirmed with enough confidence for this run; monitor Scamwatch and NPP Australia advisories. Add in next run if AU-specific IOCs emerge.

- **Private ATO myTax feature exploitation** — As myTax adds new features (pre-fill, deductions), scammers craft more specific lures. The generic "ato" + govMentions + URL signal fires, but watch for new vocabulary (e.g. `"pre-fill data mismatch"`, `"myTax account locked"`).

- **Fake scholarship / HECS-HELP debt SMS** — Student loan changes and HECS-HELP indexation controversy create potential for scam lures. No confirmed AU campaigns yet.

- **RCS phishing** — Rich Communication Services (Google Messages on Android) can bypass the ACMA SMS Sender ID register. No text-side detection possible; a systemic carrier-level issue. Watchlist only.

- **Issue #113 (Scanception PDF QR hybrid)** — Remains open from the 2026-07-26 run. The proposed regex extension to the quishing block in `checkSms()` is precisely scoped and ready to implement — one of the easiest outstanding wins.

---

## (e) Full Source List

1. SOCInvestigation — Phishing with reverse tunnels and ngrok: https://www.socinvestigation.com/phishing-with-reverse-tunnels-and-url-shorteners-detection-response/
2. Rewterz — ngrok abused in phishing targeting financial organizations: https://rewterz.com/rewterz-news/rewterz-threat-alert-ngrok-platform-abused-in-phishing-attacks-targeting-financial-organizations
3. Cyble — ngrok platform abused for phishing wave: https://cyble.com/blog/ngrok-platform-abused-by-hackers-to-deliver-a-new-wave-of-phishing-attacks/
4. Huntress — Abusing ngrok: hackers at the end of the tunnel: https://www.huntress.com/blog/abusing-ngrok-hackers-at-the-end-of-the-tunnel
5. SecurityBoulevard — Growing abuse of GitHub and GitLab in phishing (April 2026): https://securityboulevard.com/2026/04/the-growing-abuse-of-github-and-gitlab-in-phishing-campaigns/
6. Cofense — GitHub and GitLab abuse in phishing campaigns: https://cofense.com/blog/the-growing-abuse-of-github-and-gitlab-in-phishing-campaigns
7. IRONSCALES — Netlify credential-harvesting bid scam: https://ironscales.com/threat-intelligence/rfi-phishing-netlify-credential-harvesting-construction-bid-scam
8. Hunt.io — APT Sidewinder abuses Netlify for government impersonation: https://hunt.io/blog/apt-sidewinder-netlify-government-phishing
9. MailGuard — Origin Energy fake refund email: https://www.mailguard.com.au/blog/fake-origin-energy-refund-email-targets-australians-with-multi-step-scam
10. MailGuard — Origin Energy billing mistake phishing: https://www.mailguard.com.au/blog/origin-energy-billing-mistake-email-a-con
11. AGL — Recent scams page: https://www.agl.com.au/customer-security/scams-phishing-and-fraud/recent-scams
12. SBS News — Origin Energy customer scam warnings: https://www.sbs.com.au/news/article/not-just-phishing-the-scams-to-watch-for-if-youre-an-origin-energy-customer/3jauqz344
13. Scamwatch — Flubot scams dedicated page: https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts/flubot-scams
14. The Hacker News — UpCrypter fake voicemail phishing campaign (August 2025): https://thehackernews.com/2025/08/phishing-campaign-uses-upcrypter-in.html
15. Hoxhunt — Fake voicemail notification phishing: https://hoxhunt.com/blog/fake-voicemail-notification-phishing-scam
16. WTOP / Data Doctors — Beware of fake voicemail notifications: https://wtop.com/cyber-security/2025/10/data-doctors-beware-of-fake-voicemail-notifications/
17. AFP — Australian victims warned over rising cryptocurrency exchange impersonation: https://www.afp.gov.au/news-centre/media-release/australian-victims-warned-over-rising-cryptocurrency-exchange
18. NASC — Criminal "account compromise" scams targeting crypto: https://www.nasc.gov.au/news/criminals-use-%E2%80%98account-compromise-scams-to-scare-australians-and-steal-their-money-or-cryptocurrency
19. Swyftx — Latest scams and security alerts: https://swyftx.com/au/security/latest-scams/
20. CoinSpot — Know your social media scams: https://coinspot.zendesk.com/hc/en-us/articles/4936454600719-Know-your-Social-Media-Scams
21. The Kalculators — Tax scams AU 2025-26: https://thekalculators.com.au/tax-scams-and-how-to-avoid-them/
22. ATO — Scam alerts: https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts
23. GoTax Australia — Fake ATO SMS guide (February 2025): https://gotaxaustralia.com/en/2025/02/12/avoid-scams-spot-fake-ato-sms/
24. ITP Australia — ATO tax scams 2025 safety guide: https://itp.com.au/protect-yourself-from-ato-tax-scams-2025-safety-guide/
25. Scamwatch — Fake customs email targets online shoppers: https://www.scamwatch.gov.au/about-us/news-and-alerts/fake-customs-email-targets-online-shoppers
26. Australia Post — Scam alerts: https://auspost.com.au/about-us/about-our-site/online-security-scams-fraud/scam-alerts
27. ScamChecker — Parcel delivery scams Australia: https://scamchecker.app/guides/parcel-delivery-scams-australia
28. Phony.com.au — Australia Post scam SMS guide: https://phony.com.au/guides/australia-post-scam
29. Scamwatch — Medibank Private data breach advisory: https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts/medibank-private-data-breach
30. Cyber.gov.au — Medibank Private cyber security incident: https://www.cyber.gov.au/about-us/alerts/medibank-private-cyber-security-incident
31. Medibank — How to spot scam text messages: https://www.medibank.com.au/help/security-and-privacy/article/how-to-spot-scam-text-messages/
32. MailGuard — VicRoads and VCAT email scam: https://www.mailguard.com.au/blog/payload-email-scam-spoofing-vicroads-and-vcat-circulates
33. NSW Government — Avoid the click trap (scam awareness): https://www.nsw.gov.au/ministerial-releases/avoid-click-trap-and-stay-scam-aware

---

## Issues to Open (HIGH priority — 6 this run)

| Issue title | D# | Already exists? |
|---|---|---|
| `[threat-intel] Add ngrok.io / ngrok-free.app to SUSPICIOUS_HOSTING` | D1 | No |
| `[threat-intel] Add github.io and netlify.app to SUSPICIOUS_HOSTING` | D2 | No |
| `[threat-intel] Detect energy utility impersonation — AGL, Origin Energy, EnergyAustralia` | D3/D4 | No |
| `[threat-intel] Detect fake voicemail notification lures in checkSms / checkEmail` | D5 | No |
| `[threat-intel] Detect AU crypto exchange impersonation — CoinSpot, Swyftx, Binance` | D6 | No |
| `[threat-intel] Add ATO tax debt / audit threat language to URGENCY_TAXTIME` | D7 | No |
