import { NextRequest, NextResponse } from "next/server";
import { checkUrl, checkSms, checkEmail, checkPhone, checkCustom, ScamType } from "@/lib/scamDetector";
import { normaliseForAnalysis } from "@/lib/urlSanitizer";

// IMPORTANT: This route performs ONLY string analysis on the submitted content.
// It must NEVER make an outbound HTTP request, DNS lookup, or socket connection
// to any URL contained in the input. Doing so would notify the scammer's
// infrastructure that their link is under investigation. The CSP header
// (connect-src 'self') in next.config.ts enforces this at the browser layer;
// this comment is the server-side contract.

export async function POST(req: NextRequest) {
  try {
    const { type, content }: { type: ScamType; content: string } = await req.json();

    if (!type || !content?.trim()) {
      return NextResponse.json({ error: "Missing type or content" }, { status: 400 });
    }

    // For URL/QR types, normalise before analysis to close evasion tricks
    // (percent-encoded hostnames, mixed case, etc.) without touching the network.
    const analysisContent =
      type === "url" || type === "qr"
        ? normaliseForAnalysis(content)
        : content;

    let result;
    switch (type) {
      case "url":    result = checkUrl(analysisContent);    break;
      case "sms":    result = checkSms(analysisContent);    break;
      case "email":  result = checkEmail(analysisContent);  break;
      case "phone":  result = checkPhone(analysisContent);  break;
      case "qr":     result = checkUrl(analysisContent);    break;
      case "custom": result = checkCustom(analysisContent); break;
      default:
        return NextResponse.json({ error: "Unknown scam type" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Something went sideways on our end" }, { status: 500 });
  }
}
