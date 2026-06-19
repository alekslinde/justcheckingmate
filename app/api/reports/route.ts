import { NextRequest, NextResponse } from "next/server";
import { getPublicReports, getPublicReportsCount, SortOption } from "@/lib/reportStore";
import { MOCK_REPORTS } from "@/lib/fixtures/mockReports";

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

  const [dbReports, dbTotal] = await Promise.all([
    getPublicReports({ limit, offset, type, sort, since, search }),
    getPublicReportsCount({ type, since, search }),
  ]);

  // In development, fall back to mock data when the DB has no reports so the
  // submissions page is always populated for testing.
  if (process.env.NODE_ENV === "development" && dbTotal === 0) {
    let mock = MOCK_REPORTS;
    if (type && type !== "all") mock = mock.filter((r) => r.type === type);
    if (search) {
      const q = search.toLowerCase();
      mock = mock.filter((r) =>
        r.content.toLowerCase().includes(q) ||
        r.scamUrl.toLowerCase().includes(q) ||
        r.scamPhone.toLowerCase().includes(q) ||
        r.scamEmail.toLowerCase().includes(q),
      );
    }
    const total = mock.length;
    const reports = mock.slice(offset, offset + limit);
    return NextResponse.json({ reports, total });
  }

  return NextResponse.json({ reports: dbReports, total: dbTotal });
}
