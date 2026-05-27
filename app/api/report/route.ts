import { NextRequest, NextResponse } from "next/server";
import { guardSubmission } from "@/lib/submissionGuard";
import { generateReportId, storeReport, getStats } from "@/lib/reportStore";

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

  const guardResult = guardSubmission({
    type: String(body.type ?? ""),
    content: rawContent,
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

  storeReport(
    {
      id: reportId,
      type: String(body.type ?? ""),
      content: rawContent.slice(0, 2000),
      description: String(body.description ?? "").slice(0, 1000),
      contact: String(body.contact ?? "").slice(0, 200),
      submittedAt: Date.now(),
      ip: getClientIp(req),
    },
    guardResult.verdict === "suspect",
  );

  return NextResponse.json({ success: true, reportId });
}

export async function GET() {
  return NextResponse.json(getStats());
}
