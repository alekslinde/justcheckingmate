# Verdict UI — artifact vs. implementation gap plan

Compares the design artifact against prod on `main` (adf54be).

- **Screenshot 1 — the artifact** (`claude.ai/code/artifact/7a3a8a2d-…`), a
  self-contained HTML prototype. This is the design target.
- **Screenshot 2 — prod**, the running Next.js app.

The artifact fakes its verdict: the evidence rows, the score and the tactic
hits are hardcoded markup (lines 796-843 of the artifact source), driven by a
`setState('result')` demo toggle. So it is a statement of intent about the
*output*, not a working detector — every gap below is about making the real
engine and UI produce that output for real.

The gap is mostly layout and engine composition, not missing copy: every string
in the artifact's verdict card already exists in `messages/en.normal.json`.

---

## Verified as already implemented in prod

Not gaps. Confirmed present so nobody rebuilds them:

- Evidence rows w/ source eyebrow + signed points — `VerdictBadge.tsx:41-72`
- Negative clamp row, green, `−30` — engine `finalise()`, `scamDetector.ts:88-96`
- Risk meter w/ 20/45 threshold ticks — `VerdictBadge.tsx:201-247`
- "Tactics in play", 6 rows, matched chips — `VerdictBadge.tsx:249-290` + `lib/signalTactics.ts`
- Numbered "what to do right now" — `ActionSteps`, `VerdictBadge.tsx:74-95`
- All verdict copy — `verdict.likely_scam.*`, `verdict.evidence.*`, `verdict.tactics.*`

---

## Gap 1 — Evidence is split per identifier, not merged (highest impact)

The artifact shows **one** evidence list mixing `LINK` and `MESSAGE` rows and a
single clamp to 100. Prod's engine returns an array — one result per
identifier — and each scores independently.

Actual output for that exact input:
- message result: score 95, 5 signals, none of them `link`-sourced
- url result: score 45, 2 signals (`.top` +30, no-HTTPS +15)

So prod shows an "overall verdict" card plus a "what we checked" list. The
unified evidence table the artifact promises cannot be produced at any input.

Consequence: the `+45` / `+30` / `+15` LINK rows can never appear beside the
MESSAGE rows, and the clamp row never fires — neither sub-result reaches 100.

**Work:** merge signals across results before rendering. Union the arrays,
tag each with its source, sum, then clamp once. `composeVerdict` already
centralises worst-wins for the headline (`CheckFlow.tsx:485`) — extend it to
compose evidence too, so the email reply path can't drift. Needs tests in
`__tests__/verdictSummary.test.ts`.

## Gap 2 — "Small-fee payment lure" signal does not exist

Artifact row: `MESSAGE · Small-fee payment lure — captures card details for
a plausible amount · +20`. `grep -r "Small-fee"` returns nothing repo-wide.

The $2.15 in the input is currently unscored — no signal reads a small
currency amount as a lure. Note `signalTactics.ts` pattern 5 *already* matches
`(customs|release|delivery|small|processing)\s+fee`, so the "Unusual payment"
tactic lights up from other wording; the evidence row behind it is missing.

**Work:** add the signal in `packages/engine/src/scamDetector.ts` (message
branch), weight +20, matching a small amount near fee/pay language. Detection
change ⇒ needs `__tests__/scamDetector.test.ts` coverage per CLAUDE.md.

## Gap 3 — Brand impersonation copy differs

- Artifact: `Impersonates "Australia Post" in the domain name — classic phishing move`
- Code (`scamDetector.ts:402,407`): `Looks like it's impersonating "${brand}" — classic phishing move`

Also, the signal did not fire for `auspost-redelivery.top` — only the TLD and
HTTPS signals did, so "Australia Post" is not matching as a brand token here.

**Work:** (a) reword to the artifact's stronger, more direct phrasing, and
(b) fix the brand match so `auspost` resolves to Australia Post. Both are
detection-adjacent ⇒ tests required. Copy belongs in `messages/`, not inline.

## Gap 4 — Urgency row wording and weight

- Artifact: `Urgency language detected: "within 24 hours", "or it's returned" · +20`
- Actual: `"within 24 hours", "parcel is held"` · +20

Weight matches; the second captured phrase differs. Cosmetic — the artifact's
`or it's returned` is the more legible tell. Low priority.

## Gap 5 — Threshold explainer sentence missing

The artifact has, under the meter: *"Anything at **45 or above** is called a
scam. This one reached the **100** ceiling — the brand impersonation alone
(+45) clears it."*

No such key exists (`verdict.score.*` is only `label` / `caution` / `scam`) and
`VerdictBadge` renders nothing between meter and actions. This is the single
best teaching moment in the design — it explains *why* the verdict, naming the
one signal that carried it.

**Work:** new i18n key w/ interpolation, computed from the top-weighted signal.
Depends on Gap 1 (needs the merged list to pick a genuine top signal).

## Gap 6 — Action button row

Artifact: `Report this scam` · `Share these results` · `Edit & check again`
· `Wrong verdict?` (red, right-aligned).

Prod: stacked full-width `REPORT THIS SCAM ANYWAY` and
`Share these results`. No `Wrong verdict?` affordance and no i18n key for one.

**Work:** horizontal button row; add the "Wrong verdict?" feedback entry point.
That last one is a real product decision, not just layout — worth confirming
where it should route before building.

## Gap 7 — Two-column layout

Artifact puts evidence left (~60%) and tactics right in a sticky rail. Current
`VerdictBadge` stacks both full-width (`:323`, `:336`). Purely presentational;
do it after Gap 1, since a merged evidence list changes the column's height.

## Gap 8 — Sample URL differs (affects gaps 2 and 3)

The artifact's own sample (`SAMPLE`, artifact line 1906) is:

    http://auspost-redelivery.secure-track.top/pay

Prod was probed with `auspost-redelivery.top`. The artifact's host has an extra
`secure-track` label, which should additionally trip the existing subdomain-depth
(+20) and login/verify-keyword (+10) signals at `scamDetector.ts:431,436`. Use
the artifact's exact string as the fixture when writing tests for gaps 2 and 3,
or the expected totals won't line up.

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

**Do not port the artifact's lede.** Keep prod's wording. Worth a look at the
rest of the artifact's About/privacy copy for the same overclaim before lifting
any of it.

---

## Also worth fixing: CLAUDE.md is stale

It documents detection as living in `lib/` (`scamDetector.ts`, `phoneIntel.ts`,
`urlSanitizer.ts`, `detectType.ts`, `emailHeaders.ts`, `urlExpander.ts`). All
six moved to `packages/engine/src/` in c9872ba. `lib/` now holds only the
teaching/presentation layer. Worth correcting — it misdirects file lookups.

## Suggested order

1. Gap 1 (unblocks 5 and 7; largest behavioural change)
2. Gaps 2 + 3 (engine + tests, independent of each other)
3. Gap 5 (needs 1)
4. Gaps 6, 7, 4 (presentation)
5. Gap 8 folds into 2 and 3 — just use the right fixture
6. CLAUDE.md correction — any time

Reverse gap needs no work: it is a note not to port the artifact's weaker
privacy claim.

Open question for gap 6: where should "Wrong verdict?" go — the existing bug
report flow (`BugReportProvider` / `app/api/bug`), or a distinct
false-positive channel that captures the input and verdict?
