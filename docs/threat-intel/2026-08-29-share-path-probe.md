# Adversarial probe — 2026-08-29

*Target: the share-target ingestion path — `lib/sharePrefill.ts` and
`extractBareHosts` in `lib/scamDetector.ts`. Second run of this document type,
same day as the first — the share target shipped that morning, so the surface
was new rather than the cadence being due.*

---

## Status — as at 2026-08-29

| Finding | Severity | Shipped in | Status |
|---|---|---|---|
| P4 — Sentence-break guard blind to a lowercase new sentence | **HIGH** | — | ⬜ Outstanding |
| P5 — Prose-left guard is a closed list with common words missing | **HIGH** | — | ⬜ Outstanding |

Both are **false-positive** findings. Neither hides a scam; both put a
"suspicious" scam card on entirely innocent messages.

---

## Why this target

Phase 2a shipped the PWA share target on 2026-08-29 (#215). The engine now
receives **arbitrary selected text from any app** rather than something a user
deliberately pasted into a check box, and the ecosystem roadmap flags that as an
adversarial-input surface rather than a convenience wrapper.

The previous probe ([`2026-08-29-adversarial-probe.md`](2026-08-29-adversarial-probe.md),
earlier the same day) targeted the email path only — `urlSanitizer`,
`emailHeaders`, `forwardedEmail`. The share ingestion path had never been
probed. It is also the newest input surface, and the least constrained: shared
text skews toward **prose with a hostname-shaped token somewhere in it**, which
is precisely the shape that produced the four bare-host false positives fixed on
2026-08-29 (`720174f`, `1f45a1a`, `6b0e6ce`).

That fix class turns out **not to be exhausted.** Nine of eleven probe
phrasings raised a scam card on innocent text.

---

## `lib/sharePrefill.ts` — held up

Recorded so the next run does not re-test it. Every attack tried against the
share payload builder failed, and the module is in good shape:

- **Field confusion** — `title` is correctly dropped when `text` or `url` is
  present, so a crafted page title cannot inject scoring words into a shared
  message.
- **URL budget starvation** — a 5,000-character `text` cannot crowd out the
  `url`; the url's budget is reserved first, and truncation is disclosed rather
  than silent.
- **Prefix-collision de-duplication** — `containsUrl` correctly distinguishes
  `https://evil.tk/pay` from `https://evil.tk/pay-now`, so the shared link is
  never dropped as "already present" when it is a different, longer URL.

The defects are one layer down, in what the engine does with the assembled
string.

---

## P4 — Sentence-break guard is blind to a lowercase new sentence (HIGH)

**Target:** `extractBareHosts`, `lib/scamDetector.ts`

A missing space after a full stop synthesises a hostname from two unrelated
sentences. This is the `hospital.ICU` class fixed on 2026-08-29. The guard that
shipped:

```js
const rawTld = hostname.slice(hostname.lastIndexOf(".") + 1);
if (/^[A-Z][a-z]/.test(rawTld)) continue;
```

The tell is **Capitalised-Then-Lowercase** on the last label — a new sentence's
first word. That reasoning is sound and the guard works for what it tests. But
it only fires when the next sentence is **capitalised**, and in pasted SMS and
chat messages it very often is not.

**Measured against the live detector:**

| Input | Score | Verdict |
|---|---|---|
| `Running late sorry.Work meeting overran` | 0 | safe ✅ *guard fires* |
| `i finished early.live music starts at 8` | **30** | **suspicious** ❌ |
| `thanks for lunch.top effort mate` | **30** | **suspicious** ❌ |
| `SEE YOU AT THE SHOP.ONLINE ORDERS ARE OPEN` | **30** | **suspicious** ❌ |

The all-caps row is the awkward one, and it is why this cannot be fixed by
loosening the regex to "starts uppercase". The existing comment states the
constraint plainly: scam SMS shout in full caps (`AUSPOST-TRACK.SHOP/verify`),
so an all-uppercase label **must** still be treated as a host. Any fix has to
separate "shouty scam host" from "shouty innocent sentence" on something other
than case alone.

**FP risk of the current behaviour: realised, not theoretical.** Lowercase
sentence starts are ordinary in the exact medium the share sheet draws from.

---

## P5 — Prose-left guard is a closed list, and common words are missing (HIGH)

**Target:** `PROSE_LEFT_LABELS`, `lib/scamDetector.ts`

The companion guard skips a bare two-label host when the **left** label is an
English function word — `in.live`, `or.online`. It is deliberately a closed
list, and the reasoning for keeping it small is good: `a.tk` and `b.tk` are
valid hosts, so "short" cannot mean "prose", and a longer list risks silencing a
real host.

But the list holds function words only — articles, prepositions, pronouns,
auxiliaries. Ordinary sentences routinely end on a **content** word before the
full stop, and those are not in it:

| Input | Left label | In list? | Score | Verdict |
|---|---|---|---|---|
| `the plumber came by.work is done` | `by` | ✅ yes | 0 | safe |
| `sign up here.online registration closes friday` | `here` | ❌ no | **30** | **suspicious** |
| `give me a call back.live chat is down` | `back` | ❌ no | **30** | **suspicious** |
| `order now.store closes at five` | `now` | ❌ no | **30** | **suspicious** |
| `check it out.click for the menu` | `out` | ❌ no | **30** | **suspicious** |
| `that is all.work starts monday` | `all` | ❌ no | **30** | **suspicious** |
| `sleeping well.online classes resume` | `well` | ❌ no | **30** | **suspicious** |

`here`, `back`, `now`, `out`, `all`, `well` are among the most common words in
conversational English, and each sits naturally at a sentence end.

**A second gap in the same guard:** it only applies when
`labels.length === 2`, so a three-label form walks straight past it —
`ask at the front desk.work is ongoing` → `desk.work`, 30/suspicious.

**Extending the word list is not the fix.** Enumerating conversational English
is unbounded, and every addition permanently silences a real host with that
label. The list treats a symptom of P4: these are all sentence breaks, and the
left label only matters because the *right* side was not recognised as a new
sentence. Fixing P4 properly would subsume most of P5.

---

## Why both matter more than a missed scam

The roadmap already states the asymmetry, and this probe is the evidence for it:

> A missed scam disappoints one user; a scam card on *"Mum's in hospital.ICU"*
> teaches them the verdicts are noise, and that lesson travels with them to
> every other surface.

Nine of eleven innocent phrasings scored `suspicious`. A user who shares two or
three ordinary messages and gets a scare card each time learns the tool cries
wolf — and that lesson is not surface-local. It is also self-reinforcing on the
share sheet specifically, because sharing is *low-effort*: the cost of trying it
on something innocuous is near zero, so innocuous input is exactly what it will
mostly receive.

---

## Held up — attacks that failed

Recorded so the next probe does not re-test this ground.

- **Real scam hosts still fire.** `AUSPOST-TRACK.SHOP/verify` (40/suspicious),
  `freemoney.tk` (30/suspicious), `www.evil.work` (30/suspicious). Whatever
  fixes P4/P5 must keep all three, and they belong in the regression tests.
- **Single-letter sentence starts are safe.** `the meeting ran late.i will call`
  → 0. `i` is in `PROSE_LEFT_LABELS`… on the *left*; here it is the TLD, and the
  `[a-z]{2,24}` TLD floor excludes it.
- **`.bond` / `.xin` / `.icu` / `.zip` / `.mov` bare forms hold.**
  `AMBIGUOUS_BARE_TLDS` requires corroboration for these, and
  `Deal fell through.Bond returned in full` → 0/safe. The 2026-08-29 fix
  (`6b0e6ce`) is doing its job; P4 and P5 are about the *other* word-like TLDs
  that still take the no-corroboration shortcut.
- **Share payload assembly** — see *held up* above.

---

## Proposed direction (not a fix — implementation is a separate PR)

Per the README convention, this document proposes and does not modify `lib/`.

The two findings share a root cause: **`extractBareHosts` decides sentence-break
versus hostname using only the shape of the two labels**, and at that scope
there is not enough information. Both guards are local patches on a
context-shaped problem — one reads the right label's case, the other consults a
word list for the left.

A more durable signal is that a bare host **spanning a sentence break has
whitespace-delimited prose either side of it and no other host-like structure**,
whereas a real bare host in a scam SMS is typically the message's payload —
surrounded by call-to-action vocabulary, or the only token of its kind. Worth
evaluating against the 18 phrasings from the 2026-08-29 finding plus the 11
here, and against the three regression cases above.

Whatever the mechanism: per *Working rules*, verify it by **injecting the defect
it guards against and confirming the failure**. A green suite is not evidence —
three of the four mechanisms in this cycle passed their tests while guaranteeing
nothing, and the fourth asserted the wrong semantics as correct.
