"use client";

import { CheckResult } from "@/lib/scamDetector";
import { defangText } from "@/lib/urlSanitizer";
import { useLang, MessageKey } from "@/lib/lang";

// Icon/colour styling per verdict; the label/sub copy comes from the message
// dictionaries (keys verdict.<verdict>.label / .sub).
const VERDICTS = {
  safe:        { icon: "✅", bg: "bg-green-900/40",  border: "border-green-700",  text: "text-green-400",  bar: "bg-green-500" },
  suspicious:  { icon: "⚠️", bg: "bg-yellow-900/40", border: "border-yellow-700", text: "text-yellow-400", bar: "bg-yellow-500" },
  likely_scam: { icon: "🚨", bg: "bg-red-900/40",    border: "border-red-700",    text: "text-red-400",    bar: "bg-red-500" },
  unknown:     { icon: "🤷", bg: "bg-gray-800",      border: "border-gray-600",   text: "text-gray-300",   bar: "bg-gray-500" },
};

export default function VerdictBadge({ result }: { result: CheckResult }) {
  const { t } = useLang();
  const v = VERDICTS[result.verdict];
  const label = t(`verdict.${result.verdict}.label` as MessageKey);
  const sub = t(`verdict.${result.verdict}.sub` as MessageKey);

  return (
    <div className={`${v.bg} border ${v.border} rounded-xl p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">{v.icon}</span>
          <div>
            <div className={`font-bold text-lg ${v.text}`}>{label}</div>
            <div className="text-sm text-gray-300 italic">&ldquo;{sub}&rdquo;</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black ${v.text}`} aria-hidden="true">{result.score}</div>
          <div className="text-sm text-gray-400">Risk Score</div>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={result.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Risk score: ${result.score} out of 100`}
        className="w-full bg-gray-800 rounded-full h-2"
      >
        <div
          className={`${v.bar} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${result.score}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-gray-400" aria-hidden="true">
        <span>Low risk</span>
        <span>High risk</span>
      </div>

      <p className="text-sm text-gray-300 border-t border-gray-700 pt-3">
        {defangText(result.details)}
      </p>
    </div>
  );
}
