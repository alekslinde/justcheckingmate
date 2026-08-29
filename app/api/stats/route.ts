import { NextResponse } from "next/server";
import { getStats, getCheckEvents, type CheckSurface, type CheckOutcome } from "@/lib/reportStore";

// Days of history the breakdown covers when `?days=` is omitted. Four weeks is
// enough to read a weekly rate and see a trend.
const DEFAULT_DAYS = 28;
// Bounds the range scan and the response size on an unauthenticated route.
const MAX_DAYS = 90;
// Hard cap on returned rows regardless of the window. With three surfaces and
// three outcomes a day tops out at ~9 rows, so this is far above any honest
// payload while still bounding a table that has grown unexpectedly.
const MAX_DAILY_ROWS = 1000;

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

interface SurfaceSummary {
  surface: CheckSurface;
  // Verdicts that reached a person.
  delivered: number;
  // Forwards the email path accepted and tried to analyse. Recorded before
  // analysis runs, so this counts attempts, not successes. Always 0 for `web`.
  analysed: number;
  unknown: number;
}

/**
 * GET /api/stats
 *
 * Default response is unchanged and public: `{ checks, reports }` — the
 * lifetime totals StatsBar renders in the hero.
 *
 * `?breakdown=1` adds the per-surface aggregate. Opt-in so the public component
 * cannot start emitting operational detail by accident.
 *
 * **No rate is computed from these counts, deliberately.** `delivered` and
 * `analysed` are separate volumes written on different code paths under
 * independent rate-limit budgets — `delivered` exceeding `analysed` is normal,
 * and `web` never writes `analysed` at all. See `getCheckEvents` in
 * lib/reportStore.ts for why dividing them produces a number that looks
 * meaningful and isn't.
 */
export async function GET(request: Request) {
  const stats = await getStats();

  const url = new URL(request.url);
  if (url.searchParams.get("breakdown") !== "1") {
    return NextResponse.json(stats);
  }

  const rawDays = url.searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (rawDays !== null) {
    const parsed = Number(rawDays);
    // Reject rather than silently substitute: a caller asking for `days=0` or
    // `days=1.5` has a wrong assumption, and quietly returning 28 days of data
    // would hide it behind a plausible-looking response.
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAYS) {
      return NextResponse.json(
        { error: `days must be an integer between 1 and ${MAX_DAYS}` },
        { status: 400 },
      );
    }
    days = parsed;
  }

  // Inclusive lower bound: `days = 1` means today only.
  const since = dayKey(Date.now() - (days - 1) * 86_400_000);
  const rows = await getCheckEvents(since);

  const bySurface = new Map<CheckSurface, SurfaceSummary>();
  for (const row of rows) {
    const entry = bySurface.get(row.surface) ?? {
      surface: row.surface,
      delivered: 0,
      analysed: 0,
      unknown: 0,
    };
    const outcome: CheckOutcome = row.outcome;
    if (outcome === "delivered") entry.delivered += row.value;
    else if (outcome === "analysed") entry.analysed += row.value;
    else entry.unknown += row.value;
    bySurface.set(row.surface, entry);
  }

  const surfaces = [...bySurface.values()].sort(
    (a, b) => b.delivered - a.delivered || a.surface.localeCompare(b.surface),
  );

  const daily = rows.slice(0, MAX_DAILY_ROWS);

  return NextResponse.json({
    ...stats,
    breakdown: {
      // `since` is the first day counted, not the day the window was computed —
      // callers comparing two responses need the bound, not the request time.
      since,
      days,
      surfaces,
      // Raw rows so a caller can bucket by week itself; the summary above
      // collapses the day axis. `truncated` says the cap was hit, so a short
      // list is never mistaken for a quiet period.
      daily,
      truncated: rows.length > daily.length,
    },
  });
}
