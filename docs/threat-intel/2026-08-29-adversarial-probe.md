# Adversarial probe — 2026-08-29

*Targets: `lib/urlSanitizer.ts`, `lib/emailHeaders.ts`. First run of this
document type.*

---

## Status — as at 2026-08-29

| Finding | Severity | Shipped in | Status |
|---|---|---|---|
| P1 — Display-name address masking | **HIGH** | #210 | ✅ Shipped |
| P2 — Trailing-dot FQDN bypass | MEDIUM | #209 | ✅ Shipped |

---

## What this document is

A **probe** is the inward-looking counterpart to a threat-intel sweep. A sweep
asks *"what are scammers doing that we don't detect?"* and answers it from
sourced advisories. A probe asks *"can our existing rules be evaded?"* and
answers it by attacking them.

The output shape is the same — numbered findings, evidence, FP-risk assessment,
a status block — and it follows the same workflow (research doc, then a separate
implementation PR with tests). Two differences:

- **No external sources.** The evidence is a reproduction, not a citation. Every
  finding below states the score before and after, measured against the live
  detector.
- **Negative results are the bulk of the value.** A sweep's watchlist records
  threats deferred; a probe's records attacks that *failed*, so the next run
  doesn't re-test the same ground. See "Held up" below.

**Why bother.** Three false positives were found in two days simply by making
the verdict email explain its reasoning (#204). That suggested the detector had
had less adversarial attention than the roadmap assumed. This is the deliberate
version of that accident.

---

## P1 — Display-name address masking (HIGH)

**Target:** `lib/emailHeaders.ts`, `addressIn()`

RFC 5322 puts the real address inside angle brackets; anything before them is a
display name. `addressIn()` took the **first** address anywhere in the header
value, so a display name containing an address won:

```
From: "noreply@ato.gov.au" <attacker@evil-bank-support.tk>
```

A mail client renders this as the attacker's address labelled `noreply@ato.gov.au`.
The detector scored it as though it *came from* `ato.gov.au`.

**Measured against the live detector**, with a deliberately unremarkable body
("please confirm your account details when you get a moment"):

| From header | Score | Verdict |
|---|---|---|
| `attacker@evil-bank-support.tk` | 37 | suspicious |
| `"noreply@ato.gov.au" <attacker@evil-bank-support.tk>` | **17** | **safe** |

**The verdict flipped.** A phishing email was reported as safe, and the evasion
costs an attacker nothing — it is a header they already control, and it makes
the message *more* convincing to the human reader at the same time.

A blatant body still scored `likely_scam` (100 → 52), so this hides a marginal
scam rather than an obvious one. That is the harder case to catch and the one a
user is most likely to get wrong unaided.

**Fix:** read the address from inside the angle brackets, falling back to a
whole-value scan for bare addresses. Same rule now applies to `Reply-To`.

**After the fix the masked form scores 100/likely_scam** — *higher* than the
honest form, because `analyseEmailIdentities` independently flags display-name
masking as a spoofing signal. That signal was already there; the parser was
handing it the wrong address.

**FP risk: NONE measurable.** Ordinary mail is unaffected
(`Australia Post <noreply@auspost.com.au>` → unchanged, 7/safe), and all 1379
existing tests passed without modification.

---

## P2 — Trailing-dot FQDN bypass (MEDIUM)

**Target:** `lib/urlSanitizer.ts`, `normaliseForAnalysis()`

`evil.tk.` is a valid absolute-form hostname resolving to the same host as
`evil.tk`, but the dot survives URL parsing into `hostname` and defeats every
`endsWith()` comparison downstream.

It cut both ways, which is what raised it above a curiosity:

| URL | Before | After |
|---|---|---|
| `http://commbank-secure-login.tk./verify` | 70 | **100** |
| `https://ato.gov.au./mytax` | 0, *no flags* | **5 safe** |

A scam evades the suspicious-TLD check, **and** a legitimate government URL
misses the allowlist and scores zero with nothing to show the user.

**Fix:** strip trailing dots in `normaliseForAnalysis`, already the designated
place for closing this class of bypass. Shipped in #209.

---

## Held up — attacks that did not work

Recorded so the next probe doesn't re-test them. All scored against the AU pack.

### URL checker

| Attack | Result |
|---|---|
| `https://ato.gov.au@evil.tk/steal` — userinfo trick | 30 suspicious |
| `https://ato.gov.au:x@evil.tk/` — userinfo with password | 30 suspicious |
| `https://ato.gov.au.evil.tk/steal` — subdomain spoof | 30 suspicious |
| `https://evil.tk/ato.gov.au/steal` — path-only lookalike | 30 suspicious |
| `http://xn--cmmbank-l1a.com.au/login` — punycode homograph | 45 likely scam |
| `http://commbаnk.com.au/login` — Cyrillic homograph | 45 likely scam |
| `http://2130706433/login` — decimal IPv4 | 60 likely scam |
| `http://0x7f000001/login` — hex IPv4 | 60 likely scam |
| `http://[::1]/login` — IPv6 literal | 25 suspicious |
| `http://commbank.com.au%00.evil.tk/` — null byte | 60 suspicious |
| `http://EvIl.Tk/LoGiN` — case mixing | normalised correctly |

Nothing crashed, and nothing read `safe`.

### Header parser

| Attack | Result |
|---|---|
| `From: attacker@evil.tk (noreply@ato.gov.au)` — RFC comment | correct address |
| `From: <attacker@evil.tk> noreply@ato.gov.au` — trailing extra | correct address |
| `From: =?utf-8?B?...?= <attacker@evil.tk>` — encoded word | correct address |
| Duplicate `From:` headers | first wins, documented behaviour |
| Folded continuation lines | unfolded correctly |

---

## Watchlist — not probed this run

| Area | Why deferred |
|---|---|
| `lib/phoneIntel.ts` | Parsing is `libphonenumber-js`, heavily tested upstream. Our own logic is prefix lists and scoring, where an evasion means changing the number itself — which changes where the call goes. Low expected yield. |
| Region packs (`lib/regions/`) | The pack-shadowing guard (#198) and word-boundary fix (#208) already cover the known collision classes. Worth a pass once a new pack is authored. |
| `emailDistiller` / `forwardedEmail` | Untouched this run. Forwarded-mail unwrapping is attacker-influenced and structurally similar to the header parsing that yielded P1 — **the strongest candidate for the next probe.** |
| Multi-part MIME / attachment names | Not currently parsed for scoring, so nothing to evade yet. |

---

## Method

Each probe is a throwaway vitest file calling the real checker with hostile
input and asserting a deliberately wrong value, so the actual score prints in
the failure output. Findings are confirmed by fixing the cause and re-measuring;
every fix ships with a test verified to fail against the unfixed code.

Note for the next run: vitest deduplicates identical assertion failures, so make
each probe's expected value unique or results silently collapse.
