"use client";

import { CheckResult } from "@/lib/scamDetector";
import { defangText } from "@/lib/urlSanitizer";
import { useLang } from "@/lib/lang";

const VERDICTS = {
  safe: {
    normal: { label: "Looks Good",                  sub: "You can breathe easy — no red flags found." },
    aussie: { label: "Looks Alright, Mate",          sub: "She's apples!" },
    icon: "✅",
    bg: "bg-green-900/40", border: "border-green-700", text: "text-green-400", bar: "bg-green-500",
  },
  suspicious: {
    normal: { label: "Proceed with Caution",         sub: "Worth being careful — something feels off." },
    aussie: { label: "Something's a Bit Off",        sub: "Bit sus, wouldn't trust it." },
    icon: "⚠️",
    bg: "bg-yellow-900/40", border: "border-yellow-700", text: "text-yellow-400", bar: "bg-yellow-500",
  },
  likely_scam: {
    normal: { label: "Likely a Scam — Do Not Engage", sub: "Don't engage. Block the sender and report it." },
    aussie: { label: "Scam Alert — Don't Touch It",   sub: "Bloody scammers! Delete and block." },
    icon: "🚨",
    bg: "bg-red-900/40", border: "border-red-700", text: "text-red-400", bar: "bg-red-500",
  },
  unknown: {
    normal: { label: "Unable to Determine",          sub: "Not enough to go on — trust your instincts." },
    aussie: { label: "Couldn't Work It Out",         sub: "Not enough to go on, mate." },
    icon: "🤷",
    bg: "bg-gray-800", border: "border-gray-600", text: "text-gray-300", bar: "bg-gray-500",
  },
};

export default function VerdictBadge({ result }: { result: CheckResult }) {
  const { mode } = useLang();
  const v = VERDICTS[result.verdict];
  const copy = v[mode];

  return (
    <div className={`${v.bg} border ${v.border} rounded-xl p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">{v.icon}</span>
          <div>
            <div className={`font-bold text-lg ${v.text}`}>{copy.label}</div>
            <div className="text-sm text-gray-300 italic">&ldquo;{copy.sub}&rdquo;</div>
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
