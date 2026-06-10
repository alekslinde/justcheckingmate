"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/formatters";
import { useLang } from "@/lib/lang";

interface Stats {
  checks: number;
  reports: number;
}

export default function StatsBar() {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const empty = !stats || (stats.checks === 0 && stats.reports === 0);

  // The container always renders at full height so the hero doesn't shift
  // when the numbers arrive (or never do).
  return (
    <div className="flex items-center justify-center gap-6 text-sm text-gray-300 pb-1 min-h-[1.75rem]">
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
