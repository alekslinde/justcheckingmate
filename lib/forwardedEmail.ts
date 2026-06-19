// Locate the ORIGINAL scam message inside a forwarded email.
//
// When someone forwards a suspicious email to us, the top-level RFC822 headers
// describe *their* forward (their address, their provider's SPF/DKIM) — not the
// scam. Analysing those would be worse than useless: it'd vouch for the
// victim's own mail. The original lives in one of two shapes:
//
//   1. As a `message/rfc822` attachment (Apple Mail "Forward as Attachment",
//      Gmail/Outlook "forward as .eml"). The attachment body IS the original
//      raw message — headers and all. This is the high-fidelity case.
//   2. Quoted inline in the body, under a separator like
//      "---------- Forwarded message ---------" followed by lines such as
//      "From: ...", "Reply-To: ...", sometimes `>`-quoted. Lower fidelity:
//      authentication results are usually lost, but From/Reply-To survive.
//
// This module returns the best raw block to hand to parseEmailHeaders, plus how
// it was found, so callers can caveat a low-fidelity (inline) result.
//
// Pure string logic. No MIME library — a focused splitter covers the shapes
// real clients actually produce, and is auditable in one screen.

export type ForwardSource = "attachment" | "inline" | "toplevel";

export interface UnwrappedEmail {
  // Raw text to feed parseEmailHeaders — the innermost original we could find.
  raw: string;
  // How we found it. "toplevel" means no forward wrapper was detected, so the
  // input is treated as the original (e.g. a raw .eml the user exported).
  source: ForwardSource;
}

// Pull the value of a top-level header (first occurrence), unfolding
// continuation lines. Scoped to the header block only.
function headerValue(headerBlock: string, name: string): string {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, "im");
  return unfolded.match(re)?.[1].trim() ?? "";
}

function splitHeadersBody(raw: string): { headerBlock: string; body: string } {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return { headerBlock: raw, body: "" };
  const sepLen = raw.slice(idx).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
  return { headerBlock: raw.slice(0, idx), body: raw.slice(idx + sepLen) };
}

// Strip the boundary parameter out of a Content-Type value, honouring optional
// quoting: boundary="..." or boundary=...
function boundaryOf(contentType: string): string {
  const m = contentType.match(/boundary\s*=\s*"([^"]+)"/i) || contentType.match(/boundary\s*=\s*([^\s;]+)/i);
  return m ? m[1] : "";
}

// Walk a multipart body, returning each part as raw text (its own headers +
// body), split on the MIME boundary.
function multipartParts(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  return body
    .split(delim)
    .map((p) => p.replace(/^\r?\n/, "").replace(/\r?\n--\s*$/, ""))
    .filter((p) => p.trim() && p.trim() !== "--");
}

// Recursively descend through multipart containers looking for a
// message/rfc822 part. Returns its raw content (the embedded original), or "".
function findRfc822(raw: string, depth = 0): string {
  if (depth > 10) return ""; // guard against pathological nesting
  const { headerBlock, body } = splitHeadersBody(raw);
  // Match the type case-insensitively, but extract the boundary from the
  // original-case value — MIME boundaries are case-sensitive.
  const ctRaw = headerValue(headerBlock, "content-type");
  const ct = ctRaw.toLowerCase();

  if (ct.startsWith("message/rfc822")) {
    // The body of a message/rfc822 part is the embedded message verbatim.
    return body.trim();
  }
  if (ct.startsWith("multipart/")) {
    const boundary = boundaryOf(ctRaw);
    if (!boundary) return "";
    for (const part of multipartParts(body, boundary)) {
      const found = findRfc822(part, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

// Markers different clients place before an inline-quoted forwarded message.
const INLINE_MARKERS = [
  /-{2,}\s*forwarded message\s*-{2,}/i,           // Gmail, generic
  /begin forwarded message:/i,                    // Apple Mail
  /-{2,}\s*original message\s*-{2,}/i,            // Outlook (older)
  /^from:\s.+\bsent:\s/im,                        // Outlook header-style block
];

// Extract the original headers quoted inline. Returns a synthetic header block
// (From:/Reply-To:/Subject:) reconstructed from the quoted lines, or "".
function findInline(body: string): string {
  // Find the earliest marker; everything after it is the quoted original.
  let cut = -1;
  for (const re of INLINE_MARKERS) {
    const m = body.match(re);
    if (m && m.index !== undefined && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut === -1) return "";

  // De-quote (`> `), then pull the header-ish lines that follow the marker.
  const quoted = body
    .slice(cut)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*>+\s?/, "").trim());

  const grab = (name: string): string => {
    const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "i");
    for (const l of quoted) {
      const m = l.match(re);
      if (m) return m[1].trim();
    }
    return "";
  };

  const from = grab("from");
  const replyTo = grab("reply-to");
  const subject = grab("subject");
  if (!from && !replyTo) return ""; // nothing useful quoted

  // Reconstruct a minimal header block parseEmailHeaders understands.
  const lines: string[] = [];
  if (from) lines.push(`From: ${from}`);
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  if (subject) lines.push(`Subject: ${subject}`);
  return lines.join("\n");
}

// Find the original message inside a (possibly) forwarded email. Tries the
// high-fidelity attachment path first, then inline quotes, then falls back to
// treating the whole input as the original.
export function unwrapForwarded(raw: string): UnwrappedEmail {
  const attachment = findRfc822(raw);
  if (attachment) return { raw: attachment, source: "attachment" };

  const { body } = splitHeadersBody(raw);
  const inline = findInline(body);
  if (inline) return { raw: inline, source: "inline" };

  return { raw, source: "toplevel" };
}
