"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/formatters";

interface Stats {
  checks: number;
  reports: number;
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const { checks, reports } = stats;
  if (checks === 0 && reports === 0) return null;

  return (
    <div className="flex items-center justify-center gap-6 text-sm text-gray-300 pb-1">
      <span>
        <span className="text-emerald-400 font-bold">{fmt(checks)}</span>
        {" "}scam{checks === 1 ? "" : "s"} checked
      </span>
      <span className="text-gray-600" aria-hidden="true">·</span>
      <span>
        <span className="text-emerald-400 font-bold">{fmt(reports)}</span>
        {" "}report{reports === 1 ? "" : "s"} submitted
      </span>
    </div>
  );
}
