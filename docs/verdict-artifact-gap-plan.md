# Verdict UI — artifact vs. implementation gap plan

Compares the design artifact against prod. Originally written against `adf54be`;
**re-audited 2026-09-05 against `dcf9deb`** (six of nine shipped), then the
remaining three were implemented on `feat/verdict-artifact-gaps`. **All nine are
now closed.** See "Audit log" at the foot.

- **Screenshot 1 — the artifact** (`claude.ai/code/artifact/7a3a8a2d-…`), a
  self-contained HTML prototype. This is the design target.
- **Screenshot 2 — prod**, the running Next.js app.

The artifact fakes its verdict: the evidence rows, the score and the tactic
hits are hardcoded markup (lines 796-843 of the artifact source), driven by a
`setState('result')` demo toggle. So it is a statement of intent about the
*output*, not a working detector — every gap below is about making the real
engine and UI produce that output for real.

Originally the gap was mostly layout and engine composition, not missing copy.
The layout and composition work landed first; the three engine gaps (2, 3, 4)
closed after the re-audit. The fixture below now scores as the artifact drew it.

---

## Reference fixture

Gaps 2, 3 and 4 are all about how one input scores, so they share a fixture —
the artifact's own sample (`SAMPLE`, artifact line 1906):

    AusPost: your parcel is held pending a $2.15 customs fee. Pay within
    24 hours or it's returned. http://auspost-redelivery.secure-track.top/pay

Note the host has a `secure-track` label between the brand and the TLD. That
matters twice over: it trips the login/verify-keyword rule, and it is *why* the
brand match fails (gap 3). Use this exact string in tests or the totals below
won't line up.

**Engine output before the gap work** (`analyzeContent`, AU region, `dcf9deb`):

| result | score | signals |
| --- | --- | --- |
| message | **100** (raw 105, capped) | urgency +30 · contains-link +15 · link-also-dodgy +20 · government-agency +25 · AU-bodies-dropped-SMS-links +15 · cap −5 |
| url | **55** | `.top` TLD +30 · no HTTPS +15 · login/verify keyword +10 |

**After gaps 2, 3 and 4:**

| result | score | signals |
| --- | --- | --- |
| message | **100** (raw 130, capped) | urgency +35 · **small-fee lure +20** · contains-link +15 · link-also-dodgy +20 · government-agency +25 · AU-bodies-dropped-SMS-links +15 · cap −30 |
| url | **100** | `.top` TLD +30 · **impersonates "auspost" +45** · no HTTPS +15 · login/verify keyword +10 |

Two things the plan predicted are now true and were not before: the URL reaches
the 100 ceiling on the brand signal, and the negative clamp row fires visibly at
**−30** (the plan noted it "never fires — neither sub-result reaches 100").
Urgency rose 30→35 because gap 4 added a fourth matching phrase.

---

## Verified as already implemented in prod

Not gaps. Confirmed present so nobody rebuilds them:

- Evidence rows w/ source eyebrow + signed points — `VerdictBadge.tsx:51-85` (`Evidence`)
- Negative clamp row — engine `finalise()`; fires on the fixture at `−5`
- Risk meter w/ 20/45 threshold ticks — `VerdictBadge.tsx:236` (`RiskScore`)
- "Tactics in play", 6 rows, matched chips — `VerdictBadge.tsx:346` (exported;
  rendered by `CheckFlow.tsx:1316` into the sticky rail — see gap 7)
- Numbered "what to do right now" — `ActionSteps`, `VerdictBadge.tsx:86`
- All verdict copy — `verdict.likely_scam.*`, `verdict.evidence.*`, `verdict.tactics.*`

---

## ✅ Gap 1 — Evidence merged across identifiers — **DONE**

Was: the artifact showed one evidence list mixing `LINK` and `MESSAGE` rows and
a single clamp; prod scored each identifier independently, so the unified table
could not be produced at any input.

Shipped as `composeVerdictWithEvidence` at `lib/verdictSummary.ts:568` — unions the
signal arrays, keeps each row's source tag, sums and clamps once. Consumed at
`CheckFlow.tsx:1140`, so the email reply path composes from the same function
and cannot drift. Covered by `__tests__/verdictSummary.test.ts:503`
("composeVerdictWithEvidence — the rows add up to the score").

## ✅ Gap 2 — "Small-fee payment lure" signal — **DONE**

Artifact row: `MESSAGE · Small-fee payment lure — captures card details for
a plausible amount · +20`. Nothing matching it existed repo-wide.

Added in `packages/engine/src/scamDetector.ts` (message branch), weight +20.
The size of the amount is what carries the rule, which is why it is its own
signal rather than another `urgencyWords` entry: a large sum reads as a scam
unaided and trips the existing money rules, while $2.15 is the one that gets
paid without a second thought. Capped at $20, above which the "too trivial to
question" property stops holding.

Requires fee/pay framing near the amount so ordinary commerce does not match —
a price names a cost, it does not demand a payment to release something. Covered
by seven cases in `__tests__/scamDetector.test.ts`, three of them false-positive
guards (`$9.99 a month`, an order total, a `2.30` appointment time).

Note the plan's own caveat held: the message result already capped at 100, so
this adds an evidence row rather than moving a score. It does raise the raw
total 105 → 130, which is what makes the clamp row visible.

## ✅ Gap 3 — Brand impersonation: copy and match — **DONE**

Both halves, and this was the one item that changed a verdict.

**(a) Copy.** Now `Impersonates "${brand}" in the domain name — classic
phishing move` (`scamDetector.ts:575,581`). The hedge invited the reader to
weigh up a link they were deciding whether to trust, and naming *where* the
brand appears is the teachable part — the tell is the brand sitting somewhere
other than the registrable label, which is exactly what the check tests.

**(b) The match.** Root cause was a missing brand, not broken logic:
`registrable` for `auspost-redelivery.secure-track.top` is `secure-track`, so
the word-boundary loop never sees `auspost` — but the substring loop tests the
full hostname and would have caught it, had `auspost` been in the list. It was
not. Added `auspost`, `australiapost`, `startrack` and `aupost` to AU's
`TYPOSQUAT_BRANDS` (`regions/au.ts`). The URL now scores 100, up from 55.

`auspost.com.au` and `track.auspost.com.au` stay clean via the
brand-owns-the-registrable-label exemption, not a suffix allowlist.

**Regression worth recording.** The brand must go in `TYPOSQUAT_BRANDS` only,
never `BRAND_MENTIONS` — AU is deliberately the one pack where postal brands do
not sit in both lists (see the note at `scamDetector.ts:1509`). Adding it to
both promoted the deferred brand-mention row and made a genuine Australia Post
email score 24/suspicious. A test in `scamDetector.test.ts` now pins that email
to `safe`.

## ✅ Gap 4 — Urgency row wording — **DONE**

Added the return threat to AU's `URGENCY_PARCEL` (`regions/au.ts`):
`or it's returned`, `or it will be returned`, `will be returned to sender`,
`returned to sender within`. The deadline's consequence is the half that makes
the urgency bite and the phrasing a reader recalls afterwards.

Safe against a real carrier's vocabulary: a genuine return-to-sender notice
reports a completed outcome, not a payment deadline that will cause one — pinned
by a test.

One thing to know about the fixture: it now trips four urgency phrases and the
flag quotes only the first three (`urgencyHits.slice(0, 3)`), so `or it's
returned` is matched but not displayed there. The test asserts it on a message
of its own for that reason.

## ✅ Gap 5 — Threshold explainer sentence — **DONE, and went further**

Shipped as a band of keys rather than the single sentence the plan asked for:
`verdict.score.band.{safe,suspicious,scam,scamMany,clincher,capped}` at
`messages/en.normal.json:529-540`. `clincher` names the one finding that carried
the verdict (`One finding was enough on its own (+{points}): "{signal}"`) and
`capped` explains the clamp (`The findings came to {raw} before we stopped
counting at 100`) — which together cover the artifact's intent and also handle
the many-signal and capped cases the artifact's single sentence did not.

## ✅ Gap 6 — Action button row + "Wrong verdict?" — **DONE**

`check.wrongVerdict` exists at `messages/en.normal.json:38` and is wired in at
`CheckFlow.tsx:1302`, which carries a comment on why the affordance belongs at
that moment. The plan's open question — bug flow vs. a distinct false-positive
channel — was resolved in the implementation; no decision outstanding.

## ✅ Gap 7 — Two-column layout — **DONE**

The artifact puts evidence left (~60%) and tactics right in a sticky rail. Prod
now does the same, but the code is in `CheckFlow`, not `VerdictBadge` — which is
why a first pass over the badge alone reads as "still stacked".

- Grid at `CheckFlow.tsx:1114`:
  `min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]` with
  `items-start` — a 64/36 split against the artifact's ~60/40.
- Sticky rail at `CheckFlow.tsx:1315`:
  `<aside className="min-w-0 min-[900px]:sticky min-[900px]:top-[18px]">`
  wrapping `<Tactics />`.
- Single column below 900px, which the artifact did not specify.

`VerdictBadge` itself stacks its own bands top-to-bottom by design (see the
comment at `VerdictBadge.tsx:442`ff on reading the sheet as one receipt). That
is the *left column's* internal order, not a contradiction of the two-column
layout — the two decisions sit at different levels.

## ✅ Gap 8 — Sample URL — **FOLDED IN**

Absorbed into the "Reference fixture" section above. The extra `secure-track`
label does trip the login/verify-keyword rule (+10) as predicted; it does *not*
trip subdomain-depth, and it is the direct cause of gap 3(b).

---

## Reverse gap — prod's privacy copy is more accurate; keep prod's

Not everything in the artifact should be ported. Its hero lede reads:

> Every check runs on rules we publish — **nothing is stored, shared, or opened.**

Prod's `home.subtitle` reads:

> Every check runs on rules we publish — **what you paste isn't stored, and we
> never open its links.**

Prod is correct and the artifact overclaims: submitted reports *are* stored
(scrubbed) via `reportStore.ts`, which the artifact's own About page concedes
("Stored, scrubbed — reports you choose to submit"). The narrower claim is also
the one that survives scrutiny, which matters for a product whose pitch is
transparency.

**Do not port the artifact's lede.** Keep prod's wording — verified intact on
`dcf9deb`. Worth a look at the rest of the artifact's About/privacy copy for the
same overclaim before lifting any of it.

---

## Status

All nine gaps are closed, plus the CLAUDE.md correction. The reverse gap needed
no work — it was a note not to port the artifact's weaker privacy claim, and
prod's wording is intact.

Nothing outstanding. Two observations worth carrying forward rather than acting
on now:

- **Signal copy is not in `messages/`.** The plan asked for gap 3's wording to
  live there. Engine signals are emitted as English strings and rendered
  verbatim — there is no key indirection for them anywhere, so moving one signal
  would mean inventing a signal-key architecture across every call site in
  `scamDetector.ts`. Reworded in place instead, matching every other signal in
  the file. Worth doing properly if the product is ever translated; not worth
  one gap diverging from the established pattern.
- **`.slice(0, 3)` on urgency hits** means a message tripping many phrases shows
  an arbitrary three. Fine today, but it makes the evidence row a lossy summary
  of what actually scored.

## Audit log

**2026-09-05 (`dcf9deb`)** — re-ran the artifact fixture through `analyzeContent`
and checked each gap against source.

- Gaps 1, 5, 6 shipped; 5 and 6 went beyond what the plan specified.
- Gap 8 folded into the fixture section.
- Gap 2 rescoped: no longer moves a score, because the message result caps.
- Gap 3 root-caused to `registrable`-label derivation plus a brand-list omission.
- Gap 4 figures corrected: three phrases at +30, not two at +20.
- Gap 7 found already shipped: the grid and sticky rail live in `CheckFlow`
  (`:1114`, `:1315`), not `VerdictBadge`. A first pass that searched only the
  badge concluded it was still stacked; corrected on re-audit.
- The plan's original "actual output" figures (message 95/5 signals, url 45/2)
  were stale and have been replaced.
- The plan's closing note that CLAUDE.md documents detection under `lib/` is no
  longer true — it was corrected in c9872ba's wake and now points at
  `packages/engine/src/`. Item removed.

**2026-09-05, later — gaps 2, 3 and 4 implemented** on
`feat/verdict-artifact-gaps`. Full suite 2105 passing (13 new tests), lint and
`tsc --noEmit` clean.

- Gap 3 root cause was a missing brand, not broken matching logic — the
  substring loop already handled a brand in a subdomain.
- Adding the brand to `BRAND_MENTIONS` as well as `TYPOSQUAT_BRANDS` regressed a
  genuine Australia Post email to suspicious, by promoting a deferred row. AU
  keeps postal brands out of `BRAND_MENTIONS` deliberately; now pinned by a test.
- 36 test failures during the work were almost all the copy reword meeting
  assertions on the old string, including two files whose `flagText` helper
  lowercases — assertions there must be lowercase.
- The clamp row now fires visibly (−30) for the first time, and the URL result
  reaches 100. Both were things the plan said could not happen.
