import { NextRequest, NextResponse } from "next/server";
import { getPublicReports } from "@/lib/reportStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  return NextResponse.json({ reports: await getPublicReports(limit) });
}
