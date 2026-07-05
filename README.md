# Just Checking, Mate 🦘

Australia's no-nonsense scam detector. Paste a dodgy link, suspicious text message, phishing email, or scam phone number and get an instant verdict — no account required, nothing kept, no data sold.

Built specifically for Australians, with knowledge of local government domains, banks, phone number formats, and the scams that are actually doing the rounds here.

---

## What it does

### Scam Checker
Paste in whatever looks sus — a link, a text, a whole email, a phone number, or a screenshot — and get back a verdict (safe / suspicious / likely scam) with a plain-English breakdown of every red flag found.

There's no input-type picker to fuss with. **The app works out what you gave it** and runs the right checks, tagging each thing it finds as a link 🔗, email 📧, phone 📞, or message 💬. Paste a blob with several of these in it and it'll analyse each one.

Under the hood it runs:

- **Links** — checks URLs against a live malware/phishing blocklist ([URLhaus](https://urlhaus.abuse.ch), from abuse.ch), URL-shortener expansion, suspicious TLDs, IP-address hosting, typosquatted AU brands, and phishing keywords.
- **Text messages** — urgency language, reward bait, requests for sensitive info, embedded dodgy links, and government-agency impersonation.
- **Emails** — all the message checks plus sender-domain analysis, generic greetings, and **email authentication** (SPF / DKIM / DMARC) parsed straight from the raw headers. Forwarded emails are unwrapped back to the original scam, and **tracking pixels** are detected and flagged.
- **Phone numbers** — line-type detection (mobile / fixed / VoIP / premium / free-call), AU premium-rate ranges, wangiri (one-ring) and premium-rate country risk, and spoofing-risk notes.

**Screenshots and QR codes:** drop or upload an image and it'll try to decode a QR code first (client-side via jsQR), then fall back to OCR (Tesseract.js) to pull out the text — then run all the checks above on whatever it finds.

**Forward it in:** on your phone? Forward a dodgy email to the app's inbox and it emails you back a straight-up verdict. It's read on arrival and no copy is kept.

### Report a Scam
Seen something dodgy? Lodge a report so others can be warned. Submissions are protected against bots with rate limiting, a honeypot field, timing checks, and duplicate detection. Reports that score too low on our own detector (i.e. the content looks legit) are flagged for review rather than published.

### Learn
A [`/learn`](app/learn/page.tsx) guide covering how to spot scams, how email authentication (SPF/DKIM/DMARC) works, common tactics, what to do if you've been caught, and where to report.

### English or Aussie
A language toggle switches the whole interface between plain **English** and full-noise **Aussie** — same detection, different voice.

---

## Latest submissions

The homepage shows a live feed of the most recent community-reported scams. Contact emails, IP addresses, and any other structured PII are automatically stripped from descriptions before display.

The same data is available as JSON at `GET /api/reports?limit=50` (max 200).

---

## Running locally

```bash
npm install
npm run dev
```

No database setup needed for local dev — the app falls back to a local SQLite file (`local.db`) automatically.

For a persistent database (staging or production), create a free database at [turso.tech](https://turso.tech), then:

```bash
cp .env.local.example .env.local
# fill in TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
```

The schema is created automatically on first run — no migrations to run.

Open [http://localhost:3000](http://localhost:3000).

### Handy commands

```bash
npm test         # run the Vitest suite
npm run lint     # ESLint (Next 15.5 + strict react-hooks rules)
npm run seed     # seed the database with sample reports
npm run build    # production build
```

---

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router) + [React 19](https://react.dev)
- TypeScript (strict) + [Tailwind CSS v4](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for tests
- [libSQL / Turso](https://turso.tech) in prod, local SQLite fallback in dev
- [jsQR](https://github.com/cozmo/jsQR) — client-side QR code decoding
- [Tesseract.js](https://tesseract.projectnaptha.com) — client-side OCR for screenshot uploads
- [URLhaus](https://urlhaus.abuse.ch) (abuse.ch) — live malware/phishing URL blocklist

---

## Detection logic

All scam detection is **rule-based** and runs in [`lib/`](lib/) — chiefly [`scamDetector.ts`](lib/scamDetector.ts), with [`phoneIntel.ts`](lib/phoneIntel.ts), [`emailHeaders.ts`](lib/emailHeaders.ts), [`urlSanitizer.ts`](lib/urlSanitizer.ts), and friends. It uses keyword lists, domain allowlists/denylists, regex patterns, and a weighted scoring system. **No machine learning, no LLM, and no user content sent anywhere for scoring.**

The only outbound calls are to fixed, trusted infrastructure — the URLhaus blocklist (abuse.ch) and HEAD requests to a whitelist of known URL-shortener hosts to expand short links. Neither involves sending the content you paste off-device for analysis.

Because the logic is heuristic and transparent, it's intentionally open source — obscuring the keyword lists wouldn't stop sophisticated scammers (who already know what triggers spam filters), but it would make it harder for the community to contribute improvements.

---

## Disclaimer

This tool gives a best-effort check — it does not guarantee 100% detection of every scam, and scammers constantly change their tactics. **Never rely solely on this tool.** When in doubt: don't click, don't call back, don't share.

For authoritative reporting:
- [Scamwatch (ACCC)](https://www.scamwatch.gov.au)
- [ReportCyber (ASD)](https://www.cyber.gov.au/report)
- [IDCARE (identity theft)](https://www.idcare.org)
