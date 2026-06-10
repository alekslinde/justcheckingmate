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

// Headers in forwarded/pasted email that identify the reporter's own mailbox
// or delivery path. Stripped before the content is stored or published.
const REPORTER_HEADER_RE = /^(delivered-to|x-original-to|x-forwarded-to|x-google-original-to|x-received)[^\n]*/gim;

export function stripReporterHeaders(raw: string): string {
  return raw.replace(REPORTER_HEADER_RE, "");
}
