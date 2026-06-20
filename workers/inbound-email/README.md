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

## One-time setup (Cloudflare dashboard + CLI)

1. **DNS / Email Routing.** In the Cloudflare dashboard for the domain:
   Email → Email Routing → enable it. This adds the required **MX** and **TXT
   (SPF)** records automatically. Verify they're live.

2. **Secret.** Generate a shared secret and set it on both sides — it must match
   `INBOUND_SECRET` in the Next app's environment:
   ```sh
   wrangler secret put INBOUND_SECRET   # paste the same value used by the app
   ```

3. **Webhook URL.** Edit `wrangler.toml` → `INBOUND_WEBHOOK_URL` to your deployed
   app's `/api/inbound` (defaults to `https://justcheckingmate.com/api/inbound`).

4. **Deploy.**
   ```sh
   npm install
   npm run deploy
   ```

5. **Bind the address.** In Email Routing → Routing rules, add a custom address
   `check@<domain>` and set its action to **Send to a Worker → jcm-inbound-email**.

6. **Flip the UI flag.** Once mail flows end-to-end, set
   `NEXT_PUBLIC_INBOUND_ENABLED=true` in the Next app so the address is shown to
   users. Leave it unset until then — never advertise a dead inbox.

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
