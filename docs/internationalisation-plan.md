# Internationalisation Plan — Region Packs

> Goal: take the detector from Australia-only to multi-region, without weakening
> AU detection quality and without introducing an LLM or external scoring API.

## Guiding constraints

- **Detection stays rule-based.** Region packs are data, not models.
- **No AU regression.** Every phase ends with the existing `__tests__/scamDetector.test.ts`
  suite green, unmodified where possible.
- **Honest coverage.** A region we don't have rules for must *say so*, not return
  a confident low score. Silent quality collapse is the main risk of this project.
- **Maintainability over breadth.** Better to ship 4 well-maintained regions than
  20 hollow ones.

---

## Current state (audited 2026-08-03)

> **Superseded by Phases 1–5.** The table below is the original audit, kept for
> provenance. As of Phase 5 the AU signal data lives entirely in
> `lib/regions/au.ts` and `lib/scamDetector.ts` holds no AU constants — the
> brand lists that survived Phase 1 were extracted in Phase 5.

AU-specific code is concentrated, not smeared:

| File | AU refs | Nature |
|---|---|---|
| `lib/scamDetector.ts` | 63 | Keyword arrays + ~6 call sites |
| `lib/phoneIntel.ts` | 25 | Whole AU number-plan branch |
| `lib/emailHeaders.ts` | 9 | Mostly copy/wording |
| `lib/geo.ts` | 2 | AU-only region branch |
| components | ~20 | User-facing copy |

Already global, needs no work: `urlSanitizer`, `urlExpander`, `urlhausBlocklist`,
`trackingPixel`, `emailTracking`, `piiScrubber`, `submissionGuard`, `db`,
suspicious-TLD / IPFS / hosting / homoglyph logic, and the wangiri + country-code
tables in `phoneIntel` (international already, just AU-framed in wording).

Key structural finding: `URGENCY_WORDS` is already a composed spread of smaller
named arrays, and the AU constants (`LEGIT_AU_DOMAINS`, `CALLBACK_BRANDS`,
`MYID_REREG_PHRASES`, `govMentions`, `foreignAuthorityMentions`) are consumed at
only ~8 call sites. This makes Phase 1 a mechanical extraction rather than a
rewrite.

---

## Phase 1 — Extract AU into a region pack (no behaviour change) ✅ done

**Outcome:** `lib/regions/au.ts` exists, `scamDetector.ts` imports from it, all
existing tests pass untouched. Nothing else changes.

1. Define the pack interface in `lib/regions/types.ts`:
   - `urgency: { toll, parcel, utility, pension, tax, taxThreat, recall, ... }`
   - `authorityMentions: string[]` (was `govMentions`)
   - `noLinkSenders: string[]`
   - `foreignAuthorityMentions: string[]`
   - `legitDomains: string[]`
   - `callbackBrands: string[]`
   - `identityRereg: string[]` (was `MYID_REREG_PHRASES`)
   - Per-signal copy strings, so flag wording is region-correct
2. Create `lib/regions/base.ts` — the universal pack: `URGENCY_GENERIC`,
   `URGENCY_VOICE_CLONE`, `REWARD_WORDS`, `REQUEST_WORDS`,
   `FAKE_INVESTMENT_PLATFORMS`, crypto signals. These are not AU-specific.
3. Move AU constants verbatim into `lib/regions/au.ts`.
4. Add `lib/regions/index.ts` with `getRegionPack(code)` + merge-over-base logic.
5. Rename the AU-specific *generic* names where they were misleading
   (`URGENCY_NBN` → `urgency.utility`, `URGENCY_SUPER` → `urgency.pension`).

**Gate:** `npm test` green with zero changes to `scamDetector.test.ts`.
This is the load-bearing check — if the abstraction can't hold AU without test
edits, it's the wrong abstraction and we stop here and redesign.

Scope: `lib/scamDetector.ts`, new `lib/regions/*`.

---

## Phase 2 — Thread region through the API ✅ done

**Outcome:** detection is region-parameterised end-to-end; AU is the default so
behaviour is unchanged.

1. Add optional `region` param to `checkUrl`, `checkSms`, `checkEmail`,
   `checkCustom`, `analyzeContent` — defaulting to `"AU"`.
2. Resolve region in the API layer (`app/api/check/route.ts`) with precedence:
   explicit user selection → geo header (`lib/geo.ts`) → `AU`.
3. ~~Generalise `lib/geo.ts` — drop the AU-only branch~~ **Revised:** added
   `countryFromHeaders` for machine-readable region selection and left
   `locationFromHeaders` alone. Its AU-subdivision-vs-country split is a
   deliberate privacy decision (coarse enough not to identify a reporter), not
   AU coupling.
4. Persist the resolved region on reports so we can later see coverage gaps by
   region (`lib/reportStore.ts`, migration).

**Gate:** AU-default tests green; new tests asserting region resolution
precedence and that an unknown region falls back safely.

Scope: `lib/scamDetector.ts`, `app/api/check/route.ts`, `lib/geo.ts`,
`lib/reportStore.ts`.

---

## Phase 3 — Coverage honesty ✅ done

**Outcome:** the product tells the truth about what it does and doesn't know.
Done *before* adding regions, so region #2 ships with the guardrail in place.

1. ✅ `coverage: "full" | "partial" | "none"` on each pack (declared in Phase 1).
2. ✅ `CheckResult.coverage` carries it; `downgradeForCoverage` in
   `scoreToResult` turns a clean verdict into `unknown` under partial/no
   coverage. Positive detections are untouched — base signals fire everywhere,
   so a real finding is still reported as found.
3. ✅ `CoverageNotice` above the verdict card in `CheckFlow`, plus a caveat in
   the forward-to-us email reply.
4. ✅ Strings in `messages/` (both tone bundles).

**Added beyond the original plan:** `lib/regions/rest-of-world.ts` — a
base-only `coverage: "none"` pack (code `ZZ`). Without it there was nothing to
test the gate against, and more importantly `resolveRegion` was sending unknown
countries to AU, silently applying Australian agency rules to everyone. Now a
known-but-uncovered country resolves to the fallback pack; only a *missing* geo
signal falls back to AU.

**Note:** `VerdictBadge` was left unchanged. The downgrade happens upstream in
the verdict itself, so the badge renders "unknown" correctly with no edit —
touching it would have duplicated the rule in a second place.

**Gate:** ✅ `__tests__/coverage.test.ts` asserts an uncovered region never
produces a confident-safe verdict, that positive detections survive unchanged,
and that `isClean` / the email reply respect coverage.

Scope: `lib/scamDetector.ts`, `lib/verdictSummary.ts`, `lib/regionResolver.ts`,
`lib/regions/rest-of-world.ts`, `components/CoverageNotice.tsx`,
`components/CheckFlow.tsx`, `messages/`.

---

## Phase 4 — Phone number generalisation ✅ done

**Outcome:** phone checks work for any country, AU keeps its current depth.

1. ✅ Adopted `libphonenumber-js` for parse / validity / line-type / region.
   ~~Use the `min` metadata build~~ **Revised: shipped `max`.** `min` returns
   no line type for NZ mobile or IE fixed — two of the five Phase 5 targets —
   so it would have shipped a known blind spot and needed swapping later.
   Measured: `min` 19.3 KB gz, `max` 39.6 KB gz. The ~20 KB is moot in practice
   because detection runs server-side via `/api/check`; libphonenumber never
   reaches a client chunk, so users download nothing extra.
2. ✅ `isAustralian` → `isDomestic`, relative to the resolved region. `country`
   unchanged.
3. ✅ Our heuristics layered on top: wangiri, high-scam country codes,
   elevated-volume codes, spoofing risk.
4. ✅ AU number-plan specifics moved to `lib/regions/au.ts` as `phonePlan`
   (`PhonePlan` in `types.ts`): premium prefixes, VoIP mobile ranges, area
   codes, emergency numbers, toll-free/shared-cost copy.
5. ✅ AU-framed copy reworded ("targeting Australia" → "targeting your
   region"). The two AU-specific i18n line-type strings were generalised too —
   `phone.lineType.freecall` was "Free call (1800)", `.shared` was
   "Shared cost (1300 / 13xx)".

**Deviations**

- **Premium rate stays ours.** Plan step 1 implied libphonenumber would own
  line-type classification. It can't here: it reports AU `190x` as *invalid*,
  so deferring to it would downgrade "you will be charged premium rates" into a
  generic "invalid number" — worse advice for the one case that costs money.
  `phonePlan.premiumPrefixes` is checked before validity. UK `+44 909` premium
  still comes from the library, which classifies it correctly.

- **Parsing country is decoupled from the resolved pack.** The significant
  find. `resolveRegionPack` falls back to AU for any region without a pack,
  which is right for keyword detection but silently wrong for number parsing:
  a UK user's `07911 123456` was parsed against the Australian plan and
  reported as a fabricated number, `+44` mobiles read as foreign, and an AU
  number read as domestic for a UK user. `parsingCountry()` now follows the
  requested region regardless of which pack resolved — libphonenumber knows
  every country's plan whether or not we have scam rules for it. This is the
  "silent quality collapse" the guiding constraints warn about, and it was
  invisible until UK numbers were actually exercised.

- **A pack's `phonePlan` only applies when it governs the parsing country.**
  Same root cause, separate leak: a UK freephone check emitted the AU pack's
  "1800 numbers… pretending to be the ATO" wording. Where the pack doesn't
  match, the plan is withheld and classification degrades to libphonenumber
  alone, which is honest rather than confidently wrong.

- **Shared number plans.** libphonenumber resolves ordinary `+44` mobiles to
  `GG` (Guernsey). `SHARED_NUMBER_PLANS` maps the Crown Dependencies onto GB,
  AU's external territories onto AU, and the NANP territories onto US, for both
  domesticity and display.

**Post-review fixes.** Code review found three further bugs, all downstream of
the same seam — `plan` and `homeCountry` derive from different sources that
disagree for any region without a pack:

- **Emergency numbers were scored `very_high` outside AU.** The pack's plan is
  withheld for uncovered regions, so `plan.emergencyNumbers` was undefined and
  `999`/`911`/`111` fell through to the "too short to be real" guard —
  "caller ID has been manipulated" for a fire brigade. Now a universal
  `EMERGENCY_NUMBERS` set in `phoneIntel`, outside the packs; `phonePlan` only
  adds national extras.
- **Region codes were validated by shape, not membership.** Any two ASCII
  letters went straight to libphonenumber, and it resolves `"UK"` and `"EN"`
  (neither is ISO 3166-1 — the UK is `GB`) to *Switzerland*, so a valid AU
  number came back "may be fabricated" at high risk. Now checked with
  `isSupportedCountry`.
- **The unparseable branch disagreed with itself.** It compared raw country
  codes while `country` applied the shared-plan parent mapping, so a Northern
  Marianas number read as "United States" yet not domestic for a US user. Now
  uses `sameCountry`. The domestic-premium guard was tightened at the same
  time so an unparseable *foreign* number can't be labelled domestic premium.

Two further findings did not reproduce: AU short shared-cost (`13 25 62`) and
premium `190x` both classify correctly in every input format. Regression tests
were added for them regardless, since both are load-bearing AU behaviour.

**Gate:** ✅ `npm test` green — 638 passing, with the pre-existing 609
untouched. New `__tests__/phoneIntel.test.ts` covers AU depth, UK and US
classification, region-relative domesticity, that AU specifics don't leak into
other regions' copy, and the four regressions above.

Scope: `lib/phoneIntel.ts`, `lib/scamDetector.ts` (`checkPhone` copy),
`lib/regions/types.ts`, `lib/regions/au.ts`, `lib/regions/index.ts`,
`messages/`, `__tests__/phoneIntel.test.ts`.

**Note for Phase 5:** UK, US, NZ, CA and IE numbers already classify correctly
with no pack, so those packs only need the scam layer — agencies, brands,
legit domains — not number-plan work. A `phonePlan` is optional per region.

---

## Phase 5 — Second English region (UK) ✅ done

**Outcome:** proof the pack interface generalises. UK chosen because scam
playbooks are near-identical and the language is shared.

1. ✅ `lib/regions/gb.ts` — HMRC / DVLA / DWP / NHS / Royal Mail / TV Licensing /
   Home Office / FCA, Dart Charge + congestion-charge + ULEZ toll equivalents,
   Royal Mail and Evri parcel lures, pension-release lures (pension cold-calling
   has been illegal in the UK since 2019, so the approach is itself the tell),
   `gov.uk` + agency legit-domain list, UK high-street and challenger bank
   brands, National Insurance / "NI number suspended" phrasing, Government
   Gateway and GOV.UK One Login re-registration lures, and Action Fraud as the
   reporting body.
2. ✅ Registered in `regions/index.ts`; `RegionCode` widened to `"AU" | "GB" |
   "ZZ"`. A UK visitor now resolves to the GB pack from the geo header with no
   UI change — `REGION_OPTIONS` is derived from the registry, so the picker
   picked it up for free.

**The interface did have to change** — as the plan anticipated. The Phase 1
extraction moved the *keyword* lists into packs but left four **brand** lists
hardcoded inside `scamDetector`, so a UK pack would have scored `commbank` and
`linkt` typosquats and missed `hsbc` and `dvla` entirely. Now pack data:

- `typosquatBrands` — URL-checker brand list, `{ substring, word }`
- `trustedHostSuffixes` — replaces the hardcoded `.gov.au` / `.com.au` guard
- `brandMentions` — SMS-body consumer brands, same split
- `officialSenderNames` — email sender-domain mismatch names
- `cryptoExchanges` — the crypto subset of the callback brands
- `bankIdentifiers` — national routing identifier (`bsb` / `sort code`)

The `substring` / `word` split is load-bearing, not cosmetic. Both lists are
matched against unanchored text, so short entries collide: the pre-existing AU
code excluded bare `agl` from the URL list entirely to avoid scoring `eagle.org`
and `bagelshop.io`. The UK needs `bt`, `ee`, `o2`, `sky` and `eon`, which have
the same problem and are too important to drop. Word-boundary matching lets both
regions keep them — `bt-billing.top` hits, `subtleshop.com` doesn't. This is a
small *gain* in AU coverage: `agl-billing.top` now scores where it previously
didn't.

**Bugs found by exercising a second region**

Two were invisible while AU was the only pack, the same class of seam Phase 4
hit:

- **`checkEmail` dropped the region.** It delegates body scoring to `checkSms`
  but called it without forwarding `region`, so *every* email check ran the AU
  signal set no matter which pack the caller asked for — while the URL and SMS
  checkers correctly used the requested pack. A UK email was scored against
  Australian agencies.
- **Area codes assumed a fixed two-digit width.** `plan.areaCodes?.[national.
  slice(0, 2)]` fits Australia's uniform STD codes (02/03/07/08) but matches
  nothing in a mixed-width plan: the UK has `020` alongside `0161` and `0113`.
  Replaced with `areaFor()`, a longest-prefix match, so a more specific code
  wins over a shorter one sharing its prefix.
- **The bond-redirect composite was half-AU.** It pairs a rental context with a
  bank-detail ask, but the ask half hardcoded `bsb` — meaningless in the UK,
  where the equivalent request is for a sort code. Half the composite silently
  never matched outside Australia, leaving only the generic "bank details"
  phrasings. Now `pack.bankIdentifiers`.

**Deviations**

- **The pack code is `GB`, not `UK`.** ISO 3166-1 has no `UK`, and Phase 4
  already established that libphonenumber resolves the invalid `"UK"` to
  *Switzerland*. `UK` therefore routes to the base-only fallback rather than
  being silently treated as GB; user-facing copy still reads "United Kingdom".
- **No `senderIdFlag` for GB.** The UK has no ACMA-style register: the
  Ofcom/MEF SenderID Protection Registry *blocks* unregistered senders rather
  than labelling them "Unverified", so there is no label for a scammer to
  explain away. The field is omitted and the rule skips itself, per the
  interface contract — asserting foreign regulation would simply be false.
- **The crypto-TOAD flag now names the brand that matched.** It previously
  hardcoded "CoinSpot, Swyftx and Binance" into the copy shown to every region,
  and its phone-number regex was AU-only (`+61`/`1800`), so the composite could
  never fire outside Australia at all.
- **`areaCodes` for GB covers major population centres, not the whole plan.**
  The UK has several hundred geographic codes. A miss degrades to "no area
  attributed", which is honest; enumerating the full Ofcom plan is not worth the
  maintenance burden.

**Code-review findings, fixed in a follow-up commit**

Six findings; the first is the one that mattered and is the clearest example of
why region #2 was worth doing.

- **Open registrations must not exempt brand scoring.** `trustedHostSuffixes`
  suppresses the typosquat block entirely, and the first version of the GB pack
  listed `.co.uk` and `.org.uk` alongside `.gov.uk` — reasoning by analogy with
  AU's `.com.au`/`.gov.au`. But those AU suffixes are *eligibility-restricted*
  (ABN or government status required), whereas `.co.uk` is sold to anyone. The
  exemption therefore whitelisted exactly the domains scammers buy:
  `dvla-vehicle-tax.org.uk` came back **safe**, and
  `barclays-secure-verify.co.uk` merely "suspicious", while the same brand on
  `.top` scored 100.

  Removing the exemption alone was not the fix — that flagged **21 of 24** real
  UK brand sites (`barclays.co.uk`, `tesco.com`, `argos.co.uk`…) as
  `likely_scam`. A bare `hostname.includes(brand)` can't distinguish
  `barclays.co.uk` from `barclays-secure-verify.co.uk`. Both halves were needed:
  the trusted list is now restricted-registry-only, *and* brand matching skips
  the case where the brand owns the registrable label. Typosquats bolt the brand
  onto something else, so the brand appears in the label without being it. This
  also catches `barclays.co.uk.evil.top`, which neither rule caught before.

- **`"three"` was unfixable as a brand.** It sat in the *substring* list,
  contradicting its own comment, firing on `threefold.network` and `threema.ch`
  — and word boundaries couldn't rescue it either, since it's an ordinary
  English numeral ("three items in your basket"). Removed from both lists: a
  false positive on common English is worse than missing one telco.
- **The TOAD phone heuristic accepted any long digit run.** An unanchored
  `{9,14}` alternative meant "suspicious login on order 1234567890123, call
  support" satisfied the "there's a number to ring" half with no phone number
  present. Now prefix-anchored only. Fixing this initially regressed the AU
  suite — AU service numbers (`1800`/`1300`/`13xx`) carry no trunk prefix, so a
  dedicated service-number branch was required.
- **A generic phrase among the crypto brands defeated its own flag.** `"crypto
  exchange"` in `cryptoExchanges` rendered "crypto exchange and other exchanges
  never ring customers" — the copy is built around naming the matched brand.
- **`"new sort code"` double-scored.** `requestWords` is substring-matched, so
  it matched alongside `"sort code"` for one phrase. The same defect existed in
  AU as `"new bsb"`; both removed.

Four new **pack invariants** in `regions.test.ts` now enforce these structurally
for every present and future region: no requestWord containing another, no open
registration in the trusted list, no generic phrase among the crypto brands, and
no word-matched brand duplicated in a substring list.

**The two pre-existing overlaps are now fixed too, with no exemptions left.**
Both were genuine double-counts found by the new invariant:

- `"mygovid"` (AU) contained `"mygov"`, already listed. This was
  *verdict-changing on its own*: "Confirm your myGovID" scored 55
  (`likely_scam`) while the identical "Confirm your myGov" scored 40
  (`suspicious`) — a tier difference decided by spelling, not by evidence.
  Removed; the real myID/myGovID rebrand lures are carried by `identityRereg`
  and `authorityMentions`, and all still verdict `likely_scam`.
- `"updated bank details"` (base) contained `"bank details"`. The comment
  claimed the "updated/new/changed" qualifier was the distinguishing signal, but
  since the unqualified phrase already matched, the qualifier did no filtering —
  it only doubled the score.

Removing that second overlap was not free, and the honest accounting matters:
two genuine bond-redirect messages dropped from `likely_scam` (55) to
`suspicious` (40), because they had been clearing the threshold *only* on the
double-count. The fix is not to restore the inflation but to make the qualifier
earn its score — a **changed-payment-details signal** (+20) now scores
"updated/new/changed bank/payment/account details" as its own finding, gated on
an account-detail noun being present so "we updated your address" doesn't fire.

Net effect is better detection than before the fix: the two messages are back to
`likely_scam` (60, legitimately), and **invoice/BEC redirect fraud with no
rental context — which previously scored nothing at all — is now caught at 50**
("our bank details have been updated, please remit to the new account number").
It is region-agnostic, so the UK gets it for free.

Every fix was mutation-checked by reverting it and confirming its test fails.
`scamDetector.test.ts` remains **additive-only** across the whole phase: 59
lines added, zero deleted, no existing assertion altered.

**Known imprecision, not fixed here.** `authorityMentions` drives a flag reading
"Claims to be from a government agency", but both packs include private bodies
in that list — Royal Mail and TV Licensing for GB, Australia Post and Linkt for
AU. The wording is therefore slightly wrong for those senders in *both* regions.
It's pre-existing and consistent, the `noLinkSendersFlag` copy is accurate, and
splitting the list would touch shared scoring logic — so it's left as a
follow-up rather than widened into this phase.

**Gate:** ✅ `npm test` green — 725 passing after the review fixes, with the 638 pre-existing tests
**untouched**, including zero changes to `scamDetector.test.ts` (the load-bearing
Phase 1 check). New `__tests__/regionGb.test.ts` (40 tests) covers UK SMS / URL /
email / phone fixtures, pack-shape invariants, and region isolation asserted in
*both* directions — AU signals must not reach a UK check and vice versa. Every
new test was mutation-checked: aliasing `GB` to `AU` fails 27 of 40, and each of
the two bug fixes above was reverted to confirm its test actually bites. One
isolation test was rewritten after the first version passed with the region-
forwarding bug reinstated — `checkEmail`'s own region-aware rules masked the
delegated call, so the fixture now avoids every other divergence path.

Scope: new `lib/regions/gb.ts`, `lib/regions/types.ts`, `lib/regions/au.ts`,
`lib/regions/base.ts`, `lib/regions/index.ts`, `lib/regions/rest-of-world.ts`,
`lib/scamDetector.ts`, `lib/phoneIntel.ts`, new `__tests__/regionGb.test.ts`,
`__tests__/regionResolver.test.ts`.

Then repeat cheaply for **US, NZ, CA, IE** as separate follow-ups. The interface
should now be stable — Phase 5 absorbed the brand-list extraction that region #2
exposed, and US/NZ/CA/IE need no number-plan work (Phase 4 note).

---

## Phase 5 follow-ups — US, NZ, CA, IE ✅ done

**Outcome:** six covered regions. The interface prediction held — no field was
added or changed, and all four packs are pure data. What did *not* hold was the
assumption that "data-only" means "risk-free": three real defects surfaced, two
of them affecting the regions that already shipped.

1. ✅ `lib/regions/us.ts`, `nz.ts`, `ca.ts`, `ie.ts`, registered in
   `regions/index.ts`; `RegionCode` widened. `REGION_OPTIONS` is derived from
   the registry, so the picker gained all four with no UI change.
2. ✅ Each pack carries its own agencies, no-link senders, toll/parcel/utility/
   pension/tax campaigns, identity re-registration lures, typosquat and brand
   sets, legit domains, regulator copy and reporting body.

**Canada ships as `coverage: "partial"`, not `"full"`.** The one deliberate
divergence. Every keyword is English, against an officially bilingual population
where roughly a fifth speak French at home. A French-language smish would match
almost nothing and, declared "full", would return a confident-looking clean
verdict — the exact silent-collapse failure the guiding constraints name.
Declared partial, the Phase 3 coverage gate downgrades clean verdicts to
`unknown` while positive detections still report normally. Promoting it is
Phase 6 work: it needs French keyword sets and a native-speaker review.

**Bugs found by exercising four more regions**

The pattern from Phases 4 and 5 repeated: each bug lived at a seam that only a
new region could reach.

- **Short agency acronyms fired inside ordinary English.** The worst of the
  three, and it affected the shared scorer rather than one pack. Agency lists
  are plain string arrays with no substring/word split (unlike `BrandSet`), and
  national agency acronyms are overwhelmingly three letters — so plain
  `includes()` matched inside common words. NZ's `"acc"` flagged **"your account
  is fine"** as government impersonation; `"ssa"` read "me**ssa**ge" as the SSA,
  `"sec"` read "**sec**urity" as the SEC, and `"ird"` read "we**ird**" and
  "th**ird**" as Inland Revenue. Since "security" and "account" appear in a large
  share of both legitimate and scam messages, this was a false positive on
  ordinary traffic, not an edge case.

  Fixed with `mentionsAny` in `scamDetector`: entries of ≤3 characters are
  matched on `\b` boundaries — the same rule `BrandSet.word` already used —
  applied *automatically* by length rather than via a curated list, so a future
  pack author inherits the protection without opting in. Applied to
  `authorityMentions`, `noLinkSenders`, `foreignAuthorityMentions`,
  `callbackBrands` (IE's `"eir"` ⊂ "th**eir**") and `officialSenderNames`, which
  had the same latent exposure in the **pre-existing AU and GB packs**
  (`"ato"`, `"anz"`, `"nab"`, `"dwp"`).

- **NANP premium numbers lost their warning for Canadian users.** The Phase 4
  failure mode at a new seam. libphonenumber resolves any bare `+1 900` to `US`,
  so for a Canadian user the number read as *foreign*, and the domestic-premium
  guard — added in Phase 4 to stop an unparseable foreign number being called
  domestic premium — suppressed the flag entirely. The identical
  `1-900-555-1212` scored **95 for a US user and 35 for a Canadian one**, with
  risk collapsing from `very_high` to `low` on the one case that directly costs
  the user money.

  Fixed with `PLAN_PEERS`, held separately from `SHARED_NUMBER_PLANS` because
  the relationship differs: Guernsey is *subordinate* to GB (and should display
  as "United Kingdom"), whereas Canada and the US are *peers* in the NANP and
  must each keep their own name. Merging them would have fixed domesticity while
  reporting Canadian numbers as American.

- **Domestic numbers displayed the home country, not their own.** Surfaced by
  the peer fix: the domestic branches returned `country: homeName`, so a Toronto
  number read as "United States" for a US user. Harmless while every domestic
  number *was* the home country; wrong as soon as peers existed — and misleading
  precisely when someone checks a number because it looks out-of-area. Now
  `domesticName()` prefers the parsed country, leaving subordinate territories
  (a +44 Jersey number → "United Kingdom") unchanged.

**Deviations**

- **No `areaCodes` for US or CA.** The NANP has ~300 US area codes, but unlike
  the UK and AU plans they carry almost no signal: portability and VoIP mean an
  area code no longer indicates where a caller is. Attributing "212 → New York"
  would state something we can't stand behind. NZ (5 codes) and IE (~45) are
  enumerated, since the code still genuinely indicates a region there.
- **No trusted suffix is an open registration, in any pack.** The GB `.co.uk`
  lesson generalised: `.com`/`.us` (US), `.co.nz` (NZ), `.ca` (CA) and `.ie`
  (IE) are all excluded. `.ca` is the subtle one — residency requirements are
  not the same eligibility bar as government status — and `.ie` relaxed its
  connection-to-Ireland rule in 2018, so a national suffix being "restricted" has
  to be checked against the registry's *current* policy rather than assumed.
- **No `senderIdFlag` for any of the four.** None has an ACMA-style scheme that
  labels messages "Unverified"; the US (10DLC/CTIA), NZ, CA (CRTC) and IE
  (ComReg) schemes all govern *origination* instead, so there is no label for a
  scammer to explain away.
- **Two pack-authoring double-counts, caught by the existing invariant** before
  they ever ran: NZ's `"kiwisaver funds"`/`"release kiwisaver"` alongside
  `"kiwisaver"`, and CA's `"interac e-transfer"` alongside both its halves. The
  Phase 5 invariant paid for itself on the first new region.

**A pre-existing test asserted `US` was uncovered** (`regionResolver.test.ts`),
which the US pack makes false. Swapped for `JP` — the fixture needs updating each
time a pack lands, which is the intended maintenance signal rather than a
regression.

**Code-review finding, fixed in a follow-up commit**

- **A fake two-part suffix defeated typosquat scoring in every pack at once.**
  The registrable-label rule inferred a two-part public suffix from the
  penultimate label alone — "is it `co`/`com`/`gov`/`org`/…?" — which is true for
  `chase.gov.co` and `kiwibank.co.io`. But `.co` and `.io` are ordinary gTLDs, so
  there the last two labels *are* the registrable domain. Reading them as a
  suffix made the brand own the registrable label, which tripped the Phase 5
  "the brand owns the label, so it's the real site" exemption and suppressed
  brand scoring outright.

  One open-registration domain therefore bypassed the rule in all six regions:
  `commbank.gov.co` (AU), `barclays.com.co` (GB), `chase.gov.co` and
  `paypal.gov.io` (US), `kiwibank.co.io` (NZ), `scotiabank.gov.io` (CA) and
  `anpost.gov.co` (IE) all returned no brand flag. **Pre-existing on `main`** —
  it predates this branch and affected the shipped AU and GB packs — but it
  surfaced while reviewing the new packs, so it is fixed here.

  Replaced with an enumerated `TWO_PART_SUFFIXES` set matched against the last
  two labels as a whole. A miss degrades safely: the hostname is read as
  `<label>.<tld>`, which at worst flags a genuine site under an unlisted suffix —
  the conservative direction for a scam detector.

  Two new pack invariants in `regions.test.ts` enforce both halves for every
  present and future region: a brand under a fake two-part suffix must still be a
  typosquat, *and* a brand on its own real domain must still not be. The second
  matters as much as the first — Phase 5 found that dropping the exemption
  flagged 21 of 24 genuine UK brand sites as `likely_scam` — and it deliberately
  includes real `.co.uk` / `.com.au` / `.co.nz` hosts, because a bare
  `<brand>.com` has only two labels and never exercises the suffix path at all.

**Review notes that did *not* result in changes.** Two other candidates were
investigated and dismissed on evidence: the `mentionsAny` boundary rule handles
punctuation-adjacent mentions correctly (`IRD:`, `(IRD)`, `ACC-related` all
match; `SECURE` and `IRDNZ` correctly don't), and the `PLAN_PEERS` table reads
asymmetric but behaves symmetrically — Caribbean wangiri numbers (`1876`, `1268`)
remain correctly foreign and flagged for US and CA users.

**Known issue, out of scope and unfixed.** An AU user checking a Caribbean
wangiri number (`1876…`) gets `country: "Australia"` and **no wangiri flag**:
libphonenumber parses the NANP national form against the AU plan. Pre-existing,
unrelated to region packs, and it defeats wangiri detection for the product's
home region — worth its own fix.

**Gate:** ✅ `npm test` green — **865 passing**, with the 725 pre-existing
**untouched**, including zero changes to `scamDetector.test.ts` (the load-bearing
Phase 1 check) and none to `regionGb.test.ts`. New
`__tests__/regionPacksFollowup.test.ts` (103 tests) covers per-region SMS / URL /
email / phone fixtures, pack-shape invariants, the coverage gate for CA, the
two-part-suffix regressions, and isolation asserted pairwise — IE↔GB hardest,
since shared language and brands with entirely different agencies make it the
likeliest conflation. Three further invariants in `regions.test.ts` enforce the
acronym rule and both halves of the suffix rule behaviourally for every present
and future pack.

Every fix was mutation-checked: reverting `mentionsAny` fails the new invariant
for exactly US/NZ/CA, reverting `PLAN_PEERS` fails the CA premium test, and
restoring the old marker-based suffix rule fails the suffix invariant in **all
six** packs — as does removing two-part handling altogether, which is what
confirms the genuine-site half is actually exercised rather than passing
vacuously. Aliasing each new pack to AU fails 12–15 tests, confirming all four
are load-bearing rather than decorative.

Scope: new `lib/regions/{us,nz,ca,ie}.ts`, `lib/regions/types.ts`,
`lib/regions/index.ts`, `lib/scamDetector.ts`, `lib/phoneIntel.ts`, new
`__tests__/regionPacksFollowup.test.ts`, `__tests__/regions.test.ts`,
`__tests__/regionResolver.test.ts`.

---

## Phase 6 — Locale vs tone split (only if going non-English)

**Decision point, not a commitment.** `lib/i18n.ts` currently has two *tone*
modes (`normal` / `aussie`), not real locales. Detection keywords are
English-only.

1. Split the axis: `locale` (en / de / es / …) × `tone` (normal / regional).
2. Region packs gain per-language keyword sets.
3. **Every non-English pack needs a native-speaker review before shipping.**
   Without one it ships as `coverage: "partial"` at most.

This is the expensive phase and the one that decides whether the product is
"English-speaking worldwide" or "actually worldwide". Recommend deferring until
Phases 1–5 are live and we have real signal on demand by region (Phase 2 stores
this).

---

## Sequencing

Phases 1 → 2 → 3 are prerequisites and should land in order. Phase 4 is
independent of 3 and can be parallelised. Phase 5 validates 1–4 — and did:
it found two region-seam bugs and one missing extraction that AU-only testing
could not surface. Phase 6 is a separate product decision.

Phases 1–5 and the US/NZ/CA/IE follow-ups are complete: **six covered regions**
(AU, GB, US, NZ, CA, IE) plus the base-only fallback. The follow-ups confirmed
the interface is stable — no field changed — while still surfacing three real
defects, two of which affected the already-shipped AU and GB packs. The lesson
worth carrying into any future region: "data-only" is not the same as
"risk-free", because each new pack reaches seams the existing ones never did.

**Next up is the Phase 6 locale decision**, which the plan recommends deferring
until there's real per-region demand signal — Phase 2 stores the resolved region
on every report, so that data is now accumulating across six regions rather than
one. Canada gives it a concrete, bounded first target: the CA pack is the only
one shipping as `coverage: "partial"`, purely because its keywords are English
in a bilingual market, so French is where Phase 6 would buy the most per unit of
effort. That still requires the native-speaker review the phase mandates.

Each phase = its own branch, own commit, tests green before merge.
