# Just Checking, Mate 🦘

Australia's no-nonsense scam detector. Paste a dodgy link, suspicious text message, phishing email, or scam phone number and get an instant verdict — no account required, no data sold.

Built specifically for Australians, with knowledge of local government domains, banks, phone number formats, and the scams that are actually doing the rounds here.

---

## What it does

### Scam Checker
Paste in whatever looks sus and get back a verdict (safe / suspicious / likely scam) plus a plain-English breakdown of every red flag found.

Supports six input types:
- **Dodgy Link** — checks the URL against known scam patterns: URL shorteners, suspicious TLDs, IP-address hosting, typosquatted AU brands, phishing keywords
- **Scam SMS** — detects urgency language, reward bait, requests for sensitive info, embedded dodgy links, gov agency impersonation. Can also **upload a screenshot** and extract the text automatically (OCR via Tesseract.js)
- **Phishing Email** — all SMS checks plus sender domain analysis, generic greetings, attachment prompts
- **Scam Phone Number** — checks for AU premium-rate numbers (190x), spoofed sequential patterns, risky international prefixes
- **Dodgy QR Code** — upload a QR code image and it'll decode the URL, then run the same URL checks
- **Something Else** — free-text fallback that runs all signals

### Report a Scam
Seen something dodgy? Lodge a report so others can be warned. Submissions are protected against bots with rate limiting, a honeypot field, timing checks, and duplicate detection. Reports that score too low on our own detector (i.e. the content looks legit) are flagged for review rather than published.

### Poison Data Generator
If a scammer is trying to harvest your details, feed them garbage instead. Generates fake but plausible Australian personal data — name, address, TFN, Medicare number, BSB, credit card (Luhn-valid but fake), the lot. Pollutes their database and wastes their time.

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

---

## Tech stack

- [Next.js](https://nextjs.org) (App Router)
- TypeScript + Tailwind CSS
- [jsQR](https://github.com/cozmo/jsQR) — client-side QR code decoding
- [Tesseract.js](https://tesseract.projectnaptha.com) — client-side OCR for screenshot uploads
- No external scam database — all detection logic is in [`lib/scamDetector.ts`](lib/scamDetector.ts)

---

## Detection logic

All scam detection is rule-based and runs entirely in [`lib/scamDetector.ts`](lib/scamDetector.ts). It uses keyword lists, domain allowlists/denylists, regex patterns, and a weighted scoring system. No machine learning, no external API calls, no data sent anywhere for analysis.

Because the logic is heuristic and transparent, it's intentionally open source — obscuring the keyword lists doesn't protect against sophisticated scammers (who already know what triggers spam filters), but it does make it harder for the community to contribute improvements.

---

## Disclaimer

This tool gives a best-effort check — it does not guarantee 100% detection of every scam, and scammers constantly change their tactics. **Never rely solely on this tool.** When in doubt: don't click, don't call back, don't share.

For authoritative reporting:
- [Scamwatch (ACCC)](https://www.scamwatch.gov.au)
- [ReportCyber (ASD)](https://www.cyber.gov.au/report)
- [IDCARE (identity theft)](https://www.idcare.org)
