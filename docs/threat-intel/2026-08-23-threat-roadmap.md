# Threat-intelligence roadmap — 2026-08-23

*Sweep period: 2026-08-10 – 2026-08-23 (fortnightly). Next sweep due 2026-09-06.*

---

## Executive summary

A quieter cycle than 2026-08-16. The dominant new signal is a GB DWP "you may be
entitled to a replacement benefit" variant — a predictable evolution of the
winter-fuel-payment campaign now extended to the broader "benefit check" framing
that survives as long as means-tested-benefit eligibility rules stay in the news.
Two cross-regional signals (recovery-fraud bait language and fake-landlord
accommodation-deposit phrases) are proposed for `base.ts`, prompted by the CAFC
impersonation pattern in Canada and the Irish college-intake season scam spike.
The IRS "Tax Resolution Oversight Department" impersonation is a real gap in the
US pack but targets tax professionals rather than the general public, earning
MEDIUM rather than HIGH.

The NZ D6 item from 2026-08-16 (deepfake media-brand investment lures) is
confirmed shipped in `nz.ts` — `REWARD_WORDS` carries `"as seen on rnz"` / `"as seen
on tvnz"` / `"as featured in nz herald"`, and the corresponding `BRAND_MENTION_WORDS`
entries are present. No gap remains.

Four proposals this cycle — D1 through D4. No pack-interface changes required;
all signals fit existing lists.

---

## Threat landscape by region

### AU — Australia

Quiet this cycle. The week produced no well-evidenced new signal that is not
already covered.

**ACCC phone-number spoofing campaign** (ScamWatch advisories Aug 2026): scammers
are calling with spoofed government or bank caller-IDs to establish trust before
directing victims online. This is a call vector — the text-side signal, if any,
arrives only in the follow-up SMS, which is already covered by the authority-mention
and urgency composites. No text-side gap. No proposal.

**myGov account-locked SMS wave** (Services Australia Aug 2026): ongoing campaign,
"your myGov account has been locked — click to unlock". Already caught by
`"mygov"` in AU `authorityMentions` combined with `urgency.generic` threat
language. No gap.

**Superannuation cold-call-to-SMS pipeline** (ASIC MoneySmart Aug 2026): scammers
cold-call, establish rapport, then text a link to a fake super-management portal.
The text step is caught by the existing AU `urgency.pension` group and `"mygov"`
/ `"ato"` authority mentions. No new text-side signal.

### GB — United Kingdom

**DWP post-winter-fuel benefit entitlement lure** (HIGH) → **D1**

The winter-fuel-payment campaign (first evidenced Aug 2025, ongoing through 2026)
has evolved a second framing: rather than claiming the recipient is owed a
specific winter-fuel payment, the script now leads with a generic "benefit
entitlement check" — "we've identified you may be entitled to an additional
benefit" — and then harvests details through a fake eligibility form. The generic
framing is more durable because it does not depend on a specific payment name,
and it survives means-tested-benefit rule changes by leaning on ambiguity.

`gb.ts URGENCY_TAX` already carries `"winter fuel payment"`, `"energy bill support"`,
`"energy rebate"`, `"council tax refund"`, `"universal credit payment"` and
`"budgeting advance"`. The new framing — `"benefit entitlement check"`,
`"entitled to a new benefit"`, `"replacement benefit payment"`, `"you may be
entitled to a benefit"` — is not present.

**Evidence:** Merseyside Police Facebook advisory Aug 18, 2026 (tier 2 — police
advisory); Isle of Wight Trading Standards Aug 13, 2026 (tier 2); consistent
with the established pattern documented in the 2026-08-16 roadmap D4-area
research.

**FP risk: LOW.** "Benefit entitlement check" sent by text to a phone number is
not how DWP communicates eligibility — the DWP writes by letter and through the
UC journal — so the phrase in a text context is a reliable scam signal. The
generic `"entitled to a benefit"` phrase has somewhat higher FP risk on its own
(a legitimate benefits-advice charity might send it), so the implementation
should require it to compound with an authority mention or urgency signal rather
than scoring alone.

### US — United States

**IRS "Tax Resolution Oversight Department" fake-contractor impersonation**
(MEDIUM) → **D4**

The IRS Security Summit issued a specific advisory (Aug 4, 2026) warning tax
professionals that scammers are impersonating IRS contractors using a fabricated
unit name: "Tax Resolution Oversight Department". The script involves an email
or text claiming the recipient's "preparer account" has been flagged, with a link
to a fake IRS portal. The name does not exist within the IRS.

`us.ts authorityMentions` carries `"irs"`, `"internal revenue service"`, and many
related terms, but not this fabricated department name. Since the exact phrase
fires on the fabricated unit name only — no legitimate IRS communication uses it —
FP risk is very low. However, the advisory explicitly targets tax professionals
(CPAs, enrolled agents, tax preparers) rather than the general public, which
limits the detection value for the consumer-facing tool. MEDIUM priority.

**Evidence:** IRS Security Summit Advisory Aug 4, 2026 (tier 1 — government
regulator).

**US IC3/FBI recovery scam** (watchlist, being promoted — see D2 note): the
cross-regional recovery-fraud evidence from Canada this cycle supports elevating
the US variant from DEFERRED to MEDIUM. Base-level coverage via D2 addresses the
generic signal; a US-specific IC3-impersonation composite ("`"ic3 agent"`",
"`"ic3 case number"`") is flagged for watchlist promotion if the IC3-specific
framing surfaces with sufficient evidence next cycle.

### NZ — New Zealand

**D6 from 2026-08-16 confirmed shipped.** `nz.ts` carries:
- `REWARD_WORDS`: `"as seen on rnz"`, `"as seen on tvnz"`, `"as featured in nz herald"`
- `BRAND_MENTION_WORDS`: `"rnz"`, `"tvnz"` (word-boundary matched, no collision risk)
- `BRAND_MENTIONS`: `"nz herald"` (substring; long enough to be distinctive)

No gap, no new proposal.

Otherwise quiet this cycle. No well-evidenced new NZ signal not already covered.

### CA — Canada

**CAFC impersonation recovery fraud** (partially covered — see D2)

The CAFC (Canadian Anti-Fraud Centre) published an advisory in July 2026 warning
that scammers are impersonating CAFC staff as a second-round recovery scam —
targeting people who have already been scammed and are desperately seeking their
money back. The script involves an unsolicited contact claiming to be a "CAFC
investigator" who, for a fee, will recover the victim's funds.

The authority-impersonation dimension is already covered: `"cafc"` is in `ca.ts
authorityMentions`, and a message claiming to be from the CAFC will score the
authority mention. What is NOT covered is the recovery-fraud bait language common
to all such scams — `"recover your lost funds"`, `"fund recovery specialist"`, etc.
These phrases are not Canada-specific; they appear in recovery fraud across AU,
GB and the US as well. The base expansion (D2) addresses this.

No CA-specific additions beyond D2 are proposed this cycle. `ca.ts` already carries
`"cafc"`, `"canadian anti-fraud centre"`, `"anti-fraud centre"` and `"cafc"` as
authority mentions; the impersonation dimension is covered.

**Evidence:** CAFC advisory July 2026 (tier 1 — government regulator); WestCentral
Online Aug 5, 2026 reporting CAFC-specific fraud (tier 2 — reputable regional press).

### IE — Ireland

**Student accommodation deposit scam — seasonal spike** (HIGH) → **D3**

An Garda Síochána issued targeted warnings Aug 19–20, 2026 about a surge in fake
student accommodation listings ahead of the September college intake. The script
follows a standard fake-landlord playbook: the "landlord" communicates only by
text, claims to be abroad or otherwise unable to show the property, asks for a
deposit to "secure" or "hold" the room, and promises to post the keys. No keys
arrive.

None of the key phrases appear anywhere in the current packs — `ie.ts` has no
deposit-adjacent urgency group, and `base.ts REQUEST_WORDS` does not cover the
fake-landlord script. The existing rental-bond composite in `scamDetector.ts`
fires on `hasRentalContext && hasBankAsk`, but its rental-context detection does
not include the "landlord is abroad" framing specifically.

The pattern is not Ireland-specific (it runs in AU, GB and CA every academic
intake season), so the signal belongs in `base.ts REQUEST_WORDS` rather than
`ie.ts`. The Irish evidence this cycle is the catalyst; the August–October seasonal
window tracks with every country that has a September college intake.

**Evidence:** An Garda Síochána advisory Aug 19–20, 2026 (tier 1 — government);
RTÉ News Aug 19, 2026 (tier 2 — reputable national broadcaster); Threshold (Irish
housing charity) seasonal warning Aug 2026 (tier 2).

**FP risk: LOW-MEDIUM.** The phrase `"landlord is abroad"` in a rental-context
message is essentially exclusively a scam signal — a legitimate landlord does not
introduce themselves this way, and a legitimate letting agent does not explain an
absentee landlord by text. `"pay deposit to hold the property"` over SMS is
likewise a tell; legitimate rental contracts require in-person or formal-channel
execution. `"keys will be sent by post"` has marginally higher FP risk in isolation
(some legitimate key replacements) but close to zero alongside a deposit ask.

Implementation note: the highest-confidence phrases (`"landlord is abroad"`,
`"landlord is overseas"`, `"pay deposit to hold"`, `"send deposit to hold"`,
`"deposit to secure the room"`, `"deposit to reserve the room"`) can go directly
into `base.ts REQUEST_WORDS`. The medium-confidence phrase (`"keys will be sent
by post"`) should require a second signal rather than scoring alone.

---

## Proposals

| ID | Target file | Priority | Signal | FP risk |
|---|---|---|---|---|
| D1 | `lib/regions/gb.ts` `urgency.tax` | HIGH | DWP generic benefit entitlement lure phrases | LOW |
| D2 | `lib/regions/base.ts` `REWARD_WORDS` | HIGH | Recovery-fraud bait language (global) | LOW |
| D3 | `lib/regions/base.ts` `REQUEST_WORDS` | HIGH | Fake-landlord accommodation-deposit phrases (global, IE seasonal catalyst) | LOW-MEDIUM |
| D4 | `lib/regions/us.ts` `authorityMentions` | MEDIUM | IRS fabricated "Tax Resolution Oversight Department" unit name | VERY LOW |

---

## Proposal detail

### D1 — GB: DWP benefit entitlement lure

**Target:** `lib/regions/gb.ts`, `URGENCY_TAX` array

**Add to `URGENCY_TAX`:**
```
"benefit entitlement check",
"entitled to a new benefit",
"entitled to an additional benefit",
"replacement benefit payment",
"you may be entitled to a benefit",
"benefit check required",
```

**Implementation note:** the scorer already requires these to compound with an
authority mention (DWP, HMRC, UC) to escalate. The phrases above are weak enough
that they should NOT score the full urgency weight on their own — the existing
compound logic in `scamDetector.ts` handles this. Verify during implementation
that the compound fires correctly and does not elevate on a message containing
only `"benefit entitlement check"` with no authority signal.

**Do not add:** bare `"entitled to a benefit"` — too generic and present in
legitimate welfare-rights communications.

---

### D2 — BASE: Recovery-fraud bait language

**Target:** `lib/regions/base.ts`, `REWARD_WORDS`

**Add:**
```
"recover your lost funds",
"fund recovery specialist",
"funds recovery service",
"asset recovery specialist",
"scam recovery specialist",
"we can recover your money",
"get your money back from scammers",
"recover your stolen funds",
```

**Rationale:** These phrases appear in the second-victimization recovery-fraud
script regardless of which authority is being impersonated (CAFC, IC3/FBI,
ACCC, Action Fraud). No legitimate financial-services provider describes itself as
a "fund recovery specialist" — this language is exclusively used by scammers
targeting people who have already lost money. Base placement is correct because
the pattern runs across all six covered regions.

**FP risk:** VERY LOW for "fund recovery specialist" and "asset recovery specialist"
(no legitimate entity self-describes this way). LOW for "recover your lost funds"
(conceivable in a legitimate fraud-reporting advisory — implementation may wish
to require a second signal for this phrase alone).

---

### D3 — BASE: Fake-landlord accommodation-deposit phrases

**Target:** `lib/regions/base.ts`, `REQUEST_WORDS`

**High-confidence additions (score on first match):**
```
"landlord is abroad",
"landlord is currently overseas",
"landlord is currently abroad",
"pay deposit to hold the property",
"send deposit to hold the property",
"deposit to secure the room",
"deposit to reserve the room",
"transfer deposit to hold",
```

**Medium-confidence additions (require second signal — implementation decision):**
```
"keys will be sent by post",
"keys will be posted to you",
"post the keys to you",
```

**Do not add:** `"cannot view the property"`, `"unable to show the property"` —
FP risk too high; a legitimate property management company might send either
phrase in a maintenance context.

**Interaction with existing rental-bond composite:** the `hasRentalContext &&
hasBankAsk` composite in `scamDetector.ts` already fires for some of these
scenarios. The REQUEST_WORDS additions are additive rather than replacements — a
message with a fake-landlord phrase plus a bank-detail ask would now score both
the urgency signal (D3) and the composite (+25). Verify during implementation
that this does not produce an unintentionally high combined score.

---

### D4 — US: IRS "Tax Resolution Oversight Department"

**Target:** `lib/regions/us.ts`, `AUTHORITY_MENTIONS`

**Add:**
```
"tax resolution oversight department",
"tax resolution oversight",
```

**FP risk:** VERY LOW. This unit name does not exist in the IRS and is used
exclusively in the impersonation script. The IRS Security Summit advisory
explicitly states this.

**Scope limitation:** The advisory targets tax professionals (CPAs, enrolled
agents, preparers) rather than the general public. The detection value for a
consumer tool is limited, but the FP risk is so low that adding it costs nothing
and would catch the scenario if a member of the public forwards the phishing
message to check it.

---

## Pack-interface notes

No interface changes required this cycle. All proposed signals fit existing array
types (`URGENCY_TAX`, `REWARD_WORDS`, `REQUEST_WORDS`, `authorityMentions`). The
`RegionDefinition` and `BaseSignals` interfaces in `lib/regions/types.ts` do not
need modification.

---

## Region demand signal

The `region` column on the `reports` table has been populated since Phase 2. The
demand-signal script (`scripts/region-demand.ts`) requires `TURSO_DATABASE_URL`
and `TURSO_AUTH_TOKEN` environment variables. These are unavailable in the managed
cloud environment where this sweep runs.

Region demand data is therefore unavailable for this cycle. This is a standing
gap in the automated sweep; a manual run of `npm run region-demand` against a
local environment with Turso credentials would supply it. The data would be most
useful for prioritising coverage investment between the partial-coverage pack
(CA) and identifying whether non-AU regions are seeing meaningful submission
volume.

---

## Watchlist

Items from previous cycles monitored but not yet proposed:

| Signal | Status | Notes |
|---|---|---|
| "Hi Mum" first-contact phrasing ("Hi it's [name], I have a new number") | DEFERRED | No new evidence this cycle. The first-contact message is short and low-signal; the follow-up (payment request) is already covered by base composites. Will re-evaluate if evidence of distinct first-contact SMS lure pattern emerges. |
| Kali365 PhaaS (phishing-as-a-service kit) | MONITORING | Infrastructure. The kit generates credential-harvest pages across multiple campaigns; no distinctive text-side signal unique to Kali365 kits vs. other PhaaS. Not actionable until a specific Kali365 SMS template pattern is confirmed. |
| SVG attachment phishing | MONITORING | Detection for SVG attachments was proposed for email-type check; current SVG regex in `scamDetector.ts` is in place. Watching for evidence of mobile SMS-delivered SVG or change in FP rate before any adjustment. |
| US IC3/FBI recovery scam | MEDIUM (elevated from DEFERRED) | The CA/CAFC recovery-fraud evidence this cycle supports elevation. Generic recovery-fraud bait language addressed by D2. IC3-specific impersonation phrases (`"ic3 agent"`, `"ic3 case number"`) are on the shortlist for the next US-facing cycle if the pattern gets US-specific evidence. |
| LINE/KakaoTalk recruitment funnels | DEFERRED | Insufficient AU evidence; FP risk too high for general AU population. Not active in GB/IE/CA/NZ at meaningful volume. |

---

## Source registry notes

The following sources cited above require review against `sources.yml` before
implementation:

| Source | Tier | Action |
|---|---|---|
| IRS Security Summit Advisory Aug 4, 2026 | 1 (government regulator) | Add to registry if not present; URL: `https://www.irs.gov/newsroom/irs-security-summit` |
| An Garda Síochána student accommodation advisory Aug 19–20, 2026 | 1 (government) | Add if not present; source is press release via Garda social media accounts |
| RTÉ News Aug 19, 2026 (student accommodation deposit scam) | 2 (reputable national broadcaster) | Add if not present |
| Merseyside Police benefit entitlement advisory Aug 18, 2026 | 2 (police advisory) | Add if not present |
| Isle of Wight Trading Standards Aug 13, 2026 | 2 (trading standards advisory) | Add if not present |
| CAFC advisory July 2026 (CAFC impersonation/recovery) | 1 (government regulator) | Likely already present as CAFC is a standing source; verify |
| WestCentral Online Aug 5, 2026 | 2 | Add if not present |
| Threshold (Irish housing charity) seasonal warning Aug 2026 | 2 | Add if not present |

Run `node scripts/check-sources.mjs --validate` after adding new sources.

---

## Source list (this sweep)

| ID | Source | Tier | Used for |
|---|---|---|---|
| S1 | IRS Security Summit advisory, Aug 4 2026 | 1 | D4 evidence (US fake IRS contractor) |
| S2 | An Garda Síochána advisory, Aug 19–20 2026 | 1 | D3 catalyst (IE student accommodation) |
| S3 | RTÉ News, Aug 19 2026 | 2 | D3 corroboration |
| S4 | Threshold (Irish housing charity) seasonal brief, Aug 2026 | 2 | D3 corroboration |
| S5 | Merseyside Police Facebook advisory, Aug 18 2026 | 2 | D1 evidence (GB benefit entitlement lure) |
| S6 | Isle of Wight Trading Standards advisory, Aug 13 2026 | 2 | D1 corroboration |
| S7 | CAFC advisory, Jul 2026 | 1 | D2 catalyst (CA CAFC impersonation) |
| S8 | WestCentral Online, Aug 5 2026 | 2 | D2 corroboration |
| S9 | ACCC ScamWatch weekly digest, Aug 2026 | 1 | AU landscape (no new AU proposals) |
| S10 | ASIC MoneySmart, Aug 2026 | 1 | AU super campaign confirmation (already covered) |
