import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { analyzeContent } from "@/lib/scamDetector";
import { getUrlhausBlocklist } from "@/lib/urlhausBlocklist";
import { parseEmailHeaders, analyseEmailIdentities } from "@/lib/emailHeaders";
import { analyseEmailTracking } from "@/lib/emailTracking";
import { unwrapForwarded } from "@/lib/forwardedEmail";
import { formatVerdictEmail } from "@/lib/verdictSummary";
import { checkAndRecordRateLimit, incrementCheckCount } from "@/lib/reportStore";

// Inbound webhook for the forward-to-us flow. A Cloudflare Email Worker (see
// workers/inbound-email/) receives a forwarded suspicious email, POSTs the raw
// RFC822 here, and sends the verdict we return back to the forwarder.
//
// PRIVACY: we analyse the raw email entirely in memory and return a verdict.
// The raw email is NEVER stored — only an anonymous aggregate counter is
// incremented. This mirrors the client-side-only posture of /api/check.
//
// SECURITY: this route is the trust boundary. Only the Worker knows
// INBOUND_SECRET, so a constant-time check on the shared header gates entry.
// We always return 200 (even on rate-limit / bad input) so the Worker never
// bounces mail back to a possibly-spoofed sender.
//
// Like /api/check, analysis here makes NO outbound request to any URL in the
// email — the only network calls are the trusted abuse.ch blocklist fetch.

const MAX_RAW_BYTES = 1_000_000; // 1 MB — defence in depth; Worker also caps.

function secretOk(req: NextRequest): boolean {
  const expected = process.env.INBOUND_SECRET;
  if (!expected) return false; // not configured → closed by default
  const got = req.headers.get("x-inbound-secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal length; length mismatch is itself a fail.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { raw?: string; from?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, skip: "bad-json" });
  }

  const raw = typeof body.raw === "string" ? body.raw : "";
  const from = typeof body.from === "string" ? body.from.trim().toLowerCase() : "";

  if (!raw || raw.length > MAX_RAW_BYTES) {
    return NextResponse.json({ ok: true, skip: "empty-or-too-large" });
  }

  // Per-sender throttle (reuses the in-memory limiter keyed on the forwarder).
  // On limit we no-op with 200 so we never auto-reply in a tight loop or become
  // a reflector — the Worker simply sends nothing.
  if (from && !checkAndRecordRateLimit(`inbound:${from}`)) {
    return NextResponse.json({ ok: true, skip: "rate-limited" });
  }

  try {
    // Reach the ORIGINAL scam inside the forward before analysing — the
    // top-level headers belong to the forwarder, not the scammer.
    const { raw: original, source } = unwrapForwarded(raw);

    const blocklist = await getUrlhausBlocklist();
    const results = await analyzeContent(original, blocklist);

    const headers = parseEmailHeaders(original);
    const emailFlags = headers.fromAddress ? analyseEmailIdentities(headers).flags : [];

    const tracking = analyseEmailTracking(original);
    const pixelReport = tracking.pixelReport.hasTrackingPixels ? tracking.pixelReport : null;

    const reply = formatVerdictEmail({
      results,
      emailFlags,
      pixelReport,
      trackingFindings: tracking.findings,
    });

    incrementCheckCount().catch(() => {});

    // Return the formatted reply for the Worker to send. `source` lets the
    // Worker (or logs) know whether we got a high-fidelity attachment or a
    // lower-fidelity inline quote. The raw email is now out of scope and
    // discarded with this request.
    return NextResponse.json({ ok: true, source, reply });
  } catch {
    // Never bounce — acknowledge and send nothing.
    return NextResponse.json({ ok: true, skip: "analysis-error" });
  }
}

// Only POST is meaningful; anything else is a probe.
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
