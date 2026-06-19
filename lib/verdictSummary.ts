// Shared verdict composition + defang helpers.
//
// The Check results page and the forward-to-us email reply must reach the SAME
// overall verdict for the same content — so the collapse-many-identifiers-into-
// one logic lives here, as a pure function, instead of inline in the UI. Both
// the React component (components/CheckFlow.tsx) and the inbound webhook
// (app/api/inbound/route.ts) call composeVerdict; neither owns the rules.
//
// Pure module: no React, no I/O. Safe to unit test and to import from a route.

import { AnalyzedIdentifier, CheckResult } from "@/lib/scamDetector";
import { TrackingPixelReport } from "@/lib/trackingPixel";
import { defang, defangEmail, defangPhone, defangText } from "@/lib/urlSanitizer";

export type Verdict = CheckResult["verdict"];

// Severity ordering — higher wins when collapsing many identifiers into one
// overall verdict. "unknown" sits just above "safe": it's not a clean pass,
// but it's not a positive signal of a scam either.
export const VERDICT_RANK: Record<Verdict, number> = {
  safe: 0,
  unknown: 1,
  suspicious: 2,
  likely_scam: 3,
};

// Defang an identifier for display, per its kind. Mirrors how every value on
// the Check page is shown — nothing live or clickable ever surfaces.
export function defangValue(kind: AnalyzedIdentifier["kind"], value: string): string {
  if (kind === "url")   return defang(value);
  if (kind === "email") return defangEmail(value);
  if (kind === "phone") return defangPhone(value);
  return defangText(value);
}

// The identity-analysis flags embed raw email addresses and bare domains as
// plain text. Defang both so a flag can never surface a live, clickable address
// — matching how every other value is shown.
export function defangFlag(flag: string): string {
  return flag
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, (a) => defangEmail(a))
    .replace(/\b[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+\b/g, (d) => d.replace(/\./g, "[.]"));
}

export interface OverallVerdict {
  verdict: Verdict;
  score: number;
}

// Collapse the per-identifier results into one overall verdict: the worst
// identifier wins, then a tracking pixel nudges an otherwise-clean result up to
// "suspicious" (being silently tracked is itself a red flag). Returns null when
// there are no scored identifiers — callers decide what to show in that case
// (email sender analysis can still carry the payoff).
//
// This is the exact rule the Check results page applies; keep them in lockstep.
export function composeVerdict(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
): OverallVerdict | null {
  if (results.length === 0) return null;
  const worst = results.reduce((acc, r) =>
    VERDICT_RANK[r.result.verdict] > VERDICT_RANK[acc.result.verdict] ? r : acc,
  );
  let verdict = worst.result.verdict;
  let score = worst.result.score;
  if (pixelReport && VERDICT_RANK[verdict] < VERDICT_RANK.suspicious) {
    verdict = "suspicious";
    score = Math.max(score, 40);
  }
  return { verdict, score };
}

// "Clean" means nothing flagged it — every identifier safe AND no tracking
// pixel (a pixel pushes the overall verdict to suspicious). Mirrors the CTA
// gating on the Check page.
export function isClean(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
  emailFlags: string[] = [],
): boolean {
  return (
    results.length > 0 &&
    results.every((r) => r.result.verdict === "safe") &&
    !pixelReport &&
    emailFlags.length === 0
  );
}

// ── Email reply formatting ─────────────────────────────────────────────────────
// Plain-English verdict for the forward-to-us reply. Runs server-side with no
// React/i18n context, so the copy is fixed English here (the email channel is
// English-only for v1). Every identifier and flag is defanged before it reaches
// the body — the reply must never contain a live link back to the scam.

// One-sentence headline per verdict, plus an emoji the reply can lead with.
const VERDICT_HEADLINE: Record<Verdict, { emoji: string; line: string }> = {
  likely_scam: { emoji: "🚨", line: "This looks like a scam." },
  suspicious:  { emoji: "⚠️", line: "This looks suspicious — treat it with caution." },
  unknown:     { emoji: "❓", line: "We couldn't confirm this either way — stay cautious." },
  safe:        { emoji: "✅", line: "We didn't find scam signals in this — but stay alert." },
};

export interface VerdictEmailInput {
  results: AnalyzedIdentifier[];
  emailFlags: string[];
  pixelReport: TrackingPixelReport | null;
}

export interface VerdictEmail {
  subject: string;
  text: string;
  html: string;
}

// Human label for an identifier kind, used in the breakdown.
const KIND_LABEL: Record<AnalyzedIdentifier["kind"], string> = {
  url: "Link", email: "Sender", phone: "Phone", message: "Message",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Build the verdict reply. When there are no scored identifiers but sender flags
// exist (header-only forward), the headline is driven by the flags' presence.
export function formatVerdictEmail(input: VerdictEmailInput): VerdictEmail {
  const { results, emailFlags, pixelReport } = input;

  const overall = composeVerdict(results, pixelReport);
  // No scored identifiers: fall back to a verdict implied by sender flags /
  // pixels so a header-only forward still gets a meaningful headline.
  let verdict: Verdict = overall?.verdict ?? "unknown";
  if (!overall) {
    if (emailFlags.length > 0) verdict = "suspicious";
    else if (pixelReport) verdict = "suspicious";
    else verdict = "unknown";
  }
  const head = VERDICT_HEADLINE[verdict];

  // Breakdown lines — defanged identifier + its per-item status.
  const breakdown: string[] = results.map((r) => {
    const label = KIND_LABEL[r.kind];
    const value = r.kind !== "message" && r.value ? ` ${defangValue(r.kind, r.value)}` : "";
    return `${label}${value}: ${r.result.verdict.replace("_", " ")}`;
  });
  const flagLines = emailFlags.map((f) => defangFlag(f));
  if (pixelReport?.summary) flagLines.push(`Tracking pixel: ${pixelReport.summary}`);

  const footer =
    "What to do next: don't click links or reply. If you've lost money or shared " +
    "details, contact IDCARE on 1800 595 160. You can also report scams to Scamwatch " +
    "(scamwatch.gov.au). We analysed the email on receipt and did not keep a copy.";

  // ── Plain text ──
  const textParts = [
    `${head.emoji} ${head.line}`,
    "",
    ...(breakdown.length ? ["What we checked:", ...breakdown.map((b) => `  • ${b}`), ""] : []),
    ...(flagLines.length ? ["Why:", ...flagLines.map((f) => `  • ${f}`), ""] : []),
    footer,
    "",
    "— Just Checking, Mate",
  ];
  const text = textParts.join("\n");

  // ── Minimal HTML (no external resources, everything escaped) ──
  const li = (items: string[]) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  const htmlParts = [
    `<p style="font-size:16px;font-weight:bold">${escapeHtml(`${head.emoji} ${head.line}`)}</p>`,
    breakdown.length ? `<p><strong>What we checked:</strong></p><ul>${li(breakdown)}</ul>` : "",
    flagLines.length ? `<p><strong>Why:</strong></p><ul>${li(flagLines)}</ul>` : "",
    `<p style="color:#555;font-size:13px">${escapeHtml(footer)}</p>`,
    `<p style="color:#888;font-size:13px">— Just Checking, Mate</p>`,
  ];
  const html = htmlParts.filter(Boolean).join("\n");

  const subject =
    verdict === "likely_scam" ? "Scam alert: the email you forwarded"
    : verdict === "suspicious" ? "Caution: the email you forwarded looks suspicious"
    : "Result: the email you forwarded";

  return { subject, text, html };
}
