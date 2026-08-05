"use client";

import { useLang } from "@/lib/lang";
import type { RegionCoverage } from "@/lib/regions";

// Shown when the region pack that ran has less than full detection coverage.
//
// The point is honesty about what we did and didn't check: a low score under
// partial coverage can mean "no rule matched because no rule exists". The
// checkers already downgrade "safe" to "unknown" in that case; this explains
// why, and — per the project's teach-don't-just-block value — hands the user
// the patterns to judge it themselves.
//
// Deliberately not styled as an alarm: this is a statement about our coverage,
// not a finding about their message.
export default function CoverageNotice({ coverage }: { coverage: RegionCoverage }) {
  const { t } = useLang();
  if (coverage === "full") return null;

  const tips = [
    t("verdict.coverage.tip1"),
    t("verdict.coverage.tip2"),
    t("verdict.coverage.tip3"),
    t("verdict.coverage.tip4"),
  ];

  return (
    <div className="rounded-lg border border-sky-900/60 bg-sky-950/30 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 text-lg leading-none mt-0.5" aria-hidden="true">🌏</span>
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-sky-300">{t("verdict.coverage.title")}</p>
          <p className="text-sm text-gray-300">{t("verdict.coverage.body")}</p>
          <p className="text-sm font-medium text-gray-200">{t("verdict.coverage.advice")}</p>
        </div>
      </div>

      <div className="border-t border-sky-900/50 pt-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {t("verdict.coverage.learn")}
        </p>
        <ul className="space-y-1">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="shrink-0 text-sky-400 mt-0.5" aria-hidden="true">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
