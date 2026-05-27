// Guards incoming report submissions against bots, scrapers, rate abusers,
// and scammers trying to poison the database.
//
// Returns one of three verdicts:
//   'accept'  — store in the main legitimate queue
//   'suspect' — store in the suspect/review queue, return fake success to caller
//   'poison'  — discard silently, return fake success to caller
//
// All three return an identical-looking success response to the client.

import { checkUrl, checkSms, checkEmail, checkPhone, checkCustom, ScamType } from "./scamDetector";
import { checkAndRecordRateLimit, isRecentDuplicate } from "./reportStore";

export type GuardVerdict = "accept" | "suspect" | "poison";

export interface GuardInput {
  type: string;
  content: string;
  description: string;
  hp: string;           // honeypot — must be empty
  loadedAt: number;     // unix ms when the form was rendered, set by client
  ip: string;
  userAgent: string;
  contentLength: number;
}

export interface GuardResult {
  verdict: GuardVerdict;
  reason: string;
}

// User-agent substrings that indicate automated tools / scrapers
const BOT_UA_PATTERNS = [
  "curl", "wget", "python-requests", "python/", "go-http", "java/",
  "libwww", "httpclient", "scrapy", "okhttp", "axios/", "node-fetch",
  "got/", "undici", "pycurl", "bot/", "crawler", "spider", "headless",
  "phantomjs", "selenium",
];

export function guardSubmission(input: GuardInput): GuardResult {
  // ── 1. Honeypot ────────────────────────────────────────────────────────────
  // Bots filling all fields in a form will populate this hidden field.
  if (input.hp.length > 0) {
    return { verdict: "poison", reason: "honeypot_filled" };
  }

  // ── 2. Payload sanity ──────────────────────────────────────────────────────
  if (!input.type || !input.content?.trim()) {
    return { verdict: "poison", reason: "missing_required_fields" };
  }
  if (input.contentLength > 8000) {
    return { verdict: "poison", reason: "payload_too_large" };
  }

  // ── 3. Timing check ────────────────────────────────────────────────────────
  // A human takes at least a few seconds to read the form and fill it in.
  // If loadedAt is missing or the gap is under 2.5s it's automated.
  const elapsed = Date.now() - (input.loadedAt || 0);
  if (!input.loadedAt || elapsed < 2500) {
    return { verdict: "suspect", reason: "submitted_too_fast" };
  }
  // loadedAt suspiciously far in the past (>1 hour) or future suggests manipulation
  if (elapsed > 3_600_000 || elapsed < 0) {
    return { verdict: "suspect", reason: "suspicious_timestamp" };
  }

  // ── 4. User-agent check ────────────────────────────────────────────────────
  const ua = input.userAgent.toLowerCase();
  if (!ua || ua.length < 10) {
    return { verdict: "suspect", reason: "missing_user_agent" };
  }
  if (BOT_UA_PATTERNS.some((p) => ua.includes(p))) {
    return { verdict: "suspect", reason: "bot_user_agent" };
  }

  // ── 5. Rate limiting ───────────────────────────────────────────────────────
  // Runs after UA check so legitimate rate-limited users get poison (silent discard)
  // rather than a real error that tells them to back off and retry.
  if (!checkAndRecordRateLimit(input.ip)) {
    return { verdict: "poison", reason: "rate_limited" };
  }

  // ── 6. Duplicate detection ─────────────────────────────────────────────────
  if (isRecentDuplicate(input.type, input.content)) {
    return { verdict: "suspect", reason: "duplicate_content" };
  }

  // ── 7. Content plausibility ────────────────────────────────────────────────
  // If the submitted content scores very low on our own scam detector, the reporter
  // is either mistaken or — more likely — a scammer trying to get a legitimate-looking
  // URL allowlisted by submitting it as a "found scam."
  const score = scoreContent(input.type as ScamType, input.content);
  if (score < 8) {
    return { verdict: "suspect", reason: "content_appears_legitimate" };
  }

  return { verdict: "accept", reason: "ok" };
}

function scoreContent(type: ScamType, content: string): number {
  switch (type) {
    case "url":    return checkUrl(content).score;
    case "sms":    return checkSms(content).score;
    case "email":  return checkEmail(content).score;
    case "phone":  return checkPhone(content).score;
    case "qr":     return checkUrl(content).score;
    default:       return checkCustom(content).score;
  }
}
