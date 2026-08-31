# Threat-intelligence roadmap — 2026-08-31

*Sweep period: 2026-08-29 – 2026-08-31 (regular weekly cycle). Next sweep due 2026-09-07.*

---

## Status — as at 2026-08-31

| Proposal | Issue | Shipped in | Status |
|---|---|---|---|
| D1 — Scambling (fake gambling platforms) | #225 | #231 | ✅ Shipped |
| D2 — Task / e-commerce-rating job scam | #226 | — | ⬜ Outstanding — rescope, see below |
| D3 — Signal / WhatsApp account hijacking | #227 | — | ⬜ Outstanding — rescope, see below |
| D4 — Energy support allowance phrases | — | — | ⬜ Not filed |
| D5 — Money mule recruitment | — | — | ⬜ Not filed |
| D6 — Veterans benefits scam | — | — | ⬜ Not filed |

### Deviations

- **D1** — shipped as a **composite in `scamDetector.ts`, not as `REWARD_WORDS`
  entries**, and only one of the six proposed phrases was added.

  The proposal's own FP section had it right: licensed operators promote by SMS
  constantly. Measured before implementing, the bait phrases were either already
  covered or too close to legitimate marketing to add — `"claim your free spins"`
  already reached suspicious (24) on the existing `free`/`claim` reward words, and
  a legitimate Crown registration SMS measured 22. Flat entries would have raised
  that false positive, not the scam.

  The real gap was the **withdrawal gate** — `"verify your account to withdraw
  your winnings"` measured **safe (10)**. That is now a composite requiring both
  a verify instruction and withdrawal-of-winnings framing in one message
  (+40); the canonical lure moves safe (10) → **likely_scam (50)**.

  Two false positives were found and fixed during implementation, both invisible
  from the word lists:
  - Gating on `funds`/`balance` flagged ordinary one-time KYC ("verify your
    identity before you can withdraw funds") at 40. The composite now gates on
    `winnings`/`prize`/`jackpot`/`payout` — a stated prize, not a limit.
  - `"free spins"` added to `REWARD_WORDS` double-scored against base's `"free"`,
    pushing a legitimate "10 free spins added to your account" promo from 12 to
    24. Dropped; this is the same failure mode as the `mygovid` and `new bsb`
    notes in the engine.

  Only `"wagering requirement waived"` was added to AU `REWARD_WORDS` — a real
  operator states a wagering requirement and never advertises waiving one.

### Corrections

**Correction (2026-08-31):** D2 and D3 overstate the gap; both were audited
against the live engine after filing.

- **D2** — "not covered in `REWARD_WORDS` or `REQUEST_WORDS`" is true as written
  but misleading. The `jobSignals` composite (`scamDetector.ts`) already catches
  the recruitment framing: the e-commerce-assistant lure measured **suspicious
  (25)** before any change. Only the payment-gate phrasing (`"complete tasks to
  withdraw"`, `"you have unfinished tasks"`) is a real gap, at safe (0).
  `"rate products to earn commission"` would double-score against the
  composite's own `/\brate\s+products\b/` regex.
- **D3** — half covered. The QR half of the lure measured **suspicious (20)**
  via the existing quishing regex, so `"scan this qr code to link your device"`
  is redundant. The genuine gap is `"forward the verification code to restore
  access"` (safe, 0). `"verify your identity to avoid account suspension"` is
  also rated LOW FP in the issue; it is generic account-security boilerplate,
  unlike the four app-specific phrases, and needs its own assessment.

Both issues need rescoping before implementation. This is the gap that prompted
the live-engine verification step now in
[`README.md`](README.md#verify-against-the-live-engine-before-filing).

---

## Executive summary

Six proposals this cycle — three HIGH, three MEDIUM.

| Rank | Proposal | Region | Why first |
|---|---|---|---|
| 1 | D1 — Scambling (fake gambling platforms) | AU | 927 % H1 2026 surge, NASC fusion cell running to Dec 2026, tier-1 source |
| 2 | D2 — Task / e-commerce-rating job scam | AU | Scamwatch-named alert; pig-butchering gateway, not covered by existing brand rules |
| 3 | D3 — Signal / WhatsApp account hijacking | BASE | FBI/CISA PSA updated June 2026; low FP risk; cross-regional |
| 4 | D4 — Energy support allowance phrases | GB | Action Fraud tier-1; phrasing gap in `urgency.tax`; October price-cap timing |
| 5 | D5 — Money mule recruitment | BASE | AFP + Garda + Lloyds; cross-regional; "money mule" alone is near-zero FP |
| 6 | D6 — Veterans benefits scam | US | FTC alert 2026-08-24; MEDIUM confidence — primarily a postcard vector |

**No new pack-interface fields needed.** All proposals target existing arrays.
**Region demand:** Turso DB unavailable in cloud environment — see §Region demand signal.

---

## Threats by region

### Australia (primary)

#### AU-1 — Scambling: fake online gambling platforms

NASC (National Anti-Scam Centre) fusion cell launched a dedicated scambling operation in H1 2026 running to December 2026. ACCC/Scamwatch data shows a 927 % increase in reports in H1 2026 relative to H1 2025. Losses exceed $40 m for the period.

**Mechanism:** Victims receive an SMS or social-media DM offering "exclusive VIP access" to a gambling platform. After a small winning run, they are told to verify an account before withdrawing winnings — the verification requires a payment or identity upload that is never returned.

**Observed lure phrases (Scamwatch / ACCC press releases, 2026-06 to 2026-08):**
- "exclusive bonus for new members"
- "vip access — limited spots"
- "claim your free spins"
- "verify your account to withdraw your winnings"
- "limited offer expires in 24 hours"
- "bonus credited — tap to claim"

**Impersonated brands:** Fictional platform names; occasionally spoofs Crown, The Star, or Entain sub-brands.

**Source:** ACCC media release 2026-08-14 (Tier 1, `accc.gov.au`); NASC fusion-cell announcement 2026-06-01 (Tier 1, `nasc.gov.au`).

**Status:** New campaign class. `REWARD_WORDS` in `au.ts` carries no gambling-bonus bait.

---

#### AU-2 — Task scam / e-commerce rating job

Scamwatch published a named alert in August 2026 for the "e-commerce assistant" or "product-optimisation" job scam. Victims are recruited via WhatsApp or Telegram to "rate products" or "optimise listings" for payment. After completing initial free tasks, they are asked to pre-fund a task to unlock earnings — a pig-butchering gateway.

**Observed lure phrases (Scamwatch alert, 2026-08):**
- "only 20 positions available"
- "optimising product listings"
- "rate products to earn commission"
- "e-commerce assistant"
- "complete tasks to withdraw"
- "you have unfinished tasks"

**Note:** `amazon` and `youtube` already appear in AU `BRAND_MENTIONS`. The job-recruitment framing is distinct from brand impersonation and is not currently covered.

**Source:** Scamwatch news alert 2026-08-07 (Tier 1, `scamwatch.gov.au`).

**Status:** New framing; no match in current `REWARD_WORDS` or `REQUEST_WORDS`.

---

#### AU — Not proposed this cycle

- **ATO scheduled phone appointment attachment** — Attachment-based lure; no stable SMS text signal distinct from existing ATO authority-mention coverage.
- **Food delivery driver account compromise** — Consumer-facing brand mentions (DoorDash, Uber Eats) already covered; compromise happens inside the platform, not via consumer SMS.
- **"Hi Mum" AI voice-clone evolution** — Text-side first-contact signal still absent (victim receives a voice call, not a detectable SMS); remains DEFERRED.

---

### United Kingdom

#### GB-1 — Energy support allowance / payment allowance

Action Fraud and consumer watchdogs documented a rise in energy-payment phishing ahead of the October 2026 price cap increase. Scammers send SMS claiming government "energy support allowance" or "energy payment allowance" payments are available to claim. Current `urgency.tax` in `gb.ts` covers "energy rebate" and "energy bill support" (shipped 2026-08-16) but not the "allowance" framing that the October wave introduced.

**Observed lure phrases (Action Fraud, 2026-08):**
- "energy support allowance"
- "energy payment allowance"
- "energy support scheme payment"
- "household energy support"

**Source:** Action Fraud alert 2026-08-19 (Tier 1 equivalent, `actionfraud.police.uk`); Citizens Advice energy-scam tracker 2026-08 (Tier 2).

**Status:** Existing `urgency.tax` entries cover "energy rebate" and "energy bill support". The "allowance" and "support scheme payment" variants are a gap.

---

#### GB — Not proposed this cycle

- **HMRC WhatsApp channel evolution** — Mechanism change (WhatsApp rather than SMS), but existing HMRC `authorityMentions` and tax-refund `urgency.tax` entries still cover the lure text. No new phrases.
- **Royal Mail email customs fee** — Already covered at SMS level in `URGENCY_PARCEL`. Email-level detection is out of scope for this detector.

---

### United States

#### US-1 — Veterans benefits scam

FTC published a consumer alert on 2026-08-24 warning of scammers impersonating veterans' benefits programmes. Primary vector is postcard mail, but FTC also notes SMS lures. Phrases reference specific benefits programme names not currently in US `authorityMentions` or `urgency.pension`.

**Observed lure phrases (FTC, 2026-08-24):**
- "veterans savings program"
- "va benefits claim assistance"
- "champva enrolment"
- "tricare for life supplement"
- "veteran benefit entitlement review"

**Confidence note:** Postcard-first, SMS secondary. SMS signals are thinner than the other HIGH/MEDIUM proposals this cycle.

**Source:** FTC consumer alert 2026-08-24 (Tier 1, `consumer.ftc.gov`).

**Status:** MEDIUM — recommend adding to `urgency.pension` or `authorityMentions` in `us.ts`, guarding with a FP note.

---

#### US — Not proposed this cycle

- **Medicare Part D cap lure** — No new evidence in July–August 2026; REMAINS DEFERRED from 2026-08-23 watchlist.

---

### New Zealand / Canada / Ireland

No new materially distinct threats identified in July–August 2026 for NZ, CA, or IE beyond what is already covered. NZ deepfake media lures (RNZ/TVNZ/NZ Herald) shipped in the 2026-08-16 cycle. CA French-keyword gap remains BLOCKED pending native reviewer. IE pack is current.

---

### Cross-regional (BASE)

#### BASE-1 — Signal / WhatsApp account hijacking

FBI and CISA updated PSA IC3 PSA260320 in June 2026 documenting a cross-regional wave of messaging-app account hijacking. Victims receive a message — often from a spoofed or compromised contact — claiming their Signal or WhatsApp account has been flagged and must be re-verified by scanning a QR code or forwarding a code. The lure is distinct from the sim-swap / OTP request family already in `REQUEST_WORDS`.

**Observed lure phrases (FBI PSA IC3 PSA260320, updated 2026-06):**
- "your signal account has been flagged"
- "scan this qr code to link your device"
- "verify your identity to avoid account suspension"
- "forward the verification code to restore access"
- "your whatsapp has been temporarily restricted"

**FP risk: LOW.** Signal and WhatsApp do not contact users by SMS/email about account flags, QR re-linking, or code forwarding; these phrases have no legitimate consumer use.

**Source:** FBI IC3 PSA260320, updated 2026-06-12 (Tier 1, `ic3.gov`).

**Status:** New specific framing; not covered by existing OTP or verification phrases.

---

#### BASE-2 — Money mule recruitment

AFP (Australia), An Garda Síochána (Ireland), and Lloyds Bank (UK) each published warnings in July–August 2026 about money-mule recruitment targeting under-25s via social media. Victims are asked to receive and forward transfers for a commission. Existing `REQUEST_WORDS` in `base.ts` covers "safe account" and changed-payment-details signals but not the mule-recruitment framing.

**Observed lure phrases (AFP / Garda / Lloyds, July–August 2026):**
- "act as a payment agent"
- "receive transfers into your account for a fee"
- "money mule"
- "financial courier"
- "transfer funds on our behalf"

**FP risk:** "money mule" alone is VERY LOW. "receive transfers into your account for a fee" is LOW in consumer SMS; "act as a payment agent" is LOW-MEDIUM (could appear in legitimate freelance finance contexts — gate to body with "commission" or "fee" nearby if FP testing shows issues).

**Source:** AFP media release 2026-07-22 (Tier 1, `afp.gov.au`); An Garda Síochána advisory 2026-08-05 (Tier 1, `garda.ie`); Lloyds Bank fraud update 2026-07 (Tier 2).

**Status:** Not covered. Cross-regional; belongs in `base.ts`.

---

## Proposals

| ID | Tactic | Region | Target file / array | Priority | FP risk |
|---|---|---|---|---|---|
| D1 | Scambling — fake gambling platform lures | AU | `packages/engine/src/regions/au.ts` → `REWARD_WORDS` | **HIGH** | MEDIUM (gambling is legal; "verify account to withdraw winnings" in SMS is the tell) |
| D2 | Task / e-commerce rating job scam | AU | `packages/engine/src/regions/au.ts` → `REWARD_WORDS` | **HIGH** | LOW for "optimising product listings", "rate products to earn commission" in AU consumer SMS |
| D3 | Signal / WhatsApp account hijacking | BASE | `packages/engine/src/regions/base.ts` → `REQUEST_WORDS` | **HIGH** | LOW |
| D4 | Energy support allowance phrases | GB | `packages/engine/src/regions/gb.ts` → `URGENCY_TAX` | MEDIUM | LOW (DWP does not text about allowances) |
| D5 | Money mule recruitment phrases | BASE | `packages/engine/src/regions/base.ts` → `REQUEST_WORDS` | MEDIUM | VERY LOW ("money mule"); LOW-MEDIUM ("receive transfers") |
| D6 | Veterans benefits scam | US | `packages/engine/src/regions/us.ts` → `URGENCY_PENSION` or `authorityMentions` | MEDIUM | MEDIUM (phrases appear in legitimate VA comms) |

---

## Implementation notes

### D1 — Scambling phrases

Recommended additions to `REWARD_WORDS` in `au.ts`:

```
"exclusive bonus for new members",
"vip access — limited spots",
"claim your free spins",
"verify your account to withdraw your winnings",
"bonus credited — tap to claim"
```

Do **not** add "limited offer expires" flat — too broad for `REWARD_WORDS`, already covered generically by `URGENCY_GENERIC`. The distinctive tell is "verify … to withdraw winnings", which is the payment-gate step no legitimate operator uses by SMS.

### D2 — Task scam phrases

Recommended additions to `REWARD_WORDS` in `au.ts`:

```
"optimising product listings",
"rate products to earn commission",
"e-commerce assistant",
"complete tasks to withdraw",
"you have unfinished tasks"
```

"Only 20 positions available" is too generic on its own; include only if combined-scoring tests show it raises scam cases without raising legitimate job-post messages.

### D3 — Signal / WhatsApp hijacking

Recommended additions to `REQUEST_WORDS` in `base.ts`:

```
"your signal account has been flagged",
"scan this qr code to link your device",
"verify your identity to avoid account suspension",
"forward the verification code to restore access",
"your whatsapp has been temporarily restricted"
```

No gating needed — none of these appear in legitimate platform communications.

### D4 — GB energy allowance phrases

Recommended additions to `URGENCY_TAX` in `gb.ts`:

```
"energy support allowance",
"energy payment allowance",
"energy support scheme payment",
"household energy support"
```

These slot into the existing `urgency.tax` array alongside "energy rebate" and "energy bill support" (shipped 2026-08-16). No structural change needed.

### D5 — Money mule recruitment

Recommended additions to `REQUEST_WORDS` in `base.ts`:

```
"act as a payment agent",
"receive transfers into your account for a fee",
"money mule",
"financial courier",
"transfer funds on our behalf"
```

FP-test "receive transfers into your account for a fee" against legitimate payment-processing onboarding messages before shipping; drop if hit rate is above 1 in 50 legitimate messages.

### D6 — Veterans benefits

Recommended additions to `URGENCY_PENSION` in `us.ts`:

```
"veterans savings program",
"va benefits claim assistance",
"veteran benefit entitlement review"
```

Hold "champva" and "tricare for life" for a follow-up — these are real TRICARE/CHAMPVA programme names and require careful FP testing against DoD/VA official comms before adding.

---

## Pack-interface notes

No new fields proposed this cycle. All six proposals target existing string arrays.

---

## Region demand signal

Turso DB (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`) is unavailable in the cloud execution environment — egress to the database host is blocked. This has been the case for all previous cycles; the `scripts/region-demand.ts` script is available for local execution.

To run locally:

```bash
TURSO_DATABASE_URL=<url> TURSO_AUTH_TOKEN=<token> npx ts-node scripts/region-demand.ts
```

The `region` column defaults to `''` for pre-Phase-2 rows. The query should handle empty-string separately from ISO codes.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| "Hi Mum" / "Hi Dad" AI voice-clone evolution | **DEFERRED** | Text-side first-contact signal still absent; victim receives a voice call. Revisit if SMS lure text is documented. |
| Medicare Part D cap lure | **DEFERRED** | No new SMS evidence in July–August 2026. |
| Kali365 PhaaS | **MONITORING** | No distinct consumer SMS lure text identified; framework targets credential harvesting at the phishing-kit layer. |
| IC3 / Business Email Compromise — construction sector | **NOT PROPOSED** | Already covered by base `changed bank account` / `new account details` signals shipped 2026-08-23. |
| LAUNDRY BEAR Zimbra CVE-2025-34028 | **OUT OF SCOPE** | Enterprise / nation-state exploit; not a consumer-tool vector. |
| Brushing + QR code in physical packages | **OUT OF SCOPE** | Physical delivery; not detectable at SMS/email text layer. |
| AU food delivery account takeover | **NOT PROPOSED** | Consumer brand mentions (DoorDash, Uber Eats) already covered; compromise is platform-internal. |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| ACCC media release 2026-08-14 (`accc.gov.au`) | 1 | D1 scambling |
| NASC fusion-cell announcement 2026-06-01 (`nasc.gov.au`) | 1 | D1 scambling, 927 % surge figure |
| Scamwatch alert 2026-08-07 (`scamwatch.gov.au`) | 1 | D2 task scam |
| FBI IC3 PSA260320, updated 2026-06-12 (`ic3.gov`) | 1 | D3 Signal/WhatsApp hijacking |
| Action Fraud alert 2026-08-19 (`actionfraud.police.uk`) | 1 | D4 GB energy allowance |
| FTC consumer alert 2026-08-24 (`consumer.ftc.gov`) | 1 | D6 US veterans benefits |
| AFP media release 2026-07-22 (`afp.gov.au`) | 1 | D5 money mule (AU) |
| An Garda Síochána advisory 2026-08-05 (`garda.ie`) | 1 | D5 money mule (IE) |
| Citizens Advice energy-scam tracker 2026-08 (`citizensadvice.org.uk`) | 2 | D4 corroboration |
| Lloyds Bank fraud update 2026-07 (`lloydsbank.com`) | 2 | D5 money mule (GB) |

All direct fetches to government/consumer-protection domains returned `EGRESS_BLOCKED` in this execution environment. Findings were obtained via `WebSearch` tool, which routes through a different pathway. Source URLs are cited as published; content was not directly verified via HTTP this cycle.
