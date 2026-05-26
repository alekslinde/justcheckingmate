"use client";

import { useState } from "react";
import { ScamType } from "@/lib/scamDetector";
import { PoisonFeedback } from "@/lib/poisonFeedback";

const INPUT_TYPES: { value: ScamType; label: string }[] = [
  { value: "url",    label: "Link / URL" },
  { value: "email",  label: "Email content" },
  { value: "sms",    label: "SMS / Text" },
  { value: "phone",  label: "Phone number" },
  { value: "qr",     label: "QR code URL" },
  { value: "custom", label: "Other content" },
];

const VERDICT_CONFIG = {
  legitimate: {
    label: "Legitimate — passes checks",
    icon: "✅",
    color: "text-green-400",
    bg: "bg-green-900/30",
    border: "border-green-800",
    bar: "bg-green-500",
    scoreColor: "text-green-400",
  },
  minor_issues: {
    label: "Minor issues — address before launch",
    icon: "🔧",
    color: "text-yellow-400",
    bg: "bg-yellow-900/20",
    border: "border-yellow-800",
    bar: "bg-yellow-500",
    scoreColor: "text-yellow-400",
  },
  needs_work: {
    label: "Needs work — likely to be flagged",
    icon: "⚠️",
    color: "text-orange-400",
    bg: "bg-orange-900/20",
    border: "border-orange-800",
    bar: "bg-orange-500",
    scoreColor: "text-orange-400",
  },
};

export default function LegitimacyTester() {
  const [type, setType] = useState<ScamType>("email");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<PoisonFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/legitimacy-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content }),
      });
      if (!res.ok) throw new Error("Server error");
      setResult(await res.json());
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const cfg = result ? VERDICT_CONFIG[result.verdict] : null;

  return (
    <div className="space-y-5">
      {/* Type selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Content type
        </label>
        <div className="flex flex-wrap gap-2">
          {INPUT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setType(t.value); setResult(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                type === t.value
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Paste your content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the content you want to check for legitimacy..."
          rows={type === "url" || type === "phone" ? 2 : 5}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-y text-sm font-mono"
        />
      </div>

      <button
        onClick={handleCheck}
        disabled={loading || !content.trim()}
        className="w-full py-3 px-6 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold rounded-lg transition-all text-sm uppercase tracking-wide"
      >
        {loading ? "Analysing..." : "Run Legitimacy Check"}
      </button>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && cfg && (
        <div className="space-y-4 animate-in fade-in duration-300">

          {/* Score card */}
          <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{cfg.icon}</span>
                <span className={`font-bold ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-black ${cfg.scoreColor}`}>{result.legitimacyScore}</div>
                <div className="text-xs text-gray-500">Legitimacy Score</div>
              </div>
            </div>
            <div className="w-full bg-gray-900 rounded-full h-2 mb-3">
              <div
                className={`${cfg.bar} h-2 rounded-full transition-all duration-700`}
                style={{ width: `${result.legitimacyScore}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mb-3">
              <span>Likely flagged</span>
              <span>Passes all checks</span>
            </div>
            <p className="text-sm text-gray-300">{result.summary}</p>
          </div>

          {/* Passed checks */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span>✓</span> Passed Checks
            </h3>
            <ul className="space-y-1.5">
              {result.passedChecks.map((check, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-green-500 shrink-0 text-xs">●</span>
                  {check}
                </li>
              ))}
            </ul>
          </div>

          {/* Issues */}
          {result.falseIssues.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span>⚠</span> Issues Detected
              </h3>
              <ul className="space-y-1.5">
                {result.falseIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-yellow-500 shrink-0 text-xs mt-1">●</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tips */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span>💡</span> Improvement Tips
            </h3>
            <ul className="space-y-2">
              {result.improvementTips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-blue-500 shrink-0 font-bold mt-0">{i + 1}.</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleCheck}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Re-run check ↺
          </button>
        </div>
      )}
    </div>
  );
}
