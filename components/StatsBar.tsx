"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/formatters";
import { useLang } from "@/lib/lang";

interface Stats {
  checks: number;
  reports: number;
}

/**
 * `initial` is the same data /api/stats returns, resolved during the server
 * render that was happening anyway.
 *
 * The homepage is `force-dynamic` (region comes from request headers), so it
 * already runs a function per visit. Fetching the counters there and passing
 * them down turns two invocations per visit into one — which matters on a free
 * tier where invocations, not correctness, are the binding limit.
 *
 * Optional rather than required, and the client fetch is kept as the fallback:
 * a caller that cannot resolve stats server-side (or a render where the DB is
 * unreachable) still gets working numbers rather than a permanently empty bar.
 * The two paths return the same shape, so there is no second format to keep in
 * step.
 */
export default function StatsBar({ initial }: { initial?: Stats | null } = {}) {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(initial ?? null);

  useEffect(() => {
    // Skip the request entirely when the server already supplied the numbers.
    // This is the whole saving — an unconditional fetch here would keep the
    // second invocation and make the prop pointless.
    if (initial) return;
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [initial]);

  const empty = !stats || (stats.checks === 0 && stats.reports === 0);

  // The container always renders at full height so the hero doesn't shift
  // when the numbers arrive (or never do).
  return (
    <div className="flex items-center gap-6 text-sm text-[var(--text-dim)] pb-1 min-h-[1.75rem]">
      {!empty && (
        <>
          <span>
            <span className="text-emerald-400 font-bold">{fmt(stats.checks)}</span>
            {" "}{t(stats.checks === 1 ? "stats.checked.one" : "stats.checked.many")}
          </span>
          <span className="text-gray-600" aria-hidden="true">·</span>
          <span>
            <span className="text-emerald-400 font-bold">{fmt(stats.reports)}</span>
            {" "}{t(stats.reports === 1 ? "stats.reported.one" : "stats.reported.many")}
          </span>
        </>
      )}
    </div>
  );
}
