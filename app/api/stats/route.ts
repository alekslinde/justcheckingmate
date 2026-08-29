import { NextResponse } from "next/server";
import { getStats, getCheckEvents, type CheckSurface } from "@/lib/reportStore";

// Days of history the breakdown covers when `?days=` is omitted. Four weeks is
// enough to read a weekly rate and see a trend without returning a payload that
// grows without bound as the table fills.
const DEFAULT_DAYS = 28;
const MAX_DAYS = 365;

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

interface SurfaceSummary {
  surface: CheckSurface;
  delivered: number;
  analysed: number;
  // Share of analysed checks that reached a person. Null rather than 0 when
  // nothing was analysed, so "no data" is not rendered as "0% success".
  deliveredRate: number | null;
}

/**
 * GET /api/stats
 *
 * Default response is unchanged and public: `{ checks, reports }` — the
 * lifetime totals StatsBar renders in the hero.
 *
 * `?breakdown=1` adds the per-surface aggregate. It is opt-in specifically so
 * the public component cannot start emitting operational detail by accident,
 * and so this route's default payload stays the same shape it has always been.
 */
export async function GET(request: Request) {
  const stats = await getStats();

  const url = new URL(request.url);
  if (url.searchParams.get("breakdown") !== "1") {
    return NextResponse.json(stats);
  }

  const requested = Number(url.searchParams.get("days"));
  const days =
    Number.isFinite(requested) && requested >= 1
      ? Math.min(Math.floor(requested), MAX_DAYS)
      : DEFAULT_DAYS;

  // Inclusive lower bound: `days = 1` means today only.
  const since = dayKey(Date.now() - (days - 1) * 86_400_000);
  const rows = await getCheckEvents(since);

  const bySurface = new Map<CheckSurface, SurfaceSummary>();
  for (const row of rows) {
    const entry = bySurface.get(row.surface) ?? {
      surface: row.surface,
      delivered: 0,
      analysed: 0,
      deliveredRate: null,
    };
    if (row.outcome === "delivered") entry.delivered += row.value;
    else entry.analysed += row.value;
    bySurface.set(row.surface, entry);
  }

  const surfaces = [...bySurface.values()].map((s) => ({
    ...s,
    deliveredRate: s.analysed > 0 ? s.delivered / s.analysed : null,
  }));
  surfaces.sort((a, b) => b.delivered - a.delivered || a.surface.localeCompare(b.surface));

  return NextResponse.json({
    ...stats,
    breakdown: {
      // `since` is the first day counted, not the day the window was computed —
      // callers comparing two responses need the bound, not the request time.
      since,
      days,
      surfaces,
      // Raw rows so a caller can bucket by week itself; the summary above
      // deliberately collapses the day axis.
      daily: rows,
    },
  });
}
