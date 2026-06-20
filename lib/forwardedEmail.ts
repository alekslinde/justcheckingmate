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
//      "From: ...", "Reply-To: ...", sometimes `>`-quoted. We preserve the
//      quoted headers AND the quoted body, so sender analysis AND tracking
//      analysis (pixels, CSS beacons, read receipts, meta refresh) both work.
//      The only loss versus an attachment is the receiving-server SPF/DKIM/DMARC
//      results, which clients don't carry into the quote.
//
// This module returns the best raw block to hand to parseEmailHeaders /
// analyseEmailTracking, plus how it was found, so callers can caveat the
// (slightly lower-fidelity) inline result.
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

// Split a raw email into its header block and body at the first blank line,
// accounting for the CRLF-or-LF separator length. Shared with emailTracking.
export function splitHeadersBody(raw: string): { headerBlock: string; body: string } {
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

// A line that looks like an email header: "Header-Name: value".
const HEADER_LINE_RE = /^[A-Za-z][A-Za-z0-9\-]*\s*:\s/;

// Header names a forwarded quote typically carries — used to recognise the
// original's header block even when extra prose is interleaved.
const QUOTED_HEADER_RE = /^(from|to|cc|reply-to|sent|date|subject|disposition-notification-to|return-receipt-to|x-confirm-reading-to)\s*:/i;

// Extract the inline-quoted original as a full email: its quoted headers, a
// blank line, then the quoted body. Preserving the body (not just From/Reply-To)
// means tracking analysis — pixels, CSS beacons, meta refresh — works on inline
// forwards too, and read-receipt headers in the quote survive. Returns "" when
// nothing useful is quoted.
function findInline(body: string): string {
  // Find the earliest marker; everything after it is the quoted original.
  let cut = -1;
  for (const re of INLINE_MARKERS) {
    const m = body.match(re);
    if (m && m.index !== undefined && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut === -1) return "";

  // De-quote (`> `) every line after the marker, dropping the marker line itself.
  const lines = body
    .slice(cut)
    .split(/\r?\n/)
    .slice(1) // skip the "---- Forwarded message ----" / "Begin forwarded message:" line
    .map((l) => l.replace(/^\s*>+\s?/, ""));

  // Walk the de-quoted lines: the leading run of header-looking lines (allowing
  // blank lines and folded continuations among them) is the original's header
  // block; the first line that's clearly body text ends it. Everything from
  // there on is the body we hand to the tracking analyser.
  const headerLines: string[] = [];
  let bodyStart = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      // A blank line ends the header block ONLY once we've seen a real header.
      if (headerLines.length > 0) { bodyStart = i + 1; break; }
      continue;
    }
    if (QUOTED_HEADER_RE.test(line) || (headerLines.length > 0 && /^\s+\S/.test(line))) {
      // A recognised header, or a folded continuation of the previous one.
      headerLines.push(line.trim());
      continue;
    }
    if (HEADER_LINE_RE.test(line) && headerLines.length > 0) {
      // Some other header-shaped line amid the block — keep it.
      headerLines.push(line.trim());
      continue;
    }
    // First non-header line: the body starts here.
    bodyStart = i;
    break;
  }

  // Need at least a From/Reply-To to be worth treating as the original.
  const hasSender = headerLines.some((l) => /^(from|reply-to)\s*:/i.test(l));
  if (!hasSender) return "";

  const bodyText = lines.slice(bodyStart).join("\n").trim();
  // Reassemble as a proper RFC822 message: headers, blank line, body.
  return bodyText ? `${headerLines.join("\n")}\n\n${bodyText}` : headerLines.join("\n");
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
