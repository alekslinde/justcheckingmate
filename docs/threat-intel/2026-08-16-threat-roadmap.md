# Threat-Intel Roadmap — 2026-08-16

**Cycle:** 2026-08-09 → 2026-08-16  
**Analyst:** Automated weekly threat-intel agent  
**Sources:** Scamwatch, ACSC, AFP, ATO, ACMA, Action Fraud, NCSC, HMRC, DVLA, DWP,
My Safer Dorset, FTC, IC3/FBI, IRS, SSA, CISA, CERT NZ, Netsafe, FMA NZ, CAFC,
CRA, RCMP, An Garda, FraudSMART, Revenue IE, AIB fraud reports, Europol,
Microsoft Threat Intelligence, SecurityWeek, Sophos X-Ops, APWG, Brandsec AU

---

## Executive Summary

The top five threats this cycle span three structural shifts worth flagging together:

1. **ClickFix goes Windows Terminal (Win+X → `wt.exe`)** — A new Windows ClickFix
   variant bypasses the `Run` dialog entirely, using Win+X → "I" to open Windows
   Terminal directly (Microsoft Threat Intelligence, February 2026). The current
   base-pack covers `press windows+r` and the macOS Spotlight path but not the
   Win+X route. Gap is narrow, FP risk minimal: no legitimate consumer message
   instructs users to press Win+X and open Windows Terminal.

2. **AU: ReportCyber reference number fraud** — AFP/ACSC joint advisory (April
   2026) documented a dual-actor scam where criminals file a false ReportCyber
   report using the victim's details, generate a legitimate-looking reference
   number, and then a posing "cryptocurrency representative" uses that number to
   instruct the victim to move funds to a "cold storage account." The phrases
   "cold storage account" and "reportcyber reference" do not appear anywhere in
   the AU pack; both are strong, low-FP signals.

3. **AU: ASIC pump-and-dump via WhatsApp/Telegram group invites** — ASIC Media
   Release 26-157MR (17 July 2026) documented 16 victims and $2.7M in losses in
   two weeks from coordinated "stock tips" group invites directing targets to fake
   ASX-impersonating platforms. The group-invite angle ("stock tips group",
   "investment club", "exclusive trading group") is absent from the AU pack even
   though the generic phrase "exclusive investment opportunity" is already in base
   REWARD_WORDS.

4. **Cross-regional: Physical courier cash/card collection** — A convergent pattern
   in AU, GB and IE. Victims are told police or bank staff will send a courier to
   collect their card or cash "for safekeeping." AFP Cambodian compound advisory
   (February 2026), Cumbria Police (August 3, 2026), Hertfordshire £63k case
   (August 2026), and AIB's reported 59% jump (August 7, 2026 IE) all reference
   this specific delivery vector. base.ts covers digital "safe account" transfers
   but has no coverage of the physical pickup angle.

5. **NZ: Deepfake media brand investment lures** — FMA NZ advisory (April 2026)
   documented fake news articles bearing RNZ, TVNZ, and NZ Herald logos with
   deepfaked politicians endorsing fake trading platforms. NZ pack covers FMA
   endorsement claims (`verified by fma`, `fma approved`) but the NZ media brand
   names themselves (rnz, tvnz, nz herald) are absent from BRAND_MENTIONS, leaving
   the "as seen on RNZ" legitimacy-cover angle unscored.

---

## Threats by Region

### Australia (AU)

| Threat | Source | Cycle |
|--------|--------|-------|
| AFP/ACSC: ReportCyber reference number fraud + cold storage | AFP/ACSC joint advisory Apr 2026 | Active |
| ASIC 26-157MR: WhatsApp/Telegram stock-tips-group pump-and-dump | ASIC MR 26-157MR, 17 Jul 2026 | Active |
| Physical courier cash collection (AFP Cambodian compound context) | AFP advisory Feb 2026 | Active |
| ACMA Sender ID register enforcement (1 July 2026 in force) | ACMA | Shipped (senderIdFlag in au.ts) |
| SVG attachment phishing | ACSC — ongoing | Covered (scamDetector.ts) |

### United Kingdom (GB)

| Threat | Source | Cycle |
|--------|--------|-------|
| Smart meter fee / government energy rebate lures | My Safer Dorset advisory, 7 Apr 2026 | Active |
| Physical courier cash/card collection | Cumbria Police 3 Aug 2026; Hertfordshire Aug 2026 | Active |
| Kali365 PhaaS ongoing | FBI IC3 PSA260521, 21 May 2026 | Monitoring |
| Royal Mail / Evri parcel redelivery phishing | NCSC — ongoing | Covered |
| HMRC tax refund SMS | HMRC — ongoing | Covered |

### United States (US)

| Threat | Source | Cycle |
|--------|--------|-------|
| IC3/FBI impersonation recovery scam ("recover your lost funds") | FBI IC3 — ongoing | MEDIUM (future cycle) |
| Medicare Part D cap lure ("part d refund", "part d cap") | CMS/FTC advisories | MEDIUM (future cycle) |
| MS Teams vishing (enterprise) | CISA advisory | Enterprise; no consumer SMS text |
| Grandparent bail scam | FTC — ongoing | Covered (URGENCY_VOICE_CLONE) |

### New Zealand (NZ)

| Threat | Source | Cycle |
|--------|--------|-------|
| Deepfake news article lures (fake RNZ/TVNZ/NZ Herald) | FMA advisory Apr 2026 | Active |
| FMA endorsement claims | FMA — ongoing | Covered (nz.ts rewardWords) |
| NZ Post parcel phishing | Netsafe — ongoing | Covered (nz.ts BRAND_MENTIONS) |

### Canada (CA)

| Threat | Source | Cycle |
|--------|--------|-------|
| CRA refund intercept SMS | CAFC — ongoing | Covered |
| Canada Post parcel phishing | CAFC — ongoing | Covered |
| French-language keyword gap | — | Blocked (Phase 6 step 2; French reviewer needed) |

### Ireland (IE)

| Threat | Source | Cycle |
|--------|--------|-------|
| AIB cash courier collection (59% jump Aug 2026) | AIB fraud bulletin 7 Aug 2026 | Active → D5 base |
| Revenue / MyGovID impersonation | Revenue IE — ongoing | Covered (ie.ts authorityMentions) |
| Energy bill scam | An Garda — ongoing | Covered (ie.ts URGENCY_UTILITY) |

### Global / Cross-Regional

| Threat | Source | Cycle |
|--------|--------|-------|
| ClickFix Windows Terminal (Win+X) variant | Microsoft Threat Intelligence Feb 2026 | Active → D1 |
| Physical courier cash/card collection | AU/GB/IE advisories — convergent | Active → D5 |
| Greatness PhaaS device code phishing | CISA/Proofpoint — ongoing | Enterprise; monitoring |
| Deepfake celebrity investment ads | WA Gov 2026 / APWG | Covered (REWARD_WORDS base) |

---

## Proposals

| ID | Priority | Region | Tactic | Proposed Signal Addition | Source |
|----|----------|--------|--------|--------------------------|--------|
| D1 | HIGH | base | ClickFix Windows Terminal (Win+X) variant | Add to REQUEST_WORDS: `"press windows+x"`, `"press win+x"`, `"open windows terminal"` | Microsoft Threat Intelligence Feb 2026; SecurityWeek |
| D2 | HIGH | au | AFP/ACSC ReportCyber reference + cold storage fraud | Add to requestWords: `"cold storage account"`, `"reportcyber reference"` | AFP/ACSC joint advisory Apr 2026 |
| D3 | HIGH | au | ASIC pump-and-dump group invite (stock tips / investment club) | Add to rewardWords: `"stock tips group"`, `"investment club"`, `"exclusive trading group"`, `"closed trading group"` | ASIC MR 26-157MR, 17 Jul 2026 |
| D4 | HIGH | gb | Smart meter fee + government energy rebate lures | Add to requestWords: `"smart meter installation fee"`, `"smart meter replacement charge"`, `"government energy rebate"`, `"energy bill rebate"`, `"energy support payment"` | My Safer Dorset advisory, 7 Apr 2026 |
| D5 | HIGH | base | Physical courier cash/card collection fraud | Add to REQUEST_WORDS: `"courier will collect"`, `"send a courier"`, `"collect your card"`, `"hand over your card"`, `"withdraw cash and"` | AFP Feb 2026; Cumbria Police 3 Aug 2026; AIB 7 Aug 2026 |
| D6 | HIGH | nz | Deepfake media brand investment lures (fake RNZ/TVNZ/NZ Herald) | Add to BRAND_MENTIONS: `"rnz"`, `"tvnz"`, `"nz herald"`; add to rewardWords: `"as seen on rnz"`, `"as featured in nz herald"`, `"as seen on tvnz"` | FMA advisory Apr 2026 |

---

## Pack-Interface Notes

### D1 — base.ts REQUEST_WORDS: Win+X path

`REQUEST_WORDS` is a plain substring list matched case-insensitively. The three
new entries (`"press windows+x"`, `"press win+x"`, `"open windows terminal"`) are
verbatim phrases from documented lure messages. No `\b` boundary is needed because
these are multi-word phrases; substring matching is fine. The existing
`isMacClickFix()` function is not changed — Win+X is a Windows path only.

False-positive risk: very low. No legitimate consumer SMS, email, or notification
would instruct a user to press Win+X and open Windows Terminal. The phrase is
unambiguous in lure context.

### D2 — au.ts requestWords: cold storage + ReportCyber reference

Both strings are specific enough to be zero-FP in isolation:
- `"cold storage account"` — legitimate cold-storage wallet guidance never uses the
  phrase "cold storage account" in a message asking the user to act. If a hardware
  wallet vendor mentions cold storage it typically says "your cold storage device"
  or "cold storage wallet."
- `"reportcyber reference"` — the only context in which this phrase appears in a
  consumer message is the scam script; ReportCyber does not send confirmation SMS.

Add both to `requestWords` (the per-region request-words array). No scoring
adjustment needed — +15 per hit from the standard requestWord scorer is appropriate.

### D3 — au.ts rewardWords: investment group invite phrases

These four phrases (`"stock tips group"`, `"investment club"`, `"exclusive trading
group"`, `"closed trading group"`) complement the existing `"exclusive investment
opportunity"` in base REWARD_WORDS. They target the group-invite recruitment phase
of the ASIC-documented pump-and-dump pattern specifically.

Consider co-weighting with ASIC authority mentions already in au.ts rewardWords
(`"asic-approved"`, `"verified by asic"`) — if both hit simultaneously the score
should comfortably reach `likely_scam`.

### D4 — gb.ts requestWords: smart meter + energy rebate

Add to the GB pack's `requestWords` array. These phrases are specific to the GB
market (Ofgem, DESNZ) and would FP against overseas energy content, so base.ts is
the wrong home.

Note: ie.ts already covers `"energy credit"` and `"fuel allowance"` in its URGENCY
lists, so gb.ts needs its own entries.

Scoring: these compound well with the existing GB energy-supplier brand mentions
(British Gas, OVO, Octopus Energy, Scottish Power) — a message naming British Gas
*and* claiming a "government energy rebate" should reach `likely_scam`.

### D5 — base.ts REQUEST_WORDS: courier collection

Add to the global REQUEST_WORDS array. These phrases are active in AU, GB and IE
simultaneously and carry no legitimate consumer-messaging use.

`"withdraw cash and"` is the weakest signal in isolation (prefix of a longer
instruction), but it consistently precedes the courier-collection instruction in
documented lure scripts. Consider that it only contributes meaningfully when
compounding with authority-mention or urgency signals.

`"collect your card"` needs verification that it doesn't FP against delivery
confirmation messages like "collect your card from the branch." The phrase does not
appear in standard banking card-delivery notifications (which say "pick up" or
"collect from"); the courier scam specifically uses "collect your card" in the
imperative voice directed at the victim, so it is distinguishable in context.

### D6 — nz.ts BRAND_MENTIONS + rewardWords: NZ media brands

`"rnz"` and `"tvnz"` are 3 characters — the packing rule requires these go in the
`word[]` array (not `substring[]`) so that `mentions()` / `mentionsAny()` applies
`\b` boundaries via the `≤3 chars` auto-boundary path. `"nz herald"` is a
multi-word phrase with no collision risk and belongs in `substring[]`.

The three `rewardWords` additions (`"as seen on rnz"`, `"as featured in nz herald"`,
`"as seen on tvnz"`) carry the legitimacy-cover signal and will compound with any
fake investment platform names or FMA endorsement claims already in the pack.

---

## Region Demand Signal

**Unavailable this cycle.** The Turso connection string is not provisioned in the
automated cloud environment. The `npm run region-demand` script exists
(`scripts/region-demand.ts`) but requires `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
to be set. Regional submission frequency data would help prioritise between AU D2/D3
if both can't ship in the same release.

---

## Watchlist Updates

| Item | Status | Notes |
|------|--------|-------|
| "Hi Mum" first-contact phrasing | **STILL DEFERRED** | First-contact signals confirmed: "Hi, this is my new number", "dropped my phone in water", "borrowing a friend's phone". FP risk remains too high without a secondary payment-ask signal. Code comment in base.ts (D17 block) remains accurate. Revisit if a reliable bigram can be found. |
| GB reportingBody rename to "Report Fraud" | **CLOSED — RESOLVED** | gb.ts already shows `reportingBody: "Report Fraud (reportfraud.police.uk)"`. This watchlist item is closed. |
| Kali365 PhaaS (FBI IC3 PSA260521) | **MONITORING** | Active as of IC3 advisory 21 May 2026. No specific consumer-facing SMS lure text added this cycle; generic PhaaS signals (credential-harvest URLs, suspicious hosting) are covered. Will re-evaluate if AU/GB campaigns surface distinct lure phrases. |
| SVG attachment phishing | **MONITORING** | No new AU-specific advisory this cycle. Existing attachment-type checker in scamDetector.ts covers SVG files. |

---

## Deferred / Future Cycles

| ID | Region | Tactic | Why Deferred |
|----|--------|--------|--------------|
| — | us | IC3/FBI impersonation recovery scam ("recover your lost funds", "ic3 agent") | MEDIUM priority; no US-specific urgency signal this cycle |
| — | us | Medicare Part D cap lure ("part d cap", "part d refund") | MEDIUM priority; confirm exact lure phrasing before adding |
| — | global | MS Teams vishing | Enterprise vector; no consumer-facing SMS lure text to add |
| — | global | Greatness PhaaS device code phishing | Enterprise vector; monitoring |
| — | ca | French-language keywords (Phase 6 step 2) | Blocked on French reviewer sign-off |

---

## Source List

| Source | URL / Reference | Accessed |
|--------|-----------------|----------|
| ACSC / ASD — Cyber Threats Report | acsc.gov.au | 2026-08-16 |
| AFP — Cambodian compound / fraud advisory | afp.gov.au | 2026-08-16 |
| ACMA — SMS Sender ID Register (1 Jul 2026) | acma.gov.au | 2026-08-16 |
| ASIC Media Release 26-157MR | asic.gov.au/mr-26-157mr | 2026-08-16 |
| AFP/ACSC joint advisory: ReportCyber reference fraud | Apr 2026 | 2026-08-16 |
| Action Fraud / Report Fraud (GB) | reportfraud.police.uk | 2026-08-16 |
| NCSC (UK) | ncsc.gov.uk | 2026-08-16 |
| My Safer Dorset: Smart meter fee advisory | mysaferdorset.com, 7 Apr 2026 | 2026-08-16 |
| Cumbria Police: Courier cash collection | cumbria.police.uk, 3 Aug 2026 | 2026-08-16 |
| Hertfordshire Police: £63k courier case | herts.police.uk, Aug 2026 | 2026-08-16 |
| FTC — ReportFraud | reportfraud.ftc.gov | 2026-08-16 |
| FBI IC3 PSA260521 — Kali365 PhaaS | ic3.gov/PSA260521 | 2026-08-16 |
| CISA advisories | cisa.gov | 2026-08-16 |
| CERT NZ | certnz.govt.nz | 2026-08-16 |
| Netsafe NZ | netsafe.org.nz | 2026-08-16 |
| FMA NZ: Deepfake media lures advisory | fma.govt.nz, Apr 2026 | 2026-08-16 |
| CAFC — Canadian Anti-Fraud Centre | antifraudcentre-centreantifraude.ca | 2026-08-16 |
| RCMP fraud advisories | rcmp-grc.gc.ca | 2026-08-16 |
| An Garda Síochána fraud alerts | garda.ie | 2026-08-16 |
| AIB fraud bulletin — courier cash jump | aib.ie, 7 Aug 2026 | 2026-08-16 |
| FraudSMART (BPFI IE) | fraudsmart.ie | 2026-08-16 |
| Microsoft Threat Intelligence: ClickFix Win+X | MSTIC blog, Feb 2026 | 2026-08-16 |
| SecurityWeek: ClickFix Windows Terminal variant | securityweek.com, Feb 2026 | 2026-08-16 |
| APWG — Phishing Trends Report | apwg.org | 2026-08-16 |
| Brandsec AU — TLD abuse 2025-2026 | brandsec.com.au | 2026-08-16 |
