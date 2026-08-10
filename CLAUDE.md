# Just Checking, Mate — Claude Config

> Inherits global values from ~/.claude/CLAUDE.md

---

## Project Context

Australian scam / phishing / impersonation detector. Users paste a dodgy link,
SMS, phishing email, or phone number and get an instant rule-based verdict.
Detection is **hardcoded pattern/heuristic logic, not an LLM** — no ML, no
external analysis APIs, nothing sent off-device for scoring.

**Stack:** Next.js 15.5 (App Router) + React 19, Tailwind CSS v4
**Package manager:** npm
**Primary language:** TypeScript (strict)
**Tests:** Vitest
**DB:** libSQL / Turso in prod; falls back to local SQLite (`local.db`) in dev

---

## Project Structure

```
app/            ← Routes (App Router): page.tsx, about/, learn/, submissions/
  api/          ← Route handlers: check, report, reports, ocr, inbound, bug,
                  stats, feed-stats
components/     ← UI components (check here first) — CheckFlow, ReportForm,
                  VerdictBadge, SubmissionsBrowser, etc.
lib/            ← Core logic. Detection: scamDetector.ts, phoneIntel.ts,
                  urlSanitizer.ts, urlhausBlocklist.ts, urlExpander.ts,
                  detectType.ts. Email: emailHeaders.ts, emailDistiller.ts,
                  forwardedEmail.ts, emailSource.ts, emailTracking.ts.
                  Data: db.ts, reportStore.ts, bugStore.ts. Safety:
                  piiScrubber.ts, submissionGuard.ts. i18n: i18n.ts, lang.tsx.
messages/       ← i18n string bundles
__tests__/      ← Vitest tests (one per lib module)
scripts/        ← seed-db.ts, generate-icons.mjs
workers/        ← inbound-email worker
```

---

## Component & Code Reuse

- Check `components/` before building anything new; extend before creating
- Shared logic lives in `lib/` — check there before writing detection or
  parsing helpers
- New components → `components/ComponentName.tsx`
- Extract logic used in 2+ places into `lib/`

---

## Stack Conventions

- **Detection is rule-based only** — keyword lists, domain allow/denylists,
  regex, weighted scoring. Never introduce an LLM or external analysis API.
- Styling via **Tailwind CSS v4** (utility classes; `app/globals.css`)
- App Router route handlers under `app/api/*/route.ts`
- i18n strings go in `messages/` — don't hardcode user-facing copy
- PII is scrubbed before display/storage — route new user content through
  `piiScrubber.ts`
- **Detection changes must ship with test coverage in `__tests__/`**

---

## Git Scopes

Use these scopes in commit messages:

- `(detector)` — Detection logic in `lib/` (scamDetector, phoneIntel, etc.)
- `(ui)` — Components and screens
- `(api)` — Route handlers under `app/api/`
- `(email)` — Email parsing / inbound / distiller
- `(db)` — Data layer and stores
- `(i18n)` — Strings and language handling
- `(config)` — Config and environment

---

## Off Limits

- Don't weaken PII scrubbing or the submission guard (honeypot, rate limit,
  timing, dedupe) without explicit sign-off — they're abuse defences
- Don't commit `local.db` or `.env.local`

---

## Commands to Know

```bash
npm run dev      ← Start dev server (http://localhost:3000)
npm test         ← Run Vitest tests (run before committing)
npm run lint     ← ESLint (Next 15.5 + strict react-hooks rules)
npm run seed     ← Seed the database
npm run build    ← Production build
```

---

## Notes

- No DB setup needed for local dev — SQLite fallback is automatic.
- Detection logic is intentionally open source: transparency lets the
  community improve it, and obscuring keyword lists wouldn't stop
  sophisticated scammers.
- Next.js 16.3 / React 19 / Tailwind v4 are newer than most training data —
  check the official docs rather than assuming older behaviour.
```

---

## Next.js agent rules

`next dev` maintains a managed block of Next-specific agent rules. It lives in
`AGENTS.md` — Next rewrites that file on version bumps, so treat it as
generated and don't hand-edit it. The import below pulls it into this file so
the rules still load; keep the line so the block stays out of CLAUDE.md.

@AGENTS.md
