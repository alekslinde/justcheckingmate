import { NextRequest, NextResponse } from "next/server";
import { getPublicReports, getPublicReportsCount } from "@/lib/reportStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "25", 10), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0);
  const type   = searchParams.get("type")  ?? undefined;
  const sort   = searchParams.get("sort") === "asc" ? "asc" as const : "desc" as const;
  const since  = searchParams.get("since") ? parseInt(searchParams.get("since")!, 10) : undefined;

  const [reports, total] = await Promise.all([
    getPublicReports({ limit, offset, type, sort, since }),
    getPublicReportsCount({ type, since }),
  ]);

  return NextResponse.json({ reports, total });
}
