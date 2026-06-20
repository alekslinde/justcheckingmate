import { NextRequest, NextResponse } from "next/server";
import { guardSubmission } from "@/lib/submissionGuard";
import { generateReportId, storeReport, getStats } from "@/lib/reportStore";
import { stripTrackingParams } from "@/lib/urlSanitizer";
import { summariseAuth } from "@/lib/emailHeaders";
import { scrubPii } from "@/lib/piiScrubber";
import { distillEmailContent } from "@/lib/emailDistiller";
import { locationFromHeaders } from "@/lib/geo";

// The client IP is used ONLY for transient, in-memory rate limiting inside
// guardSubmission. It is never written to the database — the only geographic
// trace a report carries is the coarse region string from locationFromHeaders.
function getClientIp(req: NextRequest): string {
  // x-forwarded-for can contain a comma-separated list; take the first entry.
  // Treat obviously spoofed values as "unknown".
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const ip = fwd.split(",")[0].trim();
    if (/^[\d.]+$/.test(ip) || /^[a-f0-9:]+$/i.test(ip)) return ip;
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON — treat as bot
    return NextResponse.json({ success: true, reportId: generateReportId() });
  }

  const rawContent = String(body.content ?? "");
  const type = String(body.type ?? "");
  const rawScamUrl = String(body.scamUrl ?? "").slice(0, 2000);

  // For URL/QR reports strip tracking parameters before storing — keeping them
  // would let the scammer correlate which of their campaigns got reported.
  // For email reports, distil the raw RFC822 down to the legible scam content:
  // unwrap any forward to the original, keep only the human-meaningful headers
  // (From/Reply-To/To/Subject/Date) and the decoded body, dropping the
  // transport/auth header storm (ARC, DKIM, X-MS-Exchange-*), MIME boundaries,
  // quoted-printable encoding and the duplicate HTML part. Since we keep only an
  // allowlist of headers, the reporter's mailbox/delivery headers are dropped as
  // a side effect. After distillation, run PII scrubbing (emails, phones,
  // IPv4/IPv6, TFN/BSB/card) on the remaining content.
  const safeContent = scrubPii(
    (type === "url" || type === "qr")
      ? stripTrackingParams(rawContent)
      : type === "email"
        ? distillEmailContent(rawContent)
        : rawContent
  );
  const safeScamUrl = rawScamUrl ? stripTrackingParams(rawScamUrl) : "";

  // Email-authentication verdicts are submitted as raw tokens; summariseAuth
  // validates them against an allowlist and composes a defanged display string,
  // so nothing the client sends here reaches storage unchecked.
  const emailAuth = summariseAuth({
    spf:        String(body.spf ?? "").slice(0, 20),
    dkim:       String(body.dkim ?? "").slice(0, 20),
    dkimDomain: String(body.dkimDomain ?? "").slice(0, 255),
    dmarc:      String(body.dmarc ?? "").slice(0, 20),
  });

  const guardResult = guardSubmission({
    type,
    content: safeContent,
    description: String(body.description ?? "").slice(0, 1000),
    hp: String(body.hp ?? ""),
    loadedAt: Number(body.loadedAt ?? 0),
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? "",
    contentLength: rawContent.length,
  });

  // All verdicts return the same shape — the caller never learns which path was taken.
  const reportId = generateReportId();

  if (guardResult.verdict === "poison") {
    // Discard silently, return fake success
    return NextResponse.json({ success: true, reportId });
  }

  await storeReport(
    {
      id: reportId,
      type,
      content:     safeContent.slice(0, 2000),
      description: scrubPii(String(body.description ?? "").slice(0, 1000)),
      contact:     String(body.contact ?? "").slice(0, 200),
      submittedAt: Date.now(),
      location:    locationFromHeaders(req.headers),
      scamUrl:     safeScamUrl,
      scamPhone:   String(body.scamPhone ?? "").slice(0, 50),
      scamEmail:   String(body.scamEmail ?? "").slice(0, 200),
      scamReplyTo: String(body.scamReplyTo ?? "").slice(0, 200),
      emailAuth,
    },
    guardResult.verdict === "suspect",
  );

  return NextResponse.json({ success: true, reportId });
}

export async function GET() {
  const { reports } = await getStats();
  return NextResponse.json({ totalReports: reports });
}
