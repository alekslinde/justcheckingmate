# Verdict UI — artifact vs. implementation gap plan

Compares the design artifact against prod. Originally written against `adf54be`;
**re-audited 2026-09-05 against `dcf9deb`**, at which point six of the nine
items had shipped. See "Audit log" at the foot for what changed.

- **Screenshot 1 — the artifact** (`claude.ai/code/artifact/7a3a8a2d-…`), a
  self-contained HTML prototype. This is the design target.
- **Screenshot 2 — prod**, the running Next.js app.

The artifact fakes its verdict: the evidence rows, the score and the tactic
hits are hardcoded markup (lines 796-843 of the artifact source), driven by a
`setState('result')` demo toggle. So it is a statement of intent about the
*output*, not a working detector — every gap below is about making the real
engine and UI produce that output for real.

Originally the gap was mostly layout and engine composition, not missing copy.
As of the re-audit the layout and composition work has all landed — what is left
is two engine signals (gaps 2 and 3) and one cosmetic wording delta (gap 4).

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

**Actual engine output on `dcf9deb`** (`analyzeContent`, AU region):

| result | score | signals |
| --- | --- | --- |
| message | **100** (raw 105, capped) | urgency +30 · contains-link +15 · link-also-dodgy +20 · government-agency +25 · AU-bodies-dropped-SMS-links +15 · cap −5 |
| url | **55** | `.top` TLD +30 · no HTTPS +15 · login/verify keyword +10 |

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

## ❌ Gap 2 — "Small-fee payment lure" signal does not exist — **OPEN**

Artifact row: `MESSAGE · Small-fee payment lure — captures card details for
a plausible amount · +20`. Nothing matching `small.fee` exists repo-wide.

The `$2.15` in the fixture is still unscored — the message reaches 100 through
urgency, government-agency and link signals, not through the fee lure. Note
`signalTactics.ts` pattern 5 *already* matches
`(customs|release|delivery|small|processing)\s+fee`, so the "Unusual payment"
tactic lights up from other wording; the evidence row behind it is missing.

**Scope has narrowed since the plan was written.** The message result already
caps at 100 off a raw 105, so adding +20 moves no score the reader can see — it
adds an evidence row and nothing else. Still worth doing for the teaching value
(the row names the tell), but it is no longer a scoring fix, and it should not
be sequenced as though a verdict depends on it.

**Work:** add the signal in `packages/engine/src/scamDetector.ts` (message
branch), weight +20, matching a small currency amount near fee/pay language.
Detection change ⇒ needs `__tests__/scamDetector.test.ts` coverage per CLAUDE.md.

## ❌ Gap 3 — Brand impersonation: copy and match both wrong — **OPEN**

Neither half has been done. This is the only remaining gap that changes a
verdict, and should go first.

**(a) Copy.** `scamDetector.ts:573` and `:578` still read
`Looks like it's impersonating "${brand}" — classic phishing move`. The
artifact's phrasing is more direct: `Impersonates "Australia Post" in the
domain name — classic phishing move`. Copy belongs in `messages/`, not inline.

**(b) The match does not fire, and the root cause is now known.**
`scamDetector.ts:557-563` derives `registrable` as the second-to-last label
(third-to-last for a two-part suffix). For `auspost-redelivery.secure-track.top`
that is **`secure-track`** — so `auspost` sits in a subdomain that the
word-boundary loop at `:576` never inspects. The substring loop at `:570` checks
the full hostname and *would* match, but `auspost` is absent from the AU
`typosquatBrands.substring` list (`regions/au.ts:324`); it appears only in the
government-body and impersonation keyword lists at `regions/au.ts:182` and
`:213`, which feed different rules.

**AU is the only pack missing its postal brand.** Checked on re-audit — every
sibling carries theirs in `typosquatBrands`: `ie` has `anpost`, `gb` `royalmail`,
`ca` `canadapost`/`postescanada`, `nz` `nzpost`, `us` `usps`/`fedex`/`ups`. AU
lists banks, telcos, toll operators, super funds and loyalty programs
(`regions/au.ts:324-403`) but no postal brand at all. So this is a single
omission to close, not a sweep.

**Work:** add `auspost` (and consider `australiapost`) to AU's
`TYPOSQUAT_BRANDS`, then confirm the substring loop at `scamDetector.ts:570`
actually reaches a brand sitting in a subdomain rather than the registrable
label — that loop tests `hostname.includes(brand)`, so it should, but the
fixture is the proof. Tests required.

## ❌ Gap 4 — Urgency row wording — **OPEN, and the delta grew**

- Artifact: `Urgency language detected: "within 24 hours", "or it's returned" · +20`
- Actual on `dcf9deb`: `"within 24 hours", "customs fee", "parcel is held"` · **+30**

The plan originally recorded two captured phrases at +20; the engine now
captures three and weights them +30. No `or it's returned` pattern exists in the
engine. Still cosmetic and still low priority — fold it into gap 2 or 3's test
fixture rather than doing it alone.

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

## Remaining order

Two items left, both engine-side.

1. **Gap 3** — the only open item that changes a verdict. Engine + brand list +
   copy to `messages/`, with a sweep of the sibling region packs.
2. **Gap 2** — engine + test, independent of 3. Adds an evidence row, not a
   score.
3. **Gap 4** — fold into whichever of the above lands first; not worth its own
   change.

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
