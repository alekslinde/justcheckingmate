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

**Gate:** ✅ `npm test` green — 632 passing, with the pre-existing 609
untouched. New `__tests__/phoneIntel.test.ts` covers AU depth, UK and US
classification, region-relative domesticity, and that AU specifics don't leak
into other regions' copy.

Scope: `lib/phoneIntel.ts`, `lib/scamDetector.ts` (`checkPhone` copy),
`lib/regions/types.ts`, `lib/regions/au.ts`, `lib/regions/index.ts`,
`messages/`, `__tests__/phoneIntel.test.ts`.

**Note for Phase 5:** UK, US, NZ, CA and IE numbers already classify correctly
with no pack, so those packs only need the scam layer — agencies, brands,
legit domains — not number-plan work. A `phonePlan` is optional per region.

---

## Phase 5 — Second English region (UK)

**Outcome:** proof the pack interface generalises. UK chosen because scam
playbooks are near-identical and the language is shared.

Pack contents: HMRC / DVLA / DWP / NHS / Royal Mail / TV Licensing, Dart Charge
and toll equivalents, `gov.uk` + agency legit-domain list, UK bank brands,
National Insurance / "NI number suspended" phrasing, Action Fraud as the
reporting body.

**Gate:** UK fixtures detect correctly; AU suite still untouched and green.
If Phase 5 requires changing the Phase 1 interface, that's expected — better
found here than at region #5.

Then repeat cheaply for **US, NZ, CA, IE** as separate follow-ups.

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
independent of 3 and can be parallelised. Phase 5 validates 1–4. Phase 6 is a
separate product decision.

Each phase = its own branch, own commit, tests green before merge.
