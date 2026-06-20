// Cloudflare Email Worker for the forward-to-us flow.
//
// Flow: a user forwards a suspicious email to check@<domain> → Cloudflare Email
// Routing invokes this Worker's email() handler → we stream the raw RFC822,
// POST it to the Next app's /api/inbound (which analyses in memory and returns
// a plain-English verdict) → we reply to the forwarder with that verdict.
//
// Why reply via message.reply() rather than a fresh send: replying to the
// inbound message is the one outbound path Cloudflare allows without verifying
// each destination, and it can ONLY go back to the original sender. That makes
// abusing us as an open relay impossible — we can email the forwarder and no
// one else. (We still rate-limit per sender on the API side as defence depth.)

import { EmailMessage } from "cloudflare:email";
import { buildReplyMime } from "./reply";

export interface Env {
  // Set via `wrangler secret put` — must match the Next app's INBOUND_SECRET.
  INBOUND_SECRET: string;
  // Full URL of the Next webhook, e.g. https://justcheckingmate.com/api/inbound
  INBOUND_WEBHOOK_URL: string;
}

const MAX_RAW_BYTES = 1_000_000; // drop anything larger before calling the API

interface VerdictReply {
  ok: boolean;
  skip?: string;
  source?: string;
  reply?: { subject: string; text: string; html: string };
}

async function streamToString(stream: ReadableStream, maxBytes: number): Promise<string | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      reader.cancel();
      return null; // too large — bail
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(merged);
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await streamToString(message.raw, MAX_RAW_BYTES);
    if (!raw) return; // oversized or unreadable — silently drop

    let data: VerdictReply;
    try {
      const res = await fetch(env.INBOUND_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-inbound-secret": env.INBOUND_SECRET,
        },
        body: JSON.stringify({ raw, from: message.from, to: message.to }),
      });
      data = (await res.json()) as VerdictReply;
    } catch {
      return; // webhook unreachable — drop rather than bounce
    }

    // No reply means the API skipped (rate-limited, empty, error) — send nothing.
    if (!data.reply) return;

    // Build a reply addressed back to the forwarder. message.reply() restricts
    // the recipient to the original sender, so this can't be redirected; the
    // From is the receiving address so Cloudflare DKIM-signs it for that domain.
    const mime = buildReplyMime(data.reply, {
      from: message.to,
      to: message.from,
      messageId: message.headers.get("Message-ID"),
      references: message.headers.get("References"),
    });

    try {
      await message.reply(new EmailMessage(message.to, message.from, mime));
    } catch (err) {
      // Cloudflare rejects the reply when the incoming forward itself failed
      // DMARC (a documented constraint) — we can't reply on that transaction.
      // Log it so this isn't a silent black hole; there's nothing else to do
      // on the inbound transaction.
      console.warn("reply rejected (likely incoming DMARC failure):", err);
    }
  },
};

// Minimal ambient type for the Email Routing handler argument. The full type
// ships with @cloudflare/workers-types; declared here so the file type-checks
// standalone without pulling that into the Next tsconfig.
interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  reply(message: EmailMessage): Promise<void>;
}
