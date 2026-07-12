# Threat Intelligence Roadmap — 2026-07-12

> **Weekly brief for Just Checking, Mate**
> Detection code lives in `lib/`. This file is research-and-proposals only — no `lib/` files are modified here.
> Previous roadmap: `docs/threat-intel/2026-07-01-threat-roadmap.md` (D1–D13 all implemented).
> Open issues from previous run (2026-07-05): #73–#78 (ClickFix, device-code phishing, WhatsApp pig-butchering, .zip/.mov/.lat TLDs, ACMA Unverified override, tax-time keywords) — none yet merged.

---

## (a) Executive Summary — Top 5 Ship-This-Week Changes

Ranked by **impact × ease** (all are string/regex additions to existing lists — no architecture changes):

| # | Recommendation | Why now |
|---|---|---|
| 1 | **Add "product recall" / "safety recall" / "recall alert" lure keywords to `URGENCY_WORDS`** (`URGENCY_RECALL` sub-group) | Globally surging attack vector confirmed in AU in 2026; Amazon explicitly states it never uses SMS for recalls — making this a near-zero-FP signal in that context; TrendMicro and ACCC both flagging this campaign in May–June 2026 |
| 2 | **Add `"qantas"` and `"velocity"` to `auBrands` in `checkUrl()`** | `"qantas"` is in `emailHeaders.ts` `IMPERSONATED_BRANDS` but NOT in `scamDetector.ts` `auBrands` — a URL like `qantas-points-verify.workers.dev` scores 0 on brand impersonation today; ACCC issued a dedicated Qantas impersonation alert (Feb 2026) and Scamwatch still lists it as top-3 impersonated loyalty brand |
| 3 | **Add `"amazon"` and `"youtube"` to `brandMentions` in `checkSms()`** | Scamwatch June 2026 alert specifically names Amazon and YouTube as recruiter SMS impersonators in the fake task/pig-butchering funnel; `"amazon"` is in `auBrands` (URL) and `IMPERSONATED_BRANDS` (email) but absent from the SMS `brandMentions` list |
| 4 | **Add `"r2.dev"` to `SUSPICIOUS_HOSTING`** | Cloudflare R2 object storage is now named alongside Workers/Pages/Tunnels as a core phishing hosting layer in 2026 threat reporting; current code covers workers.dev, pages.dev, trycloudflare.com — but not r2.dev, leaving a gap in the Cloudflare infrastructure suite |
| 5 | **Extend `URGENCY_TOLL` with rego-restriction and toll-penalty phrasing** (Operation Road Trap) | Bitdefender's April 2026 "Operation Road Trap" report documents 79,000+ fake Linkt/toll messages with new vocabulary not currently in `URGENCY_TOLL`: "rego restrictions", "toll penalty", "vehicle registration suspended", "recovery action" |

---

## (b) New / Evolved Threats This Week

### T1. Amazon Fake Product Recall SMS Lure (HIGH — globally surging, AU-confirmed)

**What:** A new wave of SMS and email phishing impersonating Amazon claims that "an item from your recent order has been flagged in a safety review and is now subject to a recall." Victims are asked to click a link to "review recall details and submit a refund request." The product description is intentionally vague ("an item from your recent order") so the message convinces anyone who has ever ordered from Amazon. Amazon's own policy states it **never** sends recall notifications via SMS — making any such message a confirmed scam.

**Novel elements vs. previous Amazon impersonation in the codebase:**
The `auBrands` check catches typosquatted Amazon domains in URLs. The `IMPERSONATED_BRANDS` check in `emailHeaders.ts` catches display-name masking. But **"product recall"**, **"safety recall"**, **"recall alert"**, and **"recall notice"** are absent from `URGENCY_WORDS`, `REWARD_WORDS`, and `REQUEST_WORDS`. A victim pasting an Amazon recall SMS would get little signal from the current detector.

**AU relevance:** Amazon Australia has millions of active customers. The vague product description maximises hit rate. TrendMicro confirmed AU recipients in May 2026. Bitdefender named it in their global smishing sweep.

**IOC patterns:**
- Trigger phrases: `"product recall"`, `"safety recall"`, `"recall alert"`, `"recall notice"`, `"item has been recalled"`, `"safety review"` + `"refund"` + link
- Sender ID: spoofed `"Amazon"` sender name (will show `"Amazon - Unverified"` post-ACMA July 2026)
- URL shape: shortened URLs (cutt.ly, bit.ly) or domains like `amazon-recall-[country].xyz`, `amazon-safetyalert.top`
- FP note: Amazon does send genuine recall emails (via email, push, not SMS) — but the phrase "safety recall" appearing alongside a link and urgency language in an SMS is essentially a confirmed scam signal

**Sources:**
- TrendMicro (May 2026): https://news.trendmicro.com/2026/05/05/fake-amazon-product-recall-texts/
- Fox News consumer warning (2026): https://www.foxnews.com/tech/amazon-recall-text-scam-comes-red-flags
- Malwarebytes — scammers pose as Amazon support: https://www.malwarebytes.com/blog/news/2026/04/scammers-pose-as-amazon-support-to-steal-your-account
- Consumer Affairs — Amazon recall alert text scam: https://www.consumeraffairs.com/news/that-amazon-recall-alert-text-its-probably-a-scam-021826.html

---

### T2. Qantas Impersonation Surge — Brand Missing from URL Checker (HIGH — ACCC alert, code gap)

**What:** The ACCC issued a dedicated Scamwatch alert about a "spike" in Qantas impersonation scams in February 2026, connected to the Qantas data breach of July 2025 (in which an AI-generated voice clone of a Qantas employee tricked a Manila support agent). Qantas now ranks among the **top 3 most-impersonated loyalty programs** in Australia. Scams use:
1. Points-expiry SMS lures ("Your 12,846 Rewards points will expire on 3 February — claim now")
2. Refund-themed phishing emails ("You are entitled to a $180 flight credit")
3. Typosquatted domains like `qantaspoins.com` (missing the second 't'), `qantas-points-verify.xyz`

**Code gap:** `"qantas"` appears in `emailHeaders.ts` `IMPERSONATED_BRANDS` — so the email header checker flags it. But `"qantas"` is **absent** from `auBrands` in `scamDetector.ts`, meaning `checkUrl()` will not flag `qantas-points.trycloudflare.com` or `qantaspoins.xyz` for brand impersonation. The existing "points will expire" / "loyalty points" entries in `REWARD_WORDS` do catch the SMS text, but the URL side is blind.

Similarly, `"velocity"` (Velocity Frequent Flyer program) is in `IMPERSONATED_BRANDS` but not in `auBrands`.

**AU relevance:** Qantas Frequent Flyer has 15+ million members. The breach means targeted individuals are particularly susceptible. Still actively reported as of July 2026.

**IOC patterns:**
- Typosquatted domains: `qantaspoins[.]com`, `qantas-points[.]xyz`, `qantas-rewardscenter[.]top`, `velocity-rewards[.]site`
- SMS text (already partially detected): "Your [N] Qantas points will expire — tap to claim"
- Sender domain in email: `erami@capdata-osmozium.com`, `@novatools.com`, `@drcoindreau.com` (non-Qantas; display-name masking already flagged)
- Reply-Y bypass (already detected in checkSms)

**Sources:**
- Scamwatch alert: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-qantas-impersonation-scam
- ACCC — surge in Qantas impersonation: https://australianaviation.com.au/2026/02/accc-warns-of-surge-in-qantas-impersonation-scams/
- Travel Weekly alert: https://travelweekly.com.au/alert-increased-reports-of-scammers-impersonating-qantas-points/
- Aviation A2Z — loyalty points targeting: https://aviationa2z.com/index.php/2026/02/10/qantas-warns-customers-of-phishing-scams/

---

### T3. Amazon and YouTube as Fake SMS Recruiter Brands (HIGH — Scamwatch June 2026)

**What:** Scamwatch's June 2026 alert confirmed that scammers are impersonating **Amazon** and **YouTube** as recruiters, sending SMS messages offering "well-paid, flexible, task-based work from home" roles. The pipeline:
1. SMS claims: "Amazon/YouTube has [20] openings for e-commerce assistant / product rating roles"
2. Victim responds; scammer moves conversation to WhatsApp or Telegram
3. Victim completes small paid tasks to build trust
4. Victim is asked to "top up" crypto account with own funds — pig-butchering classic finale

**Code gap:** The existing `jobSignals` composite in `checkSms()` already detects the task/job funnel phrases (rate products, simple tasks, earn $X, etc.). And `"amazon"` IS checked in `auBrands` (URL) and `IMPERSONATED_BRANDS` (email). But `"amazon"` and `"youtube"` are **absent** from `brandMentions` in `checkSms()`. A message like "Amazon is hiring for flexible online tasks — reply to learn more" would not get a brand impersonation flag, only the weaker `jobSignals` composite.

**Note:** `"amazon"` in `brandMentions` has medium FP risk (Amazon sends legitimate delivery/account texts to AU customers). Adding it specifically to `brandMentions` (the ≤+20 consumer-brand flag, not the ≥+25 gov-agency flag) is appropriate; the compound `jobSignals` check will carry the stronger signal when the recruiter pattern is present.

**AU relevance:** Scamwatch-specific June 2026 alert. Amazon Australia is one of the most recognised brands in AU.

**IOC patterns:**
- Recruitment SMS: "Amazon: We have 20 e-commerce assistant openings. Flexible hours, $45/hr. Reply YES to apply."
- Recruiter SMS: "YouTube Content Team: We're looking for product raters. Earn $35-80/task. Interested?"
- Funnel pivot: invitation to "chat privately on WhatsApp" after initial reply
- Already caught by `jobSignals` ≥2 hit: "rate products", "online tasks", "earn $X", etc. — brand addition creates a double-signal for higher confidence

**Sources:**
- Scamwatch job recruitment scam alert (June 2026): https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-job-recruitment-scams
- TechRadar — Australian scams June 2026: https://www.techradar.com/computing/cyber-security/scams-in-australia
- TrendMicro — Amazon recall/fake recruiter patterns: https://news.trendmicro.com/2026/05/05/fake-amazon-product-recall-texts/

---

### T4. Cloudflare R2 Object Storage (`r2.dev`) — Missing from `SUSPICIOUS_HOSTING` (MEDIUM-HIGH)

**What:** Cloudflare R2 is an S3-compatible object storage service whose public-access URLs use the `*.r2.dev` subdomain pattern. Security reporting from 2026 has confirmed R2 is now used alongside Workers, Pages, and Tunnel to host phishing pages, serve credential-harvesting scripts, and store exfiltrated data. The RingSafe "Cloudflare-Fronted Phishing in 2026" report explicitly names R2 storage alongside Workers/Pages/Tunnels as the four pillars of Cloudflare phishing infrastructure.

**Code gap:** `SUSPICIOUS_HOSTING` in `scamDetector.ts` already lists `"workers.dev"`, `"pages.dev"`, `"trycloudflare.com"`, `"railway.app"`, `"vercel.app"` but **not `"r2.dev"`**. A phishing kit hosted on a Cloudflare R2 bucket passes through `checkUrl()` without the hosting infrastructure flag.

**AU relevance:** Confirmed use in campaigns targeting AU users per the Cloudflare-fronted phishing infrastructure report. R2 is specifically used for serving static credential-harvest pages that look like ATO/myGov login pages.

**IOC patterns:**
- URL pattern: `pub-[hash].r2.dev/phishing.html` or `[tenant-name].r2.dev`
- Common impersonation: ATO myGov login pages, bank login pages
- Typically combines with a redirect from workers.dev or a short URL

**Sources:**
- RingSafe — Cloudflare-fronted phishing 2026: https://ringsafe.in/cloudflare-fronted-phishing-in-2026-how-workers-pages-tunnels-and-r2-became-default-phishing-infrastructure/
- CYFIRMA — cloud-native infrastructure abuse: https://www.cyfirma.com/research/abuse-of-cloud-native-infrastructure-in-modern-phishing-campaigns/
- Malwarebytes — fake Google/Cloudflare verification pages (July 2026): https://www.malwarebytes.com/blog/threat-intel/2026/07/fake-google-and-cloudflare-verification-pages-spread-multiple-malware-families

---

### T5. Operation Road Trap — New URGENCY_TOLL Vocabulary (MEDIUM)

**What:** Bitdefender's "Operation Road Trap" report (tracking since December 2025, active as of April 2026) documented 79,000+ fake Linkt/toll text messages across 40 distinct campaigns targeting Australian and New Zealand drivers. The report identified phrasings **not currently in `URGENCY_TOLL`**:

- `"recovery action"` — "Outstanding toll fees may escalate to **recovery action** and result in rego restrictions"
- `"rego restrictions"` — penalty framing unique to AU
- `"toll penalty"` — differs from "toll fine" already in the list
- `"vehicle registration"` + toll context — a new threat escalation angle

The existing URGENCY_TOLL has: "unpaid toll", "outstanding toll", "overdue toll", "toll payment", "toll fine", "toll invoice", "final toll notice". The new phrasing exploits AU drivers' fear of losing their vehicle registration — a specifically AU-regulatory threat that "toll fine" does not cover.

**AU relevance:** 100% AU-specific. Linkt is AU-only; rego (vehicle registration) is AU colloquialism. Bitdefender specifically named 31,900+ malicious URLs and confirmed AU as primary target.

**IOC patterns:**
- Example SMS: `"Linkt: Your toll remains unpaid. Last reminder — outstanding toll fees may escalate to recovery action and result in rego restrictions. Pay now: https://cutt.ly/..."`
- New phrases: `"rego restrictions"`, `"recovery action"` (in toll context), `"toll penalty"`, `"registration suspended"` (in toll context)
- FP note: "recovery action" and "registration suspended" are used in legitimate contexts; only the toll-context composite matters

**Sources:**
- Bitdefender Operation Road Trap: https://www.bitdefender.com/en-us/blog/labs/operation-road-trap
- Cyber Daily — AU/NZ fake toll scam wave: https://www.cyberdaily.au/security/13527-alert-wave-of-fake-toll-parking-scams-impacting-countries-around-the-world-including-australia-new-zealand
- CyberMate — Linkt toll scam AU 2026: https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/

---

### T6. Celebrity Deepfake Investment Keywords — REWARD_WORDS Gap (MEDIUM)

**What:** AI-generated deepfake videos of prominent Australians (Andrew "Twiggy" Forrest, Gina Rinehart, Dick Smith, TV hosts) are used in fraudulent investment ads. Victims who are already primed by the deepfake then receive follow-up texts or emails using language that is not yet in `REWARD_WORDS`. Specifically: "guaranteed returns", "risk-free investment", "double your money", "exclusive investment opportunity", and the counter-intuitive scammer claim "verified by ASIC" (ASIC never proactively verifies investment platforms via text/email).

**Current coverage:** `REQUEST_WORDS` already has "connect wallet", "approve transaction", crypto signals. `REWARD_WORDS` has "free", "jackpot", "unclaimed", etc. But **investment-specific reward language** — the kind used in the final hook after a deepfake video — is absent.

**Code gap:** Phrases like "guaranteed 15% returns", "risk-free crypto platform", "ASIC-verified trading platform" would score near-zero under current rules unless a crypto or wallet signal is also present.

**AU relevance:** WA Government confirmed $30M in AU losses from celebrity deepfake investment scams. CommBank found 27% of Australians had encountered a deepfake scam in the previous year. 25% jump in AU celebrity-bait investment ads in 2026.

**IOC patterns:**
- "guaranteed returns", "guaranteed profit", "guaranteed daily returns"
- "risk-free investment", "100% safe returns", "no risk trading"
- "double your money", "triple your investment"
- "exclusive investment opportunity", "early access platform"
- "verified by ASIC", "ASIC-approved platform", "endorsed by [famous Australian]"
- These combine with pig-butchering funnel signals already in the detector

**Sources:**
- WA Gov — $30M celebrity crypto losses: https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams
- NSW Gov — celebrity deepfake: https://www.nsw.gov.au/departments-and-agencies/id-support-nsw/learn/scams/celebrity-deepfake
- CommBank deepfake awareness: https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html
- ForteClaim — crypto scam 2026: https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/

---

### T7. DEBULL Tooling — New Device Code Phishing Kit (MEDIUM — escalation of open issue #75)

**What:** The Hacker News reported in July 2026 that "DEBULL Tooling" is a newly identified kit that also abuses Microsoft's Device Code Flow (the same class of attack as EvilTokens covered by open issue #75). DEBULL specifically uses **calendar invite lures** and crafted email chains to deliver device codes, differing from EvilTokens' BEC-style approach.

**Action:** No new issue needed — this is an escalation of open issue #75, which should be updated to note DEBULL as a second active kit in this class. The detection language proposed in #75 (`/microsoft\.com\/devicelogin/i`, `"enter.*device code"`, `"device authorization code"`) would catch DEBULL lures as well. Recommend fast-tracking #75 implementation.

**Sources:**
- The Hacker News — DEBULL targeting M365 (July 2026): https://thehackernews.com/2026/07/debull-tooling-abuses-microsoft-device.html
- The Register — EvilTokens more evil than thought (July 2026): https://www.theregister.com/cyber-crime/2026/07/01/eviltokens-device-code-phishing-kit-totally-more-evil-than-we-all-thought/5265409

---

### T8. AI Voice Clone — Costs $25.8M AUD and Personalisation Escalation (MEDIUM — informational update)

**What:** Security Brief AU confirmed in 2026 that AU AI voice-clone scam losses reached **AUD $25.8 million** in the first half of 2025 alone, and that techniques have escalated to include:
- **Social media voice harvesting** — scammers collect samples from public Facebook videos, TikToks, podcasts
- **Live call voice synthesis** — real-time synthesis during a phone call (not just pre-recorded)
- **Authority figure clones** — Queensland Premier Steven Miles cloned to promote Bitcoin

**Detection status:** Core URGENCY_VOICE_CLONE phrases (bail money, stranded overseas, don't call police, etc.) are now in the codebase from the July 01 run. The July 05 open issues include no new voice-clone issues. No additional text-side signals are identifiable this week. The escalation is informational and appropriate for the watchlist.

**Watchlist note:** The new "safety word" pre-planting tactic — where scammers call *first* to establish a family safe word, then call *again* with a cloned voice *using* that word — has no text-side signal detectable in this app. User education is the only mitigation.

**Sources:**
- Security Brief AU — AU voice clone losses $25.8M: https://securitybrief.com.au/story/ai-voice-cloning-scams-cost-australians-aud-25-8m
- CNN — AI voice cloning scams 2026: https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
- eWeek — AU household/business voice clone alert: https://www.eweek.com/news/ai-voice-cloning-scam-australia-apac/

---

### T9. ClickFix Extended — Fake Google Verification Pages (LOW — extension of open issue #74)

**What:** A July 2026 Malwarebytes report documented a new ClickFix variant using **fake Google reCAPTCHA pages** (as well as fake Cloudflare verification) to deliver Lumma Stealer and Vidar Stealer. The Google variant is an extension of the ClickFix attack class already proposed in open issue #74.

**Detection status:** Issue #74 proposes Win+R / clipboard paste keywords. Google-specific language ("I am not a robot" + paste instruction) would be caught by the same detection if implemented. Recommend no new issue — simply note as a variant when implementing #74.

**Sources:**
- Malwarebytes — fake Google/Cloudflare verification pages (July 2026): https://www.malwarebytes.com/blog/threat-intel/2026/07/fake-google-and-cloudflare-verification-pages-spread-multiple-malware-families

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | FP Risk | Priority |
|---|--------|---------------|-------------|---------|----------|
| D1 | Amazon fake product recall SMS | Add `URGENCY_RECALL` sub-group to `URGENCY_WORDS`: `"product recall"`, `"safety recall"`, `"recall alert"`, `"recall notice"`, `"item has been recalled"`, `"safety review"` (in combo with a link). Compose into `URGENCY_WORDS` like existing sub-groups. | `lib/scamDetector.ts` | Medium for "safety review" alone; low for "recall alert" / "product recall" in SMS context (Amazon policy: never SMS for recalls). Score boost: +15 per hit, same cap as other urgency groups | HIGH |
| D2 | Qantas / Velocity missing from URL brand check | Add `"qantas"` and `"velocity"` to `auBrands` in `checkUrl()`. No other change needed — existing typosquatting logic fires automatically on any hostname containing "qantas" not ending in `.com.au` or `.gov.au`. | `lib/scamDetector.ts` | Low — Qantas's real domain ends `.com.au`; any hostname containing "qantas" that doesn't is almost certainly a typosquat | HIGH |
| D3 | Amazon / YouTube missing from SMS brand check | Add `"amazon"` and `"youtube"` to `brandMentions` in `checkSms()`. The existing flag message ("Claims to be from a well-known company — verify by logging in directly") is appropriate; no wording change needed. | `lib/scamDetector.ts` | Medium for "amazon" (Amazon AU does send legitimate SMSes); low for "youtube" (YouTube never cold-recruits via SMS). The compound `jobSignals` check provides the high-confidence signal when both are present. | HIGH |
| D4 | Cloudflare R2 (`r2.dev`) as phishing host | Add `"r2.dev"` to `SUSPICIOUS_HOSTING`. Score: +25 (same tier as railway.app and vercel.app, not the +35 of workers.dev — R2 has some legitimate public-hosting use). | `lib/scamDetector.ts` | Medium — R2 has legitimate use for static sites; lower score appropriate | MEDIUM |
| D5 | Rego restrictions / toll penalty vocabulary | Extend `URGENCY_TOLL` with: `"rego restrictions"`, `"toll penalty"`, `"vehicle registration suspended"`, `"recovery action"`. Note: "recovery action" is broad — consider only scoring it when also matched with another toll-context signal. | `lib/scamDetector.ts` | Low for "rego restrictions" and "toll penalty"; Medium for "recovery action" alone. The compound scorer handles this correctly since URGENCY_TOLL phrases add cumulatively with other hits. | MEDIUM |
| D6 | Celebrity/ASIC-claim investment bait | Add to `REWARD_WORDS`: `"guaranteed returns"`, `"guaranteed profit"`, `"risk-free investment"`, `"double your money"`, `"exclusive investment opportunity"`. Add a separate HIGH-CONFIDENCE phrase (could be +25 directly): `"verified by asic"` (scammers falsely claim ASIC endorsement — the real ASIC never validates platforms this way via SMS/email). | `lib/scamDetector.ts` | Medium for "guaranteed returns"/"exclusive investment" in isolation; low for "verified by asic" (ASIC does not operate this way). Composite with existing crypto/wallet signals is very high confidence. | MEDIUM |

---

## (d) Lower-Priority / Watchlist Items

- **DEBULL device code kit (July 2026)** — New kit, same attack class as EvilTokens. No new issue; fast-track existing open issue #75. Calendar invite lures are a new delivery vector worth noting when implementing #75.

- **Fake parking meter / EV charger QR sticker scams** — Confirmed in Toronto (April 2026), globally spreading. No AU-specific report confirmed this week, though ACSC/ANZ flagged quishing generally. URL-side signals (suspicious TLD, excessive hyphens, brand typosquatting on `wilson-parking.xyz`) are already caught by existing `checkUrl()` rules. SMS-side: the existing QR prompt detector (`scan this qr code to pay`) should cover digital delivery. No new rule needed.

- **Smishing Triad — AU expansion** — Chinese smishing kit operator "Smishing Triad" (responsible for Operation Road Trap and global toll campaigns) is expanding brand coverage. Watch for impersonation of Transurban, CityLink (Vic), and ConnectEast in addition to Linkt/EastLink. Add these brand names if reports emerge.

- **LINE / KakaoTalk pig-butchering** — Mentioned in prior watchlists. No new AU-specific data this week.

- **`.store` / `.shop` TLDs** — No new AU-specific escalation. Still watchlist. Keep monitoring alongside open issue #77 (`.zip`/`.mov`/`.lat`).

- **ACMA Sender ID Register bypass** — After 1 July 2026, scammers are shifting to numeric sender IDs (which are not subject to the register's "Unverified" label) and international SMS routing via non-AU carriers. This is a telecom-level bypass with no text-side signal to detect. Open issue #78 (override language detection) remains the best available countermeasure.

- **MyID (myGov digital identity rebrand)** — Still watchlist from previous runs. No new IOC data this week.

- **SIM-swap fraud** — Carrier-level issue; no text/URL signal available.

- **Status of previously open issues (#73–#78)** — None of the six issues opened on 2026-07-05 appear to have been merged yet. Recommend prioritising #74 (ClickFix) and #75 (device-code phishing) as they carry the highest impact for enterprise/business users.

---

## (e) Full Source List

1. TrendMicro — Amazon fake product recall texts (May 2026): https://news.trendmicro.com/2026/05/05/fake-amazon-product-recall-texts/
2. Fox News — Amazon recall text scam (2026): https://www.foxnews.com/tech/amazon-recall-text-scam-comes-red-flags
3. Malwarebytes — scammers pose as Amazon support (April 2026): https://www.malwarebytes.com/blog/news/2026/04/scammers-pose-as-amazon-support-to-steal-your-account
4. Consumer Affairs — Amazon recall alert SMS scam: https://www.consumeraffairs.com/news/that-amazon-recall-alert-text-its-probably-a-scam-021826.html
5. Scamwatch — Qantas impersonation alert: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-qantas-impersonation-scam
6. Australian Aviation — ACCC Qantas surge warning (Feb 2026): https://australianaviation.com.au/2026/02/accc-warns-of-surge-in-qantas-impersonation-scams/
7. Travel Weekly AU — Qantas points scam alert: https://travelweekly.com.au/alert-increased-reports-of-scammers-impersonating-qantas-points/
8. Aviation A2Z — Qantas unused loyalty points phishing (Feb 2026): https://aviationa2z.com/index.php/2026/02/10/qantas-warns-customers-of-phishing-scams/
9. Scamwatch — Job recruitment scam alert (June 2026): https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-job-recruitment-scams
10. TechRadar — Australian scams June 2026 overview: https://www.techradar.com/computing/cyber-security/scams-in-australia
11. RingSafe — Cloudflare-fronted phishing 2026 (Workers/Pages/Tunnels/R2): https://ringsafe.in/cloudflare-fronted-phishing-in-2026-how-workers-pages-tunnels-and-r2-became-default-phishing-infrastructure/
12. CYFIRMA — cloud-native infrastructure abuse in phishing: https://www.cyfirma.com/research/abuse-of-cloud-native-infrastructure-in-modern-phishing-campaigns/
13. Malwarebytes — fake Google/Cloudflare verification pages spread malware (July 2026): https://www.malwarebytes.com/blog/threat-intel/2026/07/fake-google-and-cloudflare-verification-pages-spread-multiple-malware-families
14. Bitdefender Labs — Operation Road Trap (toll smishing): https://www.bitdefender.com/en-us/blog/labs/operation-road-trap
15. Cyber Daily AU — AU/NZ fake toll parking scam wave: https://www.cyberdaily.au/security/13527-alert-wave-of-fake-toll-parking-scams-impacting-countries-around-the-world-including-australia-new-zealand
16. CyberMate AU — Linkt toll invoice scam 2026: https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/
17. WA Government — $30M celebrity crypto losses: https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams
18. NSW Government — celebrity deepfake investment scams: https://www.nsw.gov.au/departments-and-agencies/id-support-nsw/learn/scams/celebrity-deepfake
19. CommBank — deepfake awareness study (Jan 2026): https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html
20. ForteClaim — crypto/pig-butchering 2026 global: https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/
21. Security Brief AU — AU voice clone losses AUD $25.8M: https://securitybrief.com.au/story/ai-voice-cloning-scams-cost-australians-aud-25-8m
22. CNN — AI voice cloning scams (May 2026): https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
23. eWeek — AU AI voice clone alert: https://www.eweek.com/news/ai-voice-cloning-scam-australia-apac/
24. The Hacker News — DEBULL device code flow (July 2026): https://thehackernews.com/2026/07/debull-tooling-abuses-microsoft-device.html
25. The Register — EvilTokens escalation (July 2026): https://www.theregister.com/cyber-crime/2026/07/01/eviltokens-device-code-phishing-kit-totally-more-evil-than-we-all-thought/5265409
26. ACSC advisory — ClickFix Vidar Stealer WordPress: https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/clickfix-distributing-vidar-stealer-via-wordpress-targeting-australian-infrastructure
27. Security Boulevard — AU warns of ClickFix attacks (May 2026): https://securityboulevard.com/2026/05/australia-warns-of-clickfix-attacks-pushing-vidar-stealer-malware/
28. ACCC Q1 2026 scam statistics (45,816 reports, $76.7M losses): https://www.accc.gov.au/consumers/stay-protected/scams
29. Scamwatch — ATO/myGov impersonation (tax time 2026): https://www.scamwatch.gov.au/about-us/news-and-alerts/australian-taxation-office-ato-and-mygov-impersonation-scams
30. Jim's IT — AusPost/Linkt/myGov scam guide 2026: https://jimsit.com.au/scam-text-australia-post-linkt-mygov/

---

## GitHub Issues Created (run 2026-07-12)

The following HIGH-priority issues were opened automatically (capped at 6 per run):

- **#79** — [threat-intel] Add "product recall" / "safety recall" SMS lure to URGENCY_WORDS (Amazon recall scam)
- **#80** — [threat-intel] Add "qantas" and "velocity" to auBrands URL typosquatting check
- **#81** — [threat-intel] Add Amazon and YouTube to brandMentions SMS check (fake recruiter campaigns)
- **#82** — [threat-intel] Add Cloudflare R2 (r2.dev) to SUSPICIOUS_HOSTING
- **#83** — [threat-intel] Extend URGENCY_TOLL with rego-restriction and toll-penalty vocabulary (Operation Road Trap)
- **#84** — [threat-intel] Add celebrity/ASIC-claim investment bait keywords to REWARD_WORDS

**Draft PR:** #85 — Weekly threat-intel roadmap — 2026-07-12

---

## Issues to Open Manually (fallback — included here in case issue creation fails)

### Issue A: [threat-intel] Add "product recall" / "safety recall" SMS lure to URGENCY_WORDS

**Summary:** Globally surging fake Amazon product recall SMS scam confirmed reaching AU users. Amazon explicitly states it never uses SMS for product recalls, making "product recall" / "safety recall" / "recall alert" near-zero-FP signals in an SMS context. TrendMicro (May 2026) and ACCC both flagging.

**Proposed addition to `lib/scamDetector.ts` — new `URGENCY_RECALL` sub-group:**
```typescript
// Fake product recall SMS lures (D1 / Amazon campaign May-June 2026).
// Amazon, eBay, Kmart, Big W have confirmed policies against using SMS for product
// recalls. "Safety recall" in an SMS with a link is essentially a confirmed scam signal.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review",
];
```

Add `...URGENCY_RECALL` to the `URGENCY_WORDS` spread.

**False-positive risk:** Medium for "safety review" alone (appears in finance); low for "product recall" / "recall alert" in SMS context where no official body uses SMS for this purpose.

**IOC example SMS:** `"Amazon: An item from your recent order has been flagged in a safety review and is now subject to a recall. Click to submit your refund request: https://cutt.ly/..."`

**Sources:**
- https://news.trendmicro.com/2026/05/05/fake-amazon-product-recall-texts/
- https://www.consumeraffairs.com/news/that-amazon-recall-alert-text-its-probably-a-scam-021826.html

**Roadmap:** `docs/threat-intel/2026-07-12-threat-roadmap.md` (D1)

---

### Issue B: [threat-intel] Add "qantas" and "velocity" to auBrands URL typosquatting check

**Summary:** ACCC issued a dedicated Qantas impersonation alert (Feb 2026). Confirmed typosquatted domains: `qantaspoins.com` (missing 't'), `qantas-points-verify.xyz`. `"qantas"` is in `emailHeaders.ts` `IMPERSONATED_BRANDS` but not in `scamDetector.ts` `auBrands`. URL `checkUrl()` will not flag Qantas-impersonating domains for brand impersonation.

**Proposed change to `lib/scamDetector.ts` — `auBrands` array:**
```typescript
// Qantas and Velocity Frequent Flyer — ACCC Feb 2026 alert; top-3 impersonated loyalty programs AU
"qantas", "velocity",
```

**False-positive risk:** Very low. Qantas's real domain is `qantas.com.au`; any hostname containing "qantas" not ending in `.com.au` or `.gov.au` is almost certainly a typosquat. `"velocity"` is Velocity Frequent Flyer; same logic applies.

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-qantas-impersonation-scam
- https://australianaviation.com.au/2026/02/accc-warns-of-surge-in-qantas-impersonation-scams/

**Roadmap:** `docs/threat-intel/2026-07-12-threat-roadmap.md` (D2)

---

### Issue C: [threat-intel] Add Amazon and YouTube to brandMentions SMS check (fake recruiter SMS)

**Summary:** Scamwatch June 2026 alert: scammers impersonate Amazon and YouTube as SMS recruiters, funnelling victims into pig-butchering via WhatsApp. `"amazon"` is in `auBrands` (URL) and `IMPERSONATED_BRANDS` (email) but absent from `brandMentions` in `checkSms()`. `"youtube"` is absent from all lists.

**Proposed change to `lib/scamDetector.ts` — `brandMentions` array in `checkSms()`:**
```typescript
// Amazon and YouTube recruiter SMS impersonation (D3 / Scamwatch June 2026)
"amazon", "youtube",
```

**Note:** these should use the existing `brandMentions` flag wording ("Claims to be from a well-known company — verify by logging in directly through the official app or website") with +20 score, not the `govMentions` +25. The compound `jobSignals` composite provides the stronger signal when the recruiter pattern is also present.

**False-positive risk:** Medium for "amazon" (Amazon AU sends legitimate delivery texts). Low for "youtube" (YouTube does not send cold-recruit texts to Australians).

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-job-recruitment-scams
- https://www.techradar.com/computing/cyber-security/scams-in-australia

**Roadmap:** `docs/threat-intel/2026-07-12-threat-roadmap.md` (D3)

---

### Issue D: [threat-intel] Add Cloudflare R2 (r2.dev) to SUSPICIOUS_HOSTING

**Summary:** Cloudflare R2 object storage (`*.r2.dev`) is now named alongside Workers/Pages/Tunnels as a core phishing hosting layer in 2026 threat reporting (RingSafe report, July 2026). Current `SUSPICIOUS_HOSTING` in `lib/scamDetector.ts` covers `workers.dev`, `pages.dev`, `trycloudflare.com`, `railway.app`, `vercel.app` — but not `r2.dev`.

**Proposed addition to `lib/scamDetector.ts` — `SUSPICIOUS_HOSTING` array:**
```typescript
// Cloudflare R2 object storage — now named in 2026 phishing infrastructure reports
// alongside workers.dev and pages.dev; used to host static phishing pages.
"r2.dev",
```

Score: `+25` (same as railway.app/vercel.app — R2 has some legitimate public-hosting use, so lower score than the ephemeral workers/tunnel infrastructure).

**False-positive risk:** Medium — R2 is used for legitimate static hosting. The +25 score keeps the net verdict appropriate when combined with other signals.

**Sources:**
- https://ringsafe.in/cloudflare-fronted-phishing-in-2026-how-workers-pages-tunnels-and-r2-became-default-phishing-infrastructure/
- https://www.malwarebytes.com/blog/threat-intel/2026/07/fake-google-and-cloudflare-verification-pages-spread-multiple-malware-families

**Roadmap:** `docs/threat-intel/2026-07-12-threat-roadmap.md` (D4)

---

### Issue E: [threat-intel] Extend URGENCY_TOLL with rego-restriction and toll-penalty vocabulary

**Summary:** Bitdefender's "Operation Road Trap" report (Dec 2025 – April 2026, 79,000+ messages) documents AU-specific Linkt/toll SMS phrasing not in `URGENCY_TOLL`: "rego restrictions", "toll penalty", "vehicle registration suspended", "recovery action" (in toll context).

**Proposed addition to `lib/scamDetector.ts` — `URGENCY_TOLL` array:**
```typescript
// Operation Road Trap vocabulary (D5 / Bitdefender April 2026 — rego-specific AU phrasing)
"rego restrictions", "toll penalty", "vehicle registration suspended",
"recovery action",
```

**Note on "recovery action":** This phrase is broad. It is appropriate to add to `URGENCY_TOLL` so it contributes to the cumulative score alongside other toll signals, rather than scoring on its own. The compound scorer handles this correctly.

**False-positive risk:** Low for "rego restrictions" and "toll penalty" (AU-specific, rarely in legitimate SMS). Medium for "recovery action" alone — but it only contributes +10 as part of the `URGENCY_WORDS` composite.

**IOC example:** `"Linkt: Your toll remains unpaid. Outstanding toll fees may escalate to recovery action and result in rego restrictions. Pay now: https://cutt.ly/..."`

**Sources:**
- https://www.bitdefender.com/en-us/blog/labs/operation-road-trap
- https://www.cyberdaily.au/security/13527-alert-wave-of-fake-toll-parking-scams-impacting-countries-around-the-world-including-australia-new-zealand

**Roadmap:** `docs/threat-intel/2026-07-12-threat-roadmap.md` (D5)

---

### Issue F: [threat-intel] Add celebrity/ASIC-claim investment bait keywords to REWARD_WORDS

**Summary:** Deepfake celebrity investment scam victims are often hooked by "guaranteed returns" / "risk-free investment" language and the false claim "verified by ASIC". These are not in `REWARD_WORDS`. Confirmed: WA Government $30M in losses, CommBank 27% of AU consumers encountering deepfake scams.

**Proposed additions to `lib/scamDetector.ts` — `REWARD_WORDS` array:**
```typescript
// Celebrity deepfake / ASIC-claim investment bait (D6 / WA Gov, NSW Gov 2026)
"guaranteed returns", "guaranteed profit", "risk-free investment",
"double your money", "exclusive investment opportunity",
// "verified by asic" — scammers falsely claim ASIC endorsement;
// ASIC does not proactively verify platforms via SMS/email.
"verified by asic", "asic-approved",
```

**False-positive risk:** Medium for "guaranteed returns" / "exclusive investment opportunity" in isolation (appear in spam). Low for "verified by asic" / "asic-approved" (ASIC does not operate this way). The compound score with existing crypto/wallet/pig-butchering signals provides high-confidence detection.

**Sources:**
- https://www.wa.gov.au/government/announcements/celebrity-fakes-and-crypto-cons-drive-30m-loss-investment-scams
- https://www.nsw.gov.au/departments-and-agencies/id-support-nsw/learn/scams/celebrity-deepfake
- https://www.commbank.com.au/articles/newsroom/2026/01/can-australians-spot-deepfake-scams.html

**Roadmap:** `docs/threat-intel/2026-07-12-threat-roadmap.md` (D6)
