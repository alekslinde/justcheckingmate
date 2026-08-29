# `@justcheckingmate/engine`

The rule-based scam detection engine, extracted so it can be bundled into
clients that are not the Next.js app — the WebExtension first (roadmap Phase
2b), bots after that.

## What makes it portable

Two invariants, both asserted by tests rather than left to convention:

- **No framework imports.** Nothing in the closure imports `next` or anything
  under `next/`. Guarded by `__tests__/engineDependencies.test.ts`.
- **No ambient network access.** The engine never reaches for a global `fetch`.
  Network capability is injected by the caller, so a client that supplies
  nothing gets an engine that cannot make a request. Guarded behaviourally by
  `__tests__/privacyInvariant.test.ts` and at lint level by
  `__tests__/engineNetworkImports.test.ts`.

The second is the one that matters most, and the reason is privacy rather than
tidiness. `urlExpander` issues a HEAD request to a shortener to resolve a link.
Server-side that request comes from our infrastructure. The identical code
bundled into a browser extension would issue it from the user's browser, so the
shortener would learn the home IP of someone who found a link suspicious enough
to check. Making transport an argument forces every client to decide
deliberately: the web app passes `fetch`, and a bundled client either routes
expansion through the API or ships without it.

## Two modules a bundled client must think about

| Module | Why it needs a decision |
|---|---|
| `urlExpander` | Needs a transport. A bundled client must route through the API or go without — see above. |
| `urlhausBlocklist` | **Not in this package.** It fetches a remote blocklist, so it stays app-side. `checkUrl` and friends take the blocklist as an argument; a client that has none passes an empty set and gets a verdict computed without it. |

`urlhausBlocklist` staying out is deliberate. Bundling it would put a network
call inside a package whose whole claim is that it makes none. The cost is that
a bundled verdict and a server verdict can differ, which is a real product
question — recorded in the roadmap rather than settled here.

## Layout

```
src/
  scamDetector.ts     ← the scorer and the public check* / analyzeContent API
  detectType.ts       ← input classification
  engineTypes.ts      ← shared value types (breaks the scorer ↔ detectType cycle)
  urlSanitizer.ts     ← defanging, refanging, tracking-param stripping
  emailHeaders.ts     ← header parsing and SPF/DKIM/DMARC summarising
  phoneIntel.ts       ← number intelligence (the one external dep)
  urlExpander.ts      ← shortener resolution, transport injected
  regions/            ← per-country signal packs (data, never logic)
```

Region packs are **data**: keyword lists, allowlists, copy. The scoring logic is
shared across every region and lives in `scamDetector.ts`. Anything universal
belongs in `regions/base.ts` so a new region inherits it for free.

## Dependencies

One: `libphonenumber-js`. Keeping it that way is a feature — every dependency
here ships in every client.
