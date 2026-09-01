// Shared verdict composition + defang helpers.
//
// The Check results page and the forward-to-us email reply must reach the SAME
// overall verdict for the same content — so the collapse-many-identifiers-into-
// one logic lives here, as a pure function, instead of inline in the UI. Both
// the React component (components/CheckFlow.tsx) and the inbound webhook
// (app/api/inbound/route.ts) call composeVerdict; neither owns the rules.
//
// Pure module: no React, no I/O. Safe to unit test and to import from a route.

import { AnalyzedIdentifier, CheckResult } from "@justcheckingmate/engine/scamDetector";
import type { RegionCoverage } from "@justcheckingmate/engine/regions";
import type { Signal } from "@justcheckingmate/engine/engineTypes";
import { TrackingPixelReport } from "@/lib/trackingPixel";
import { TrackingFinding } from "@/lib/emailTracking";
import { defang, defangEmail, defangPhone, defangText } from "@justcheckingmate/engine/urlSanitizer";
import { buildReportQuery, ReportPrefill } from "@/lib/reportPrefill";

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

// The single severity decision for a whole email, including the case where no
// URL/phone/email identifier was scored (a header-only forward). Sender-spoofing
// flags, a tracking pixel, or any other tracking each imply at least
// "suspicious"; absent all of those an unscored email is "unknown". Both the
// Check UI and the email reply call this so they can't disagree.
export function overallVerdict(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
  emailFlags: string[] = [],
  hasOtherTracking = false,
): OverallVerdict {
  const composed = composeVerdict(results, pixelReport);
  if (composed) return composed;
  if (emailFlags.length > 0 || pixelReport || hasOtherTracking) {
    return { verdict: "suspicious", score: 40 };
  }
  return { verdict: "unknown", score: 0 };
}

// "Clean" means nothing flagged it — every identifier safe AND no tracking
// pixel (a pixel pushes the overall verdict to suspicious). Mirrors the CTA
// gating on the Check page.
//
// Under partial/no regional coverage the checkers already downgrade "safe" to
// "unknown", so an incompletely-covered result can never satisfy this.
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

// The weakest coverage across all scored identifiers — the honest level to
// report for the check as a whole, since one uncovered identifier means the
// overall picture is incomplete. Absent coverage is treated as "full" so
// results predating the field (and non-region paths) read as they always did.
export function overallCoverage(results: AnalyzedIdentifier[]): RegionCoverage {
  const RANK: Record<RegionCoverage, number> = { full: 0, partial: 1, none: 2 };
  return results.reduce<RegionCoverage>((worst, r) => {
    const c = r.result.coverage ?? "full";
    return RANK[c] > RANK[worst] ? c : worst;
  }, "full");
}

// ── Email reply formatting ─────────────────────────────────────────────────────
// Plain-English verdict for the forward-to-us reply. Runs server-side with no
// React/i18n context, so the copy is fixed English here (the email channel is
// English-only for v1). Every identifier and flag is defanged before it reaches
// the body — the reply must never contain a live link back to the scam.

// One-sentence headline per verdict, plus an emoji the reply can lead with.
// accent/tint colour the headline block so the verdict is legible at a glance
// without relying on the emoji, which some clients render inconsistently.
const VERDICT_HEADLINE: Record<Verdict, { emoji: string; line: string; accent: string; tint: string }> = {
  likely_scam: { emoji: "🚨", line: "This looks like a scam.", accent: "#c0392b", tint: "#fdeceb" },
  suspicious:  { emoji: "⚠️", line: "This looks suspicious — treat it with caution.", accent: "#d68910", tint: "#fdf6e3" },
  unknown:     { emoji: "❓", line: "We couldn't confirm this either way — stay cautious.", accent: "#7f8c8d", tint: "#f4f6f6" },
  safe:        { emoji: "✅", line: "We didn't find scam signals in this — but stay alert.", accent: "#1e8449", tint: "#eafaf1" },
};

export interface VerdictEmailInput {
  results: AnalyzedIdentifier[];
  emailFlags: string[];
  pixelReport: TrackingPixelReport | null;
  // Broader tracking surface (pixels + click redirects, CSS beacons, read
  // receipts, …). Optional so existing callers/tests keep working; when given,
  // it supersedes the single pixel line in the "Why" section.
  trackingFindings?: TrackingFinding[];
  // Canonical site origin. When given, the reply ends with a call to action
  // linking to a prefilled report form so the forwarder can lodge the scam in
  // the public database in one tap. Omitted → no CTA (the reply is still
  // complete without it), which keeps existing callers and tests working.
  siteUrl?: string;
  // The original scammer's From / Reply-To, already unwrapped from the forward.
  // Used only to prefill the report link — never to address anything.
  senderAddress?: string;
  replyToAddress?: string;
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

/**
 * Reasons shown per identifier before collapsing into "…and N more".
 *
 * A heavily-flagged message can trip a dozen rules; printing all of them buries
 * the verdict in a wall of text on a phone. The flags are ordered by the
 * detector in roughly descending importance, so the first few carry most of the
 * explanation.
 */
const MAX_REASONS_PER_ITEM = 4;

interface BreakdownItem {
  heading: string;
  reasons: string[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Build the verdict reply. When there are no scored identifiers but sender flags
// exist (header-only forward), the headline is driven by the flags' presence.
export function formatVerdictEmail(input: VerdictEmailInput): VerdictEmail {
  const { results, emailFlags, pixelReport, trackingFindings = [], siteUrl, senderAddress, replyToAddress } = input;

  // One shared severity decision — same rule the Check UI uses — so a header-
  // only forward still gets a meaningful headline and the two never disagree.
  const { verdict } = overallVerdict(results, pixelReport, emailFlags, trackingFindings.length > 0);
  const head = VERDICT_HEADLINE[verdict];

  // Breakdown — each identifier, its status, and WHY. The reasons are the point:
  // "Link evil[.]tk: likely scam" with nothing under it tells someone to be
  // afraid without teaching them what to look for next time. The detector
  // already writes lay-readable flags ("Dodgy top-level domain (.tk) — commonly
  // used by scammers"); this surfaces them instead of discarding them.
  const breakdown: BreakdownItem[] = results.map((r) => {
    const label = KIND_LABEL[r.kind];
    const value = r.kind !== "message" && r.value ? ` ${defangValue(r.kind, r.value)}` : "";
    const reasons = r.result.flags.slice(0, MAX_REASONS_PER_ITEM).map((f) => defangFlag(f));
    const hidden = Math.max(0, r.result.flags.length - MAX_REASONS_PER_ITEM);
    if (hidden > 0) reasons.push(`…and ${hidden} more signal${hidden === 1 ? "" : "s"}`);

    // The resolved destination of a shortened link is the single most useful
    // fact we can give someone, so it leads rather than sitting among the flags.
    if (r.result.expandedUrl) {
      reasons.unshift(`Real destination: ${r.result.expandedUrl}`);
    }

    return { heading: `${label}${value}: ${r.result.verdict.replace("_", " ")}`, reasons };
  });
  const flagLines = emailFlags.map((f) => defangFlag(f));
  // Tracking: prefer the broader findings when present; otherwise fall back to
  // the single pixel summary so older callers still surface pixels.
  if (trackingFindings.length > 0) {
    for (const f of trackingFindings) flagLines.push(`${f.label}: ${f.detail}`);
  } else if (pixelReport?.summary) {
    flagLines.push(`Tracking pixel: ${pixelReport.summary}`);
  }

  // Coverage caveat — stated before the advice so a reader can't take a quiet
  // result as a clean bill of health for a region we don't fully cover.
  const coverage = overallCoverage(results);
  const coverageNote =
    coverage === "full"
      ? ""
      : "Heads up: we don't have full scam-detection rules for this region yet, so " +
        "this check is less thorough than usual. Treat a quiet result as 'not checked', not 'safe'.";

  const footer =
    "What to do next: don't click links or reply. If you've lost money or shared " +
    "details, contact IDCARE on 1800 595 160. You can also report scams to Scamwatch " +
    "(scamwatch.gov.au). We analysed the email on receipt and did not keep a copy.";

  // When nothing was flagged, say what we looked at rather than going quiet.
  // Silence reads as "we didn't bother"; naming the checks is the reassurance.
  const nothingFound =
    breakdown.length > 0 && breakdown.every((b) => b.reasons.length === 0) && flagLines.length === 0
      ? "We checked the sender's details, the links, and the wording against our scam patterns, " +
        "and nothing matched."
      : "";

  // Report CTA — the one action that turns a private verdict into a public
  // warning. Only offered when something was actually found: inviting someone
  // to lodge a report for an email we just called clean would pollute the
  // database and waste their time.
  //
  // The link carries only the extracted identifiers (see lib/reportPrefill.ts).
  // The forwarded email is never stored and never travels in the URL — the same
  // reply promises we didn't keep a copy, and that has to stay true.
  const reportUrl = (() => {
    if (!siteUrl || verdict === "safe") return "";
    const first = (kind: AnalyzedIdentifier["kind"]) =>
      results.find((r) => r.kind === kind)?.value;
    const scamEmail = senderAddress || first("email");
    const prefill: ReportPrefill = {
      // A sender address means we're looking at email source; otherwise fall
      // back to whatever identifier the detector actually scored.
      type: scamEmail ? "email" : first("url") ? "url" : first("phone") ? "phone" : "custom",
      ...(first("url") ? { scamUrl: first("url") } : {}),
      ...(scamEmail ? { scamEmail } : {}),
      ...(replyToAddress ? { scamReplyTo: replyToAddress } : {}),
      ...(first("phone") ? { scamPhone: first("phone") } : {}),
    };
    const query = buildReportQuery(prefill);
    return `${siteUrl.replace(/\/$/, "")}/report${query ? `?${query}` : ""}`;
  })();

  const ctaLine =
    "Help someone else dodge this: lodge it in our public scam database. " +
    "We've already filled in what we found — you just add anything you want to " +
    "say and hit submit.";

  // ── Plain text ──
  const textParts = [
    `${head.emoji} ${head.line}`,
    "",
    ...(breakdown.length
      ? [
          "What we checked:",
          ...breakdown.flatMap((b) => [
            `  • ${b.heading}`,
            ...b.reasons.map((r) => `      - ${r}`),
          ]),
          "",
        ]
      : []),
    ...(nothingFound ? [nothingFound, ""] : []),
    ...(flagLines.length ? ["About the sender:", ...flagLines.map((f) => `  • ${f}`), ""] : []),
    ...(coverageNote ? [coverageNote, ""] : []),
    ...(reportUrl ? [ctaLine, reportUrl, ""] : []),
    footer,
    "",
    "— Just Checking, Mate",
  ];
  const text = textParts.join("\n");

  // ── HTML ──
  // Deliberately self-contained: everything is escaped and NO external resource
  // is referenced. This email quotes attacker-controlled text, and a remote
  // image would leak the recipient's IP and read status to whoever hosts it —
  // unacceptable when the recipient may be a scam victim. Styling stays inline
  // so it survives clients that strip <style>; the colour-coded accent bar is
  // what makes the verdict readable at a glance on a phone.
  const li = (items: string[]) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");

  const breakdownHtml = breakdown
    .map((b) => {
      const reasons = b.reasons.length
        ? `<ul style="margin:4px 0 0;padding-left:20px;color:#444;font-size:14px">${li(b.reasons)}</ul>`
        : "";
      return `<li style="margin-bottom:10px"><strong>${escapeHtml(b.heading)}</strong>${reasons}</li>`;
    })
    .join("");

  const htmlParts = [
    `<div style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
      `font-size:15px;line-height:1.5;color:#222">`,
    `<p style="font-size:18px;font-weight:bold;margin:0 0 16px;padding:12px 14px;` +
      `border-left:4px solid ${head.accent};background:${head.tint};border-radius:4px">` +
      `${escapeHtml(`${head.emoji} ${head.line}`)}</p>`,
    breakdown.length
      ? `<p style="margin:0 0 6px"><strong>What we checked</strong></p>` +
        `<ul style="margin:0 0 16px;padding-left:20px">${breakdownHtml}</ul>`
      : "",
    nothingFound ? `<p style="margin:0 0 16px;color:#444">${escapeHtml(nothingFound)}</p>` : "",
    flagLines.length
      ? `<p style="margin:0 0 6px"><strong>About the sender</strong></p>` +
        `<ul style="margin:0 0 16px;padding-left:20px;color:#444;font-size:14px">${li(flagLines)}</ul>`
      : "",
    coverageNote
      ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fdf6e3;border-radius:4px;` +
        `color:#8a6d3b;font-size:13px">${escapeHtml(coverageNote)}</p>`
      : "",
    // The CTA is the only link in this email, and it points at our own origin —
    // built from siteUrl and URL-encoded params, never from attacker-controlled
    // text. Everything else stays unlinked so nothing in a quoted scam becomes
    // clickable.
    reportUrl
      ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f0f9f4;border-radius:4px;` +
        `color:#245c3d;font-size:14px">${escapeHtml(ctaLine)}<br>` +
        `<a href="${escapeHtml(reportUrl)}" style="display:inline-block;margin-top:10px;` +
        `padding:10px 16px;background:#059669;color:#ffffff;text-decoration:none;` +
        `border-radius:6px;font-weight:bold;font-size:14px">Report this scam</a></p>`
      : "",
    `<p style="margin:16px 0 0;padding-top:14px;border-top:1px solid #e5e5e5;` +
      `color:#555;font-size:13px">${escapeHtml(footer)}</p>`,
    `<p style="margin:10px 0 0;color:#888;font-size:13px">— Just Checking, Mate</p>`,
    `</div>`,
  ];
  const html = htmlParts.filter(Boolean).join("\n");

  const subject =
    verdict === "likely_scam" ? "Scam alert: the email you forwarded"
    : verdict === "suspicious" ? "Caution: the email you forwarded looks suspicious"
    : "Result: the email you forwarded";

  return { subject, text, html };
}

// Every finding across every identifier, as one list of evidence.
//
// The results page used to hand the verdict card only the *worst* identifier's
// signals, which quietly dropped the rest. A parcel-fee SMS carrying a dodgy
// link scores as two identifiers — the message and the URL — and showing only
// the message's rows hid the ".top domain" and "no HTTPS" findings that are the
// most concrete evidence on the page. The overall score is composed from all of
// them, so the evidence under it has to be too, or the arithmetic doesn't add
// up in front of a reader we explicitly invite to check it.
//
// Ordering: findings first in identifier order, then the clamp row last if any
// identifier hit its ceiling — it is arithmetic about the total, so it belongs
// at the bottom of the column it explains, not interleaved with observations.
//
// Duplicate texts are collapsed. The same URL appearing in both the message
// scan and its own scan produces the same sentence twice, and one observation
// listed twice reads as two independent findings.
export function pooledSignals(results: AnalyzedIdentifier[]): Signal[] {
  const seen = new Set<string>();
  const findings: Signal[] = [];
  const clamps: Signal[] = [];
  for (const r of results) {
    for (const s of r.result.signals ?? []) {
      if (seen.has(s.text)) continue;
      seen.add(s.text);
      (s.source === "score" ? clamps : findings).push(s);
    }
  }
  return [...findings, ...clamps];
}
