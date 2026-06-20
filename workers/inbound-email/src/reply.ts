// Reply MIME building — pure, no Cloudflare runtime imports, so it can be
// unit-tested under plain Node/vitest. The email() handler in index.ts uses it.

import { createMimeMessage } from "mimetext";

export interface ReplyContent {
  subject: string;
  text: string;
  html: string;
}

// Build the raw MIME for the verdict reply. Deliverability/threading notes:
//   • From = the address that RECEIVED the mail (the inbound `to`). Cloudflare
//     requires the reply's sender domain to match the receiving domain, and
//     DKIM-signs it automatically with that domain's key — so this From
//     alignment is what makes SPF/DKIM/DMARC pass and keeps the reply out of
//     spam. (Publish the SPF/DKIM/DMARC DNS records Cloudflare provides.)
//   • In-Reply-To + References thread the verdict under the user's forward in
//     their client, which also reads as a genuine reply, not a cold send.
//   • Auto-Submitted: auto-replied marks this as an automated response per
//     RFC 3834 so other auto-responders don't bounce-loop with us.
export function buildReplyMime(
  reply: ReplyContent,
  opts: { from: string; to: string; messageId?: string | null; references?: string | null },
  createMime: typeof createMimeMessage = createMimeMessage,
): string {
  const msg = createMime();
  msg.setSender({ name: "Just Checking, Mate", addr: opts.from });
  msg.setRecipient(opts.to);
  msg.setSubject(reply.subject);
  if (opts.messageId) msg.setHeader("In-Reply-To", opts.messageId);
  // Preserve any existing References chain and append the message we're replying
  // to, so the thread stays intact across clients.
  const references = [opts.references, opts.messageId].filter(Boolean).join(" ").trim();
  if (references) msg.setHeader("References", references);
  msg.setHeader("Auto-Submitted", "auto-replied");
  msg.addMessage({ contentType: "text/plain", data: reply.text });
  msg.addMessage({ contentType: "text/html", data: reply.html });
  return msg.asRaw();
}
