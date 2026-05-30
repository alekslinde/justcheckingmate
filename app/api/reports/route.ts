import { NextRequest, NextResponse } from "next/server";
import { getPublicReports, getPublicReportsCount, SortOption } from "@/lib/reportStore";

const VALID_SORTS = new Set<SortOption>(["desc", "asc", "most", "least"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "25", 10), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0);
  const type   = searchParams.get("type")   ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const since  = searchParams.get("since")  ? parseInt(searchParams.get("since")!, 10) : undefined;
  const sortRaw = searchParams.get("sort") ?? "desc";
  const sort: SortOption = VALID_SORTS.has(sortRaw as SortOption) ? sortRaw as SortOption : "desc";

  const [reports, total] = await Promise.all([
    getPublicReports({ limit, offset, type, sort, since, search }),
    getPublicReportsCount({ type, since, search }),
  ]);

  return NextResponse.json({ reports, total });
}
