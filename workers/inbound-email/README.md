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
   app's `/api/inbound` (defaults to `https://justcheckingmate.app/api/inbound`).

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

## Local development

```sh
npm install
npm run dev       # wrangler dev — replay a fixture against the email() handler
npm run typecheck
```

`wrangler dev` can simulate an inbound message; point `INBOUND_WEBHOOK_URL` at a
local tunnel or a staging deploy of the Next app to exercise the full path.

## Notes

- `MAX_RAW_BYTES` (1 MB) drops oversized messages before calling the API; the
  API enforces the same cap as defence in depth.
- Per-sender rate limiting lives in the API (`/api/inbound`), so a flood of
  forwards from one address stops generating replies.
- The verdict copy is English-only for now (the email channel has no locale).
