# Corpus eval

Aggregate quality measurement for the detection engine. Run it with:

```bash
npm run eval                          # gate against thresholds + baseline
npm run eval -- --suspicious-as=clean # sensitivity: treat "suspicious" as a pass
npm run eval -- --update-baseline     # re-record after an intended change
npm run eval -- --json                # machine-readable
```

## Why this is not in `__tests__/`

Unit tests assert **behaviour** — "this input must raise that flag" — and a red
one is a bug. The eval asserts **aggregate quality** — "recall ≥ 0.90 at
FPR ≤ 0.02" — and a red one is a judgement call about a trade someone made.
Keeping them in one suite makes both harder to read, and makes `npm test` slow
and flaky as the corpus grows. `npm test` stays the fast gate; `npm run eval` is
the deliberate one.

`__tests__/evalHarness.test.ts` is the exception: it unit-tests the harness
itself, because a metrics bug that scored everything correct would leave the
gate green and useless.

## What it measures

The runner calls `analyzeContent` — the same entrypoint as
`app/api/check/route.ts` — and reduces the resulting cards to the worst verdict,
because that is the one a user acts on. Measuring the per-type checkers instead
understates the engine: a message whose only signal is the hostname scores 0 as
a message and 85 as a URL card.

Two things are deliberately excluded so a run is reproducible:

- **The URLhaus blocklist.** `getUrlhausBlocklist()` is network-backed; including
  it would make a corpus regression and an abuse.ch feed update look identical.
- **URL expansion.** The fetcher is stubbed to throw.

A run is therefore a pure function of (corpus, region packs, engine).

## Metrics

| Metric | Reading it |
|---|---|
| Recall | Share of scams caught. |
| **FPR** | Share of benign content flagged. The one that matters most for a consumer tool — telling someone a real AusPost message is a scam costs trust that is hard to win back. |
| Precision | Depends on the corpus scam:benign ratio, which is not the real-world one. Reported with the committed counts beside it; do not quote it alone. |
| Coverage rate | Share of cases where the engine committed rather than abstaining. |
| Score p50/p90 | Verdicts are thresholded, so a change can erode margin with no metric movement and then flip many cases at once. This gives warning. |

### Abstention

`toPrediction` returns three values, not two. Under `coverage: "partial"` or
`"none"` the engine correctly declines to assert anything, and counting that as
a miss would make an honest pack look broken. CA ships `partial` while it has no
French reviewer, so CA cases abstain in bulk — that belongs in the coverage
metric, never in recall.

### `suspicious`

Counted as `flagged` by default, since the user sees a warning either way. It is
a flag rather than a decision because the headline numbers depend on it heavily:
on the seed corpus, `--suspicious-as=clean` moves FPR from ~27% to 0% and recall
from ~96% to ~77%. Effectively the entire precision/recall trade lives in that
one tier.

## Privacy

The corpus is real submissions in a git repository: checked in, cloned,
permanent, greppable. That is a different exposure from a database row, so the
check runs at load time rather than being trusted to authoring time.

It is **not** plain `scrubPii` equality. `scrubPii` redacts every address and
number, which is right for a reporter's description and wrong here: the
scammer's `From: noreply@evil.tk` is the evidence `emailHeaders.ts` scores on.
So:

1. `stripReporterHeaders` must be a no-op. A case carrying `Delivered-To` /
   `Received` / `X-Original-To` holds the *recipient's* mailbox and relay path,
   which is never evidence.
2. Every remaining PII-shaped token must appear in the case's `identifiers`
   array, written by hand.

Scam identifiers survive because someone consciously listed them; a victim's
number pasted in by accident does not.

The span-finding behind rule 2 lives in `lib/piiScrubber.ts` (`findPii`), beside
the patterns themselves. An earlier version recovered spans out here by diffing
scrubbed output against the original, which does not work: replacements change
the string's length, so a span can only be re-located by guessing at
surrounding context. Two redactions closer together than the guess width merged
into one blob — and because the error message names the blob as the string to
declare, an author copying it into `identifiers` silently whitelisted every
address inside, victim's included. `__tests__/evalHarness.test.ts` and the
`findPii` block in `__tests__/piiScrubber.test.ts` hold that shut.

**Before adding cases from real reports:** only reports whose submitter
consented to reuse may be included. The reports table does not currently record
that consent — capturing it is a schema and form change, and a prerequisite for
growing the corpus beyond the handwritten and fixture-derived seed.

## Adding a case

One JSON object per line in a `corpus/*.jsonl` file:

```json
{"id":"au-sms-0042","type":"sms","region":"AU","content":"...","label":"scam","category":"parcel-delivery","source":"report:r_8fk2","addedAt":"2026-08-29"}
```

`label` is binary (`scam` / `benign`) and deliberately not the four-way verdict,
so the verdict taxonomy can change without relabelling anything. `region` is
required — coverage varies by region and changes what a clean result means.
`category` is free text, because new lures appear faster than an enum can be
maintained, and slicing recall by it is where regressions actually surface.

## Thresholds

`thresholds.json` gates three slice kinds — `region`, `category` and `type` —
and every printed slice is checked against its section. Category matters most:
overall recall can hold steady while one lure family collapses, so gating only
by region would let that ship.

**The `fpr` gates are set where the engine currently measures (0.3), not where
they should be (0.02).** That gap is deliberate and worth understanding. A
consumer scam checker that flags one benign message in four burns trust fast, so
2% is the real target. But gating at the target today leaves the eval
permanently red, which makes the baseline ratchet unusable and trains everyone
to ignore the exit code. Holding the line at today's behaviour keeps the ratchet
sharp: any drift worse than now fails, and every false positive is still printed
by name on each run. Tighten toward `_fpr_target` as the `suspicious` tier is
tuned — the sensitivity table above shows that tier carries all of them.

## Known limits

- **The seed corpus is tiny (45 cases) and mostly handwritten.** Its numbers are
  a smoke test, not a measurement. The thresholds in `thresholds.json` are
  placeholders until the corpus is large enough to support them.
- **Hand-labelled corpora inherit the labeller's blind spots.** This is good for
  catching regressions and close to useless for discovering novel lure types. A
  recall figure means "against scams we already thought to collect".
- **Labels can be wrong.** One seed case was mislabelled benign by the author and
  caught on the first run: an AusPost SMS containing a link, which the AU pack
  correctly scores as a scam under the post-2024 no-link policy. It is kept as
  `au-sms-0013` because it is a good hard case.
- **AU false-positive rate is ~27%, and the gate reflects that rather than
  hiding it.** Four of the five incorrect commitments on the seed corpus are
  bare agency mentions with no scam signal ("Your myGov Inbox has a new
  message", a Medicare appointment confirmation), all scoring 25-40 in the
  `suspicious` tier. Whether that caution is right is a product decision the
  eval surfaces rather than settles.
