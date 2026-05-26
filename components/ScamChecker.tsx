"use client";

import { useState } from "react";
import { CheckResult, ScamType } from "@/lib/scamDetector";
import VerdictBadge from "./VerdictBadge";
import PoisonPanel from "./PoisonPanel";

const SCAM_TYPES: { value: ScamType; label: string; placeholder: string; icon: string }[] = [
  { value: "url",    label: "Dodgy Link",    icon: "🔗", placeholder: "Paste the sus URL in here, e.g. https://my-g0v-ato-login.tk/verify" },
  { value: "sms",    label: "Suss Text/SMS", icon: "📱", placeholder: "Paste the whole text message in here..." },
  { value: "email",  label: "Phishing Email",icon: "📧", placeholder: "Paste the email content (From: ..., Subject: ..., Body: ...)..." },
  { value: "phone",  label: "Scam Number",   icon: "📞", placeholder: "Enter the phone number, e.g. +61 412 345 678 or +1 202 555 0123" },
  { value: "qr",     label: "QR Code Link",  icon: "📷", placeholder: "Paste the URL your QR code points to..." },
  { value: "custom", label: "Something Else",icon: "🤔", placeholder: "Describe it or paste it in — we'll do our best, mate..." },
];

export default function ScamChecker() {
  const [scamType, setScamType] = useState<ScamType>("url");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPoison, setShowPoison] = useState(false);

  const selectedType = SCAM_TYPES.find((t) => t.value === scamType)!;

  async function handleCheck() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowPoison(false);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: scamType, content }),
      });
      if (!res.ok) throw new Error("Server said nah");
      const data: CheckResult = await res.json();
      setResult(data);
    } catch {
      setError("Strewth, something went wrong on our end. Give it another crack.");
    } finally {
      setLoading(false);
    }
  }

  const isScam = result && (result.verdict === "likely_scam" || result.verdict === "suspicious");

  return (
    <div className="space-y-6">
      {/* Type selector */}
      <div>
        <label className="block text-sm font-semibold text-amber-400 mb-2 uppercase tracking-wider">
          What are ya checking?
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCAM_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setScamType(t.value); setResult(null); setShowPoison(false); setError(null); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                scamType === t.value
                  ? "bg-amber-500 border-amber-400 text-gray-900"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div>
        <label className="block text-sm font-semibold text-amber-400 mb-2 uppercase tracking-wider">
          {selectedType.icon} {selectedType.label}
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={selectedType.placeholder}
          rows={scamType === "url" || scamType === "phone" ? 2 : 5}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-y text-sm font-mono"
        />
        {scamType === "custom" && (
          <p className="mt-1 text-xs text-gray-500">
            No worries if it doesn&apos;t fit a category — just describe it or paste whatever you&apos;ve got.
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleCheck}
        disabled={loading || !content.trim()}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-bold rounded-lg transition-all text-base uppercase tracking-wide"
      >
        {loading ? "Checking it out..." : "Just Checking, Mate! 🔍"}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <VerdictBadge result={result} />

          {/* Flags */}
          {result.flags.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
                Red Flags Spotted
              </h3>
              <ul className="space-y-2">
                {result.flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Poison data button — only show for suspicious/scam results */}
          {isScam && (
            <div className="bg-gray-900 border border-amber-900/50 rounded-lg p-4">
              <h3 className="text-sm font-bold text-amber-400 mb-1">
                🧨 Give &apos;em the Runaround?
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Reckon it&apos;s a scammer? We can generate a full fake Aussie identity — completely made-up but dead realistic — to feed back to them. Wastes their time, stuffs up their data, and throws off their whole setup.
              </p>
              <button
                onClick={() => setShowPoison(!showPoison)}
                className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/50 text-amber-400 text-sm font-semibold rounded-lg transition-all"
              >
                {showPoison ? "Hide Poison Data" : "Generate Poison Data 💉"}
              </button>
            </div>
          )}

          {showPoison && <PoisonPanel />}
        </div>
      )}
    </div>
  );
}
