import { NextRequest, NextResponse } from "next/server";
import { analyzeContent } from "@/lib/scamDetector";
import { incrementCheckCount } from "@/lib/reportStore";

// IMPORTANT: This route performs ONLY string analysis on the submitted content.
// It must NEVER make an outbound HTTP request, DNS lookup, or socket connection
// to any URL contained in the input. Doing so would notify the scammer's
// infrastructure that their link is under investigation. The CSP header
// (connect-src 'self') in next.config.ts enforces this at the browser layer;
// this comment is the server-side contract.

export async function POST(req: NextRequest) {
  try {
    const { content }: { content: string } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    // Pull each identifier out of the input and assess it on its own. All
    // analysis is pure string work — no outbound request is ever made.
    const results = analyzeContent(content);

    incrementCheckCount().catch(() => {});
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Something went sideways on our end" }, { status: 500 });
  }
}
