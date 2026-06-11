"use client";

import { useEffect, useState } from "react";
import { FeedStats } from "@/lib/reportStore";
import { useLang, MessageKey } from "@/lib/lang";
import { fmt } from "@/lib/formatters";

// Minimum reports before we bother showing charts at all. Below this threshold
// the visuals carry no information and just look broken.
const SPARKLINE_MIN = 10;

const TYPE_META: Record<string, { icon: string; labelKey: MessageKey }> = {
  url:    { icon: "🔗", labelKey: "subs.type.url"    },
  sms:    { icon: "📱", labelKey: "subs.type.sms"    },
  email:  { icon: "📧", labelKey: "subs.type.email"  },
  phone:  { icon: "📞", labelKey: "subs.type.phone"  },
  qr:     { icon: "📷", labelKey: "subs.type.qr"     },
  custom: { icon: "🤔", labelKey: "subs.type.custom" },
};

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ byDay }: { byDay: FeedStats["byDay"] }) {
  if (byDay.length < 2) return null;

  const W = 200;
  const H = 36;
  const PAD = 2;

  const max = Math.max(...byDay.map((d) => d.count));
  if (max === 0) return null;

  // Map each day to an (x, y) point; days are already sorted ASC from the API.
  const pts = byDay.map((d, i) => {
    const x = PAD + (i / (byDay.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - d.count / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = pts.join(" ");
  // Close the area path under the line
  const first = pts[0].split(",");
  const last  = pts[pts.length - 1].split(",");
  const area  = `M${first[0]},${H} L${polyline.replace(/(\S+),(\S+)/g, "$1,$2")} L${last[0]},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-9"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <polyline
        points={polyline}
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Type bars ─────────────────────────────────────────────────────────────────

function TypeBars({ byType }: { byType: FeedStats["byType"] }) {
  const { t } = useLang();
  if (byType.length === 0) return null;

  const max = byType[0].count; // already sorted desc
  if (max === 0) return null;

  return (
    <ul className="space-y-1.5" aria-label={t("subs.stats.breakdown")}>
      {byType.map(({ type, count }) => {
        const meta = TYPE_META[type];
        if (!meta) return null;
        const pct = Math.round((count / max) * 100);
        return (
          <li key={type} className="flex items-center gap-2 text-xs">
            <span className="w-4 shrink-0 text-center" aria-hidden="true">{meta.icon}</span>
            <span className="w-24 shrink-0 text-gray-400 truncate">{t(meta.labelKey)}</span>
            <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-7 text-right tabular-nums text-gray-500 shrink-0">{fmt(count)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SubmissionsStats() {
  const { t } = useLang();
  const [stats, setStats] = useState<FeedStats | null>(null);

  useEffect(() => {
    fetch("/api/feed-stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  // Render nothing until data arrives or if the DB is completely empty.
  if (!stats || stats.total === 0) return null;

  const showCharts = stats.total >= SPARKLINE_MIN;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Total count header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {t("subs.stats.activity")}
        </span>
        <span className="text-sm font-bold tabular-nums text-emerald-400">
          {t(stats.total === 1 ? "subs.stats.total.one" : "subs.stats.total.many", {
            n: fmt(stats.total),
          })}
        </span>
      </div>

      {showCharts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-800">
          {/* Sparkline panel */}
          {stats.byDay.length >= 2 && (
            <div className="bg-gray-900 px-4 pt-3 pb-2 space-y-1">
              <Sparkline byDay={stats.byDay} />
            </div>
          )}

          {/* Type breakdown panel */}
          {stats.byType.length > 0 && (
            <div className="bg-gray-900 px-4 py-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {t("subs.stats.breakdown")}
              </p>
              <TypeBars byType={stats.byType} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
