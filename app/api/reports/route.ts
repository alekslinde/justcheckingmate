import { NextRequest, NextResponse } from "next/server";
import { getPublicReports, getPublicReportsCount, SortOption } from "@/lib/reportStore";
import { MOCK_REPORTS } from "@/lib/fixtures/mockReports";
import { isSameOriginRead } from "@/lib/readGuard";
import { checkAndRecordRateLimit, FEED_RATE_LIMIT } from "@/lib/reportStore";
import { clientIpFromHeaders } from "@/lib/geo";

const VALID_SORTS = new Set<SortOption>(["desc", "asc", "most", "least"]);

/**
 * Public submissions feed.
 *
 * The content is PII-scrubbed and already published at /submissions, so this is
 * not a confidentiality boundary. The controls below are about COST: every call
 * runs two queries (a page plus a count) against a free-tier database, and an
 * unthrottled feed is the cheapest way for someone to exhaust the row-read
 * budget and take the site down for everyone.
 *
 * Two layers, in cost order — reject before querying:
 *   1. Same-origin only. Stops another site's JavaScript and casual scripts.
 *      Forgeable by design (see isSameOriginRead); it is a filter, not a lock.
 *   2. Per-IP rate limit, which is what actually bounds a determined caller.
 */
export async function GET(req: NextRequest) {
  if (!isSameOriginRead(req.headers)) {
    return NextResponse.json(
      { error: "This endpoint serves the submissions page on this site.", code: "forbidden_origin" },
      { status: 403 },
    );
  }

  if (!checkAndRecordRateLimit(`feed:${clientIpFromHeaders(req.headers)}`, FEED_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests — give it a minute.", code: "rate_limited" },
      { status: 429 },
    );
  }

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

  // Cached at the edge, which is the control that actually reduces database
  // reads: the same feed page served to many visitors costs one query per
  // window rather than one per visitor. Short, because the feed is the
  // product's "what's going around" surface and stale entries read as broken.
  //
  // Deliberately not applied to the mock-data branch above — that is
  // development only, and caching it would hide fixture changes.
  return NextResponse.json(
    { reports: dbReports, total: dbTotal },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
