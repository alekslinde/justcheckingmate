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

## Phase 4 — Phone number generalisation

**Outcome:** phone checks work for any country, AU keeps its current depth.

1. Adopt `libphonenumber-js` for parse / validity / line-type / region. It's a
   static lookup table, not an API or model — consistent with the rule-based
   constraint. Confirm bundle-size impact (use the `min` metadata build).
2. Replace `isAustralian: boolean` with `isDomestic: boolean` (relative to the
   resolved region) and keep `country` as-is.
3. Keep our own heuristics layered on top: wangiri, high-scam country codes,
   elevated-volume codes, spoofing risk. These stay ours — libphonenumber has no
   opinion on scams.
4. Move AU number-plan specifics (`AU_STD`, `AU_VOIP_MOBILE_PREFIXES`, 13/1300/1800
   semantics) into `lib/regions/au.ts` as a `phonePlan` section.
5. Reword AU-framed copy ("targeting Australia" → "targeting your region").

**Gate:** existing phone tests green; new tests for at least UK + US numbers.

Scope: `lib/phoneIntel.ts`, `lib/scamDetector.ts` (`checkPhone` copy),
`lib/regions/*`.

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
