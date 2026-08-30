"use client";

// The feed's shape at a glance: how much has been reported, how much of it is
// recent, and what kinds.
//
// Three figures then a breakdown, rather than the previous single "N reports
// total" line beside a sparkline. The old layout had a structural fault: the
// sparkline and the type breakdown were two grid columns, so a feed with no
// activity in the last 30 days — which is any quiet week, not just an edge case
// — rendered the breakdown in the left column and left the right half of the
// card visibly empty. Figures that are always present carry the top row now,
// and the chart appears below only when there is something to plot.

import { useEffect, useState } from "react";
import { FeedStats, countRecent } from "@/lib/reportStore";
import { useLang, MessageKey } from "@/lib/lang";
import { fmt } from "@/lib/formatters";

// Minimum reports before the trend chart is worth drawing. Below this the line
// carries no information and just looks broken.
const SPARKLINE_MIN = 10;

const TYPE_META: Record<string, { labelKey: MessageKey }> = {
  url:    { labelKey: "subs.type.url"    },
  sms:    { labelKey: "subs.type.sms"    },
  email:  { labelKey: "subs.type.email"  },
  phone:  { labelKey: "subs.type.phone"  },
  qr:     { labelKey: "subs.type.qr"     },
  custom: { labelKey: "subs.type.custom" },
};

/** One headline figure. Mono, because these are numbers to compare, not prose. */
function Figure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--ink-2)] px-4 py-3.5">
      <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
        {label}
      </p>
      <p
        className={`font-[family-name:var(--font-mono-ui)] text-[26px] leading-tight tabular-nums mt-1 ${
          // Amber marks the recent figure — it's the one that says "this is
          // live". Never red: red is the verdict colour. A zero is deliberately
          // not accented: amber is an attention colour, and colouring "0" with
          // it draws the eye to the one number that has nothing to say.
          accent ? "text-[var(--caution)]" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

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
  const first = pts[0].split(",");
  const last  = pts[pts.length - 1].split(",");
  const area  = `M${first[0]},${H} L${polyline} L${last[0]},${H} Z`;

  return (
    // Fills its panel rather than sitting at a fixed 36px: pinned to the
    // bottom of a taller panel the line read as a footer rule rather than a
    // chart, and the area fill had no room to show. preserveAspectRatio="none"
    // lets the viewBox stretch to whatever the panel gives it, which is what a
    // sparkline wants — the shape of the trend matters, not its proportions.
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full min-h-[52px]" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--clear)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--clear)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--clear)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TypeBars({ byType }: { byType: FeedStats["byType"] }) {
  const { t } = useLang();
  if (byType.length === 0) return null;

  const max = byType[0].count; // already sorted desc
  if (max === 0) return null;

  return (
    // Capped: six bars stretched across 1100px turn a compact comparison into a
    // set of very long lines whose differences are harder to read, not easier.
    <ul className="space-y-1.5 list-none max-w-[440px]" aria-label={t("subs.stats.breakdown")}>
      {byType.map(({ type, count }) => {
        const meta = TYPE_META[type];
        if (!meta) return null;
        const pct = Math.round((count / max) * 100);
        return (
          <li key={type} className="flex items-center gap-2.5 text-xs">
            <span className="w-24 shrink-0 text-[var(--text-dim)] truncate">{t(meta.labelKey)}</span>
            <div className="flex-1 bg-[var(--ink-3)] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[var(--clear)] rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-7 text-right tabular-nums text-[var(--faint)] shrink-0 font-[family-name:var(--font-mono-ui)]">
              {fmt(count)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function SubmissionsStats() {
  const { t } = useLang();
  const [stats, setStats] = useState<FeedStats | null>(null);
  // The clock is read once, when the data lands, rather than on every render:
  // reading it during render makes the output depend on when React happened to
  // re-run, which is both a hydration hazard and impossible to test.
  const [thisWeek, setThisWeek] = useState(0);

  useEffect(() => {
    fetch("/api/feed-stats")
      .then((r) => r.json())
      .then((data: FeedStats) => {
        setStats(data);
        setThisWeek(countRecent(data.byDay ?? [], Date.now()));
      })
      .catch(() => {});
  }, []);

  // Render nothing until data arrives or if the feed is completely empty.
  if (!stats || stats.total === 0) return null;

  const showChart = stats.total >= SPARKLINE_MIN && stats.byDay.length >= 2;

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)]">
      {/* Always three figures, always the same width: a row that changes shape
          with the data is harder to read across visits than one that sometimes
          shows a zero. A quiet week is information, not a gap to hide. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--rule)]">
        <Figure label={t("subs.stats.reports")} value={fmt(stats.total)} />
        <Figure label={t("subs.stats.week")} value={fmt(thisWeek)} accent={thisWeek > 0} />
        <Figure label={t("subs.stats.types")} value={fmt(stats.byType.length)} />
      </div>

      {stats.byType.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--rule)]">
          {stats.byType.length > 0 && (
            <div className="bg-[var(--ink-2)] px-4 py-3.5 space-y-2">
              <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
                {t("subs.stats.breakdown")}
              </p>
              <TypeBars byType={stats.byType} />
            </div>
          )}
          {/* The activity panel always renders, and says so when there is no
              trend to draw. An empty half of a card reads as something that
              failed to load; "nothing reported in the last 30 days" is the same
              fact stated deliberately, and it is a real thing to know about a
              feed of scam reports. */}
          <div className="bg-[var(--ink-2)] px-4 pt-3.5 pb-2.5 flex flex-col space-y-1.5">
            <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
              {t("subs.stats.activity")}
            </p>
            {showChart ? (
              <div className="flex-1 min-h-[52px]">
                <Sparkline byDay={stats.byDay} />
              </div>
            ) : (
              <p className="text-[13px] text-[var(--faint)] leading-relaxed">
                {t("subs.stats.quiet")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
