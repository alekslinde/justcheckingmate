import { NextRequest, NextResponse } from "next/server";
import { analyzeContent } from "@/lib/scamDetector";
import { CHECK_RATE_LIMIT, checkAndRecordRateLimit, incrementCheckCount } from "@/lib/reportStore";
import { clientIpFromHeaders } from "@/lib/geo";
import { getUrlhausBlocklist } from "@/lib/urlhausBlocklist";
import { resolveRegion } from "@/lib/regionResolver";

// IMPORTANT: This route performs ONLY string analysis on the submitted content.
// It must NEVER make an outbound HTTP request, DNS lookup, or socket connection
// to any URL contained in the input. Doing so would notify the scammer's
// infrastructure that their link is under investigation. The CSP header
// (connect-src 'self') in next.config.ts enforces this at the browser layer;
// this comment is the server-side contract.
//
// The URLhaus blocklist fetch below is to a fixed trusted endpoint (abuse.ch),
// NOT to any user-supplied URL — it does not violate the contract above.

export async function POST(req: NextRequest) {
  try {
    // Throttle before parsing or analysing — this endpoint is public and
    // unauthenticated, and analysis is the expensive part. The IP is used as a
    // transient key only and is never stored.
    if (!checkAndRecordRateLimit(`check:${clientIpFromHeaders(req.headers)}`, CHECK_RATE_LIMIT)) {
      return NextResponse.json(
        { error: "Too many checks — give it a minute and try again." },
        { status: 429 },
      );
    }

    const { content, region }: { content: string; region?: string } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    // Explicit choice wins over the platform geo header; falls back to the
    // default region when neither is available (e.g. local dev).
    const resolvedRegion = resolveRegion(req.headers, region);

    // Fetch the live blocklist in parallel with nothing else — it's cached for
    // 6 hours so this is effectively free on all but the first request per window.
    const blocklist = await getUrlhausBlocklist();

    // Pull each identifier out of the input and assess it on its own. All
    // analysis is pure string work — no outbound request is made to the input.
    const results = await analyzeContent(content, blocklist, resolvedRegion);

    incrementCheckCount().catch(() => {});
    return NextResponse.json({ results, region: resolvedRegion });
  } catch {
    return NextResponse.json({ error: "Something went sideways on our end" }, { status: 500 });
  }
}
