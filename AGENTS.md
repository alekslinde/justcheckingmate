# Agent guide — Just Checking, Mate

Australian scam/phishing/impersonation detector. Next.js (App Router) + React 19, TypeScript, Tailwind v4, Vitest. Detection is hardcoded pattern/heuristic logic, **not** an LLM.

## Stack notes

- **Next.js 15.5** (App Router). This is newer than most training data — APIs, conventions, and file structure may differ. Check the [official Next.js docs](https://nextjs.org/docs) when unsure rather than assuming older behaviour, and heed deprecation notices.
- **React 19**, **Tailwind CSS v4**, **TypeScript** (strict), **Vitest** for tests.
- Lints are standard Next 15.5 + strict React-hooks rules.

## Where things live

- Detection logic: `lib/` — `scamDetector.ts` (URL/SMS/email/free-text signals), `phoneIntel.ts` (AU phone intelligence), `urlSanitizer.ts`, `urlhausBlocklist.ts`, `emailHeaders.ts`, `emailDistiller.ts`, `forwardedEmail.ts`, `detectType.ts`.
- UI: `components/`, routes under `app/`, i18n strings in `messages/`.
- Tests: `__tests__/`. Run with `npm test`.

## Conventions

- Match the style of surrounding code.
- Detection changes should come with test coverage in `__tests__/`.
- Run `npm test` and `npm run lint` before considering a change done.
