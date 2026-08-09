# Threat Intelligence Roadmaps

Periodic research briefs for Just Checking, Mate. Each roadmap surveys new and
evolving scam tactics targeting Australians, then proposes concrete detection
changes to `lib/`.

**Roadmaps are research-and-proposals only. They never modify `lib/`.** The
detection code ships separately, via numbered issues, in its own PR with tests.
That separation is deliberate — it keeps the evidence layer reviewable on its
own terms, and keeps detection PRs small enough to review as code.

---

## Why these are kept

Detection here is hardcoded keyword lists, regexes, and weighted scores — the
kind of code that rots into unexplainable magic strings. These files are the
provenance layer that stops that happening.

1. **Evidence for every rule.** Why is `.monster` worth +30? Why is
   `"quantum ai"` +50? Without a roadmap those are arbitrary. With one,
   `.monster` traces to a CSC DBS >60% abuse-rate finding and `"quantum ai"` to
   a named ASIC warning. For a tool that publicly tells people "this is a scam",
   being able to show the working matters.

2. **Negative results.** The watchlist section is as valuable as the proposals.
   *SIM swap — no text-side signal, existing brand+request detection already
   covers the preparatory SMS.* *LINE/KakaoTalk funnels — insufficient AU
   evidence, FP risk too high.* Recording these stops each cycle
   re-investigating the same threats and reaching the same conclusion. The
   `.shop`/`.store` promotion is the payoff: watchlisted on 2026-07-01 for
   insufficient evidence, promoted on 2026-07-26 once Barracuda and Brandsec
   published. That only works because the deferral was written down.

3. **False-positive discipline.** Every proposal carries an explicit FP-risk
   assessment. It's the guardrail against the obvious failure mode of keyword
   detection — flagging legitimate messages. It demonstrably works: two
   2026-07-26 proposals (D3, D5) were changed during implementation on FP and
   correct-advice grounds.

---

## The Status block convention

A roadmap is written as a forward-looking proposal, so it goes stale the moment
its proposals ship. **Once any proposal from a roadmap lands, add a Status block
directly under the title** and keep it current. Without this, a reader can't
tell a shipped roadmap from a wishlist, and the file gets misread as a
description of how the detector actually behaves.

The block has three parts. See
[`2026-07-26-threat-roadmap.md`](2026-07-26-threat-roadmap.md) for a worked
example.

### 1. A status table — one row per proposal

```markdown
## Status — as at YYYY-MM-DD

| Proposal | Issue | Shipped in | Status |
|---|---|---|---|
| D1 — High-abuse TLDs (`.shop`, `.store`, …) | #101 | #111 | ✅ Shipped |
| D7 — PDF + QR hybrid body signal | #113 | — | ⬜ Outstanding |
```

### 2. Deviations — where the implementation differed from the proposal

Record these, with the reason. They're the most valuable part of the block: a
deviation is usually a proposal that was wrong, and the reason is what stops it
being re-proposed next cycle.

> - **D3** — the foreign-authority terms did *not* go into `govMentions` as
>   proposed. That list emits "verify directly via official channels", which is
>   actively wrong advice for a Chinese police impersonation. They live in a
>   separate `foreignAuthorityMentions` list scored at +35 with its own wording.

### 3. Corrections — where the research itself was wrong

Verify proposals against the live code before shipping, and correct the file
in place (marked, not silently rewritten) when they don't hold up:

> **Correction (2026-08-02):** tested against the live regex, `"scan the QR code
> in the attached PDF…"` is already caught, so that pattern is redundant. Only
> the inverted `"the attachment contains a QR code"` phrasing is a real gap.

**Leave the original research as written.** The Status block is the only part
updated after the fact. The value of the file is what was known and argued at
the time — rewriting it to match the outcome destroys that.

---

## The source registry

[`sources.yml`](sources.yml) is the curated list of sources this research draws
on, tiered by how much weight a claim from each carries: **1** authoritative
(government / regulator), **2** reputable vendor and press, **3** low-trust,
cited once and unvetted.

Research should read **from the registry** rather than from open web search. The
citation census that built it turned up `scamwatchhq.com` — not the ACCC, an
unaffiliated lookalike — cited beside `asic.gov.au` with nothing marking the
difference. Open search will keep finding sites like that. Adding a source is a
deliberate, reviewed act; tier 3 exists so a source that has already been looked
at and found wanting is not silently rediscovered next cycle.

Two conventions matter:

- **`indicators:`** at the bottom of the file is *not* a source list. Those are
  scam domains quoted as evidence in the roadmaps. They are never fetched, and
  the checker fails the run if one is ever moved into a source tier.
- **`retired: true`** marks a source that is known-gone and kept as a record.
  Retired sources are skipped by the checker but stay in the file, because a
  roadmap claim resting on a dead citation is a claim that needs re-sourcing.

`scripts/check-sources.mjs` verifies every source URL still resolves:

```bash
node scripts/check-sources.mjs             # human-readable report
node scripts/check-sources.mjs --validate  # structure only, no network
node scripts/check-sources.mjs --markdown  # issue-body format
```

[`.github/workflows/source-check.yml`](../../.github/workflows/source-check.yml)
runs it weekly (Tuesday ~07:00 AEST) and refreshes a single
**🔗 Threat-intel source check** issue. It checks *reachability only* — whether a
source has published anything new is research, not a cron job. It flags; it never
edits the registry.

Link rot is the quiet failure here. When a citation 404s, the evidence for a
hardcoded score in `lib/` is gone and only the magic number is left — the exact
decay the archive exists to prevent.

---

## Workflow

1. Branch `threat-intel/YYYY-MM-DD`, write the roadmap, open a docs PR.
2. Open one issue per HIGH-priority proposal, tagged `[threat-intel]`, each
   linking back to the roadmap file and its D-number.
3. Implement in a **separate** PR, with tests in `__tests__/` — detection
   changes must ship with coverage.
4. Add or update the Status block on the roadmap, then **merge the docs PR**.

Step 4 is the one that gets skipped. See below.

---

## Known gaps in this archive

**The 2026-07-05 and 2026-07-12 roadmaps are missing.** Their detection code
shipped to main (issues #73–#85, implemented in #87), but both docs PRs (#79,
#86) were closed unmerged, so the research files never landed. Thirteen shipped
detection rules currently have no evidence trail on main. The files still exist
on `origin/threat-intel/2026-07-05` and `origin/threat-intel/2026-07-12` and
could be recovered.

This is exactly the failure the Status-block convention is meant to prevent:
the code shipped, the research was treated as disposable once it had served its
purpose, and the provenance was lost. **Merge the docs PR — it is not
optional.**

The 2026-06-21 and 2026-07-01 roadmaps predate this convention and have no
Status block. Their header notes record implementation status in prose
("all D1–D17 from that run are now implemented"), which is weaker but adequate;
they have not been backfilled.
