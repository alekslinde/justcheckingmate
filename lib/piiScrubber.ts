// Redacts structured PII from free-text descriptions before public exposure.
// Covers patterns with reliable regex shapes. Names and street addresses
// cannot be reliably detected without NLP and are out of scope.

const PATTERNS: Array<[RegExp, string]> = [
  // Email addresses
  [/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g, "[email removed]"],
  // AU mobile: 04xx xxx xxx (various spacing/dash styles)
  [/\b04\d{2}[\s\-]?\d{3}[\s\-]?\d{3}\b/g, "[phone removed]"],
  // AU landline: 0x xxxx xxxx
  [/\b0[2378][\s\-]?\d{4}[\s\-]?\d{4}\b/g, "[phone removed]"],
  // International: +xx...
  [/\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,5}[\s\-]?\d{3,5}\b/g, "[phone removed]"],
  // IPv4 addresses
  [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP removed]"],
  // IPv6 addresses — full (8 groups) and compressed (::) forms. Requires at
  // least THREE hex groups (or a "::" compression) so a two-part "HH:MM" /
  // three-part "HH:MM:SS" timestamp in a Date/Received header is not mistaken
  // for an address. A lone hex word (no colon) never matches. Runs after IPv4 so
  // a mapped ::ffff:1.2.3.4 has had its IPv4 tail redacted first.
  // Compressed forms may leave a short "::1" remnant — harmless, as no usable
  // address survives; we keep the pattern conservative to avoid eating times.
  // Three branches:
  //   1. uncompressed: 3+ hex groups separated by ":" (e.g. 2002:a05:6512:31c3)
  //   2. compressed with a tail: <groups>::<tail> (e.g. fe80::1234:5678) — the
  //      literal "::" can't occur in a timestamp, so one leading group is safe
  //   3. compressed trailing: <groups>:: (e.g. 2001:db8::)
  // A bare "::" / "::1" loopback is intentionally NOT matched — it carries no
  // identifying information.
  [/\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{0,4}\b|\b[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:?)*[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:/g, "[IP removed]"],
  // AU Tax File Number: 3 groups of 3 digits (space or dash separated)
  [/\b\d{3}[\s\-]\d{3}[\s\-]\d{3}\b/g, "[TFN removed]"],
  // AU BSB: xxx-xxx
  [/\b\d{3}-\d{3}\b/g, "[BSB removed]"],
  // Credit card: 16 digits in groups of 4
  [/\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b/g, "[card removed]"],
];

export function scrubPii(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Headers that identify the reporter's own mailbox or expose the delivery path
// (relay hostnames + IPs, including IPv6). Stripped before the content is shown,
// stored, or published — none are needed to assess the scam.
//
// `Received` is included: the chain records every relay the message passed
// through, leaking the recipient's mail infrastructure and IP addresses. We do
// NOT strip `Authentication-Results` — its SPF/DKIM/DMARC verdicts are scam
// evidence and carry no recipient PII.
const REPORTER_HEADER_NAMES = [
  "delivered-to",
  "x-original-to",
  "x-forwarded-to",
  "x-google-original-to",
  "received",        // full relay chain — hostnames + IPs (incl. IPv6)
  "x-received",
  "x-originating-ip",
  "received-spf",    // carries client-ip of the relay; the spf verdict is
                     // preserved separately via Authentication-Results
];

// A header and all of its folded continuation lines (lines beginning with
// whitespace belong to the header above them). `m` so ^ matches each line; the
// continuation run `(?:\r?\n[ \t][^\n]*)*` swallows folded values like a
// multi-line Received chain.
const REPORTER_HEADER_RE = new RegExp(
  `^(?:${REPORTER_HEADER_NAMES.join("|")})\\s*:[^\\n]*(?:\\r?\\n[ \\t][^\\n]*)*\\r?\\n?`,
  "gim",
);

export function stripReporterHeaders(raw: string): string {
  return raw.replace(REPORTER_HEADER_RE, "");
}
