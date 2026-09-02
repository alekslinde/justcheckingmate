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
one is a bug. The eval asserts **aggregate quality** — "recall ≥ 0.90 without
FPR getting worse" — and a red one is a judgement call about a trade someone
made. Keeping them in one suite makes both harder to read, and makes `npm test`
slow and flaky as the corpus grows. `npm test` stays the fast gate; `npm run eval` is
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

### Confidence intervals

Every rate is printed with a 95% Wilson interval and the denominator it came
from. This is not decoration: at corpus sizes in the tens the sampling error
dwarfs the differences the thresholds try to police.

```
recall    96.0%   95% CI [80.5, 99.3]  n=  25   ±9pp
FPR       23.5%   95% CI [9.6, 47.3]   n=  17   ±19pp
```

A recall of 96% that could plausibly be 80% is not a measurement, and the
interval is what makes that impossible to miss. In the slice tables the effect
is starker still — a region with one scam case reports `100.0% [21-100]`, which
reads correctly as "we know nothing about this region".

Wilson rather than the textbook normal approximation because the corpus lives
exactly where the normal one fails: small n and proportions near 0 or 1. At
12/12 the normal interval is [1.0, 1.0] — certainty from twelve observations —
while Wilson gives roughly [0.76, 1.0].

The headline block ends with the widest gated interval and what it supports.
Rough guide, **per slice** rather than per corpus:

| Cases per class | Half-width | Supports |
|---|---|---|
| 45 | ±15pp | Nothing quantitative |
| 150 | ±7pp | Coarse gating |
| 400 | ±4pp | Real thresholds |
| 1000+ | ±2pp | Detecting small regressions |

Gating still compares **point estimates** against the thresholds, and a breach
still fails the run even when the interval is wide — a gate that ignored what it
could not prove would pass everything at small n, which is the opposite of what
a ratchet is for. But a breach whose limit falls inside the interval is marked
`inconclusive` and says so in the output, which tells you whether to investigate
the detector or add cases to that slice.

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

### Using real reports

No extra consent field is needed, and an earlier draft of this file was wrong to
call one a prerequisite. Submitters are already told at submission time that
their report helps protect others (`report.valuable`), and the submissions feed
publishes reports openly as "unverified, anonymised" (`subs.subtitle`). Internal
regression testing is a narrower use than the publication they have already been
told about, so it is covered.

What does differ from the public feed is **retention shape**, and that is what
the rules above are for. A feed row can be deleted; a corpus case is in git
history, effectively permanently. And unlike the feed — where
`app/api/report/route.ts` runs `scrubPii` over everything with no exceptions —
the corpus deliberately preserves declared identifiers, because
`emailHeaders.ts` scores on the sender pair. That is defensible for a scammer's
address and never for a victim's, which is precisely what the per-token
declaration gate enforces.

So when drawing cases from real reports:

- Keep `source: "report:<id>"`. Provenance is what makes a case auditable later,
  and removable if a submitter ever asks.
- Declare only the **scammer's** identifiers. If a victim's address or number is
  in the content, remove it — never declare it to quiet the error.
- Remember that removal means rewriting git history, not deleting a row. Treat
  adding a case as a durable decision.

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
  a smoke test, not a measurement — the widest gated interval is ±19pp, and the
  run says so on every invocation. The thresholds in `thresholds.json` are
  placeholders until the corpus is large enough to support them.
- **Intervals describe sampling error only.** They assume cases are drawn
  independently from the population being measured, and the seed corpus is
  hand-picked rather than sampled — so the true uncertainty is *wider* than the
  interval, by an amount nothing here can estimate. Mechanical sampling from
  real reports is what would make the interval mean what it says.
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

---

# Metamorphic eval

```bash
npm run eval:metamorphic                       # all relations
npm run eval:metamorphic -- --list             # what the transforms do
npm run eval:metamorphic -- --only=zero-width  # one transform
npm run eval:metamorphic -- --json             # machine-readable
```

## Why it exists alongside the corpus eval

The corpus eval asks "how often is the engine right", which needs labels and is
capped by how many exist — currently tens of cases, with the confidence
intervals above. The metamorphic eval asks a question needing no labels at all:
**is the engine self-consistent?**

A metamorphic relation says how a verdict must respond to a transformation,
without knowing the right answer for either side. `0412 345 678` and
`+61 412 345 678` are the same number, so they must score the same — whatever
that score is. When they don't, that difference is a bug, and nobody had to
label anything to find it.

This matters most exactly where the corpus is weakest. Nine benign cases cannot
measure a false-positive rate, but every case can be *transformed*, so each
relation multiplies the existing corpus into hundreds of checks. It also probes
the surface an evader actually attacks: a scammer does not write new scams to
beat a detector, they rewrite the one they have until it slips through — which
is precisely a metamorphic transformation.

## The two relations

| Relation | Meaning | Example |
|---|---|---|
| `equal` | Meaning-preserving. Any verdict change is a bug. | Reformatting a phone number, recasing a hostname |
| `noWeaker` | Obfuscation. Scoring *higher* is fine; scoring lower means the trick worked. | Zero-width spaces, homoglyphs, padding |

`noWeaker` is not laziness. Several packs treat obfuscation as a signal in its
own right, so asserting equality there would file every correct penalty as a
failure and train everyone to ignore the output.

Both are judged on the **verdict**, not the score. The score is internal and
moves for legitimate reasons; the verdict is what the product asserts.

## Reading a run

There is no threshold to tune and no baseline to ratchet. A violation is a
self-inconsistency, which is a bug rather than a trade someone chose — so the
exit code is simply non-zero when any relation breaks.

A transform marked `(never applied)` is **not** passing: it means no case in the
corpus exercised it, and that is a corpus gap worth filling. `phone-e164` and
`fullwidth-digits` currently read this way because the corpus holds no
`type: "phone"` case and no AU-format number at all, while `phoneIntel.ts` is
the second-largest module in the engine.

## Known open violation

`benign-padding` on `au-sms-0010` is currently red, and deliberately left so.

The family-impersonation gate requires the relation term to *open* the message
("Hi Mum, …"), which is what stops "I'll ask mum about the weekend" from
matching. Prepending prose moves the opener out of that position and the gate
stops firing. A trailing suffix and a `>` quote marker are both tolerated; a
`---------- Forwarded message ----------` header is not — and forwarding is
exactly how someone asks "is this real?".

That is a real gap, but closing it is a judgement call rather than a mechanical
fix: the anchor exists to prevent a specific false positive the rule's comment
names ("Mum, don't forget to pay the school fees of 250 before Friday"), which
would call a parent's own child a scammer. Widening it needs a decision about
how much prefix to skip and evidence it does not reopen that case. Left red so
the run keeps asking.

## What a violation is not

Proof the original verdict was correct. These relations police consistency, not
accuracy: a relation holding across a transformation of a case the engine
already scores wrongly keeps it wrong. The corpus eval says whether the engine
is right; this says whether it can be talked out of it.
