# Inbound Email Worker

Receives forwarded suspicious emails at `check@<domain>`, sends the raw message
to the Next app's `/api/inbound` for analysis, and replies to the forwarder with
a plain-English verdict.

```
forward ─▶ Cloudflare Email Routing ─▶ this Worker ─▶ POST /api/inbound
                                                  ◀─ { reply: {subject,text,html} }
        ◀──────────── reply to the forwarder (message.reply) ◀──────────
```

The raw email is **never stored**. The Worker streams it to the API, which
analyses it in memory and returns a verdict; nothing is persisted but an
anonymous counter. Replies can only go back to the original sender, so the
Worker cannot be abused as an open relay.

## Deployment model

Two **independent** deploy targets — neither deploys the other:

| | Next app (`/`) | This Worker (`workers/inbound-email/`) |
| --- | --- | --- |
| Host | **Vercel** (git push → build) | **Cloudflare** (`wrangler deploy`) |
| `/api/inbound` lives here | ✅ | — |
| `INBOUND_SECRET` set as | Vercel env var | GitHub repo secret → pushed on deploy |

The two share one value: **`INBOUND_SECRET` must be identical** on Vercel and on
the Worker, or the webhook 401s every call.

## Go-live runbook (one-time)

Do these in order. Steps 0–1 are the prerequisites people miss.

0. **Domain DNS must be on Cloudflare.** Cloudflare Email Routing can only add MX
   records if Cloudflare is the domain's DNS provider. If `justcheckingmate.com`
   currently resolves through Vercel/your registrar, move the domain's
   nameservers to Cloudflare first (Vercel still serves the site via its records;
   only DNS hosting moves). **Nothing below works until this is done.**

1. **Enable Email Routing.** Cloudflare dashboard → the domain → Email → Email
   Routing → enable. This auto-adds the **MX** and **SPF (TXT)** records. Then go
   to its DNS/authentication settings and **publish the DKIM and DMARC records it
   offers** — these are what make the verdict reply pass authentication and reach
   the inbox (see *Deliverability* below). Verify all records are live.

2. **Pick the shared secret.** Generate one (`openssl rand -hex 32`). You'll set
   the same value in two places (steps 3 and 5).

3. **Set it on Vercel.** Project → Settings → Environment Variables →
   `INBOUND_SECRET` = the value from step 2. Also confirm the app is deployed
   with `/api/inbound` live (this branch merged to `main`). Vercel bakes env vars
   at build time, so **redeploy** after adding it.

4. **Point the webhook at the app.** `wrangler.toml` → `INBOUND_WEBHOOK_URL`
   should be your deployed app's `/api/inbound` (default:
   `https://justcheckingmate.com/api/inbound`).

5. **Deploy the Worker** — either path sets the secret on the Worker:

   - **CI (recommended):** add three GitHub repo secrets — `CLOUDFLARE_API_TOKEN`
     (a token scoped to *Edit Workers*), `CLOUDFLARE_ACCOUNT_ID`, and
     `INBOUND_SECRET` (same value as step 3). Push to `main`; the
     [deploy-inbound-worker workflow](../../.github/workflows/deploy-inbound-worker.yml)
     deploys and pushes the secret automatically. Or run it manually from the
     Actions tab (**Run workflow**).
   - **Manual:**
     ```sh
     npm ci
     npx wrangler secret put INBOUND_SECRET   # paste the step-2 value
     npm run deploy
     ```

6. **Bind the address.** Email Routing → Routing rules → add a custom address
   `check@justcheckingmate.com` → action **Send to a Worker → jcm-inbound-email**.

7. **Verify end-to-end.** Forward a known scam email to `check@<domain>` from a
   normal account (Gmail/iCloud). Within a few seconds you should get a threaded
   verdict reply **in the inbox** (not spam — if it's spam, recheck step 1's
   DKIM/DMARC records). Also forward a clean email and confirm the "no tracking"
   reassurance reads correctly.

8. **Flip the UI flag.** Only once step 7 passes: set
   `NEXT_PUBLIC_INBOUND_ENABLED=true` on Vercel and redeploy, so the
   "forward it to us" address is shown to users. Never advertise a dead inbox.

### Rotating the secret later

Change it in **both** GitHub repo secrets (re-run the workflow) **and** the
Vercel env var (redeploy). If only one side changes, inbound mail 401s until both
match — so do them close together.

## Deliverability — keeping the reply out of spam

The verdict reply is sent with `message.reply()` on the same SMTP transaction the
forward arrived on. That path is inherently more trusted than a cold send, but
mailbox providers still judge it on authentication. To land in the inbox:

1. **Publish the SPF, DKIM and DMARC records** Cloudflare gives you in the Email
   Routing dashboard for the receiving domain. Cloudflare **DKIM-signs the reply
   automatically** with that domain's key — we do not sign anything in code — so
   these records are what make the signature verify. Without them the reply is
   unauthenticated and Gmail/Outlook/Yahoo will filter it.
2. **From alignment is handled in code:** the reply's `From` is the address that
   received the mail (`check@<domain>`), because Cloudflare requires the reply's
   sender domain to match the receiving domain. `buildReplyMime` sets this.
3. **Threading + automated-reply hints** also help: the reply carries
   `In-Reply-To`, a preserved `References` chain, and `Auto-Submitted:
   auto-replied`, so it reads as a genuine threaded reply, not an unsolicited
   send, and won't bounce-loop with other auto-responders.

### The one case where NO reply is sent

Cloudflare's documented constraint: **the incoming forward must itself have a
valid DMARC result for `message.reply()` to be allowed.** If a user forwards from
a provider/path that fails DMARC, Cloudflare refuses the reply and `reply()`
throws — the Worker logs this (`console.warn`) rather than failing silently.
Most consumer providers (Gmail/Outlook/iCloud) pass DMARC on forwards, so this is
an edge case, but it means a small fraction of forwards will get no reply. If that
becomes common, the fallback is to send a fresh (non-reply) message via Cloudflare
Email Service / a transactional provider instead of `message.reply()`.

## Local development

```sh
npm install
npm test          # node:test — unit-tests the reply MIME builder (src/reply.ts)
npm run dev       # wrangler dev — replay a fixture against the email() handler
npm run typecheck
```

`npm test` covers the only non-Cloudflare logic in the Worker (building the reply
MIME: From alignment, threading headers, multipart body). The `message.raw` read
and `message.reply()` send only run inside Cloudflare's email runtime — exercise
those with `wrangler dev` (it can simulate an inbound message) pointing
`INBOUND_WEBHOOK_URL` at a local tunnel or a staging deploy of the Next app.

## Notes

- `MAX_RAW_BYTES` (1 MB) drops oversized messages before calling the API; the
  API enforces the same cap as defence in depth.
- Per-sender rate limiting lives in the API (`/api/inbound`), so a flood of
  forwards from one address stops generating replies.
- The verdict copy is English-only for now (the email channel has no locale).
