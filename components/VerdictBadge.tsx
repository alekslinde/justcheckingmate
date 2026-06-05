"use client";

import { CheckResult, PhoneIntel } from "@/lib/scamDetector";
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

const LINE_TYPE_META: Record<PhoneIntel["lineType"], { icon: string; label: string }> = {
  mobile:       { icon: "📱", label: "Mobile" },
  fixed:        { icon: "☎️",  label: "Fixed line" },
  voip_likely:  { icon: "🌐", label: "VoIP / virtual number (likely)" },
  premium:      { icon: "💸", label: "Premium rate" },
  freecall:     { icon: "📞", label: "Free call (1800)" },
  shared_cost:  { icon: "📞", label: "Shared cost (1300 / 13xx)" },
  emergency:    { icon: "🚨", label: "Emergency services" },
  unknown:      { icon: "❓", label: "Unknown" },
};

const SPOOFING_RISK_STYLE: Record<PhoneIntel["spoofingRisk"], { label: string; cls: string }> = {
  low:       { label: "Low",       cls: "text-green-400" },
  medium:    { label: "Moderate",  cls: "text-yellow-400" },
  high:      { label: "High",      cls: "text-orange-400" },
  very_high: { label: "Very High", cls: "text-red-400" },
};

function PhoneIntelPanel({ intel }: { intel: PhoneIntel }) {
  const lt = LINE_TYPE_META[intel.lineType];
  const risk = SPOOFING_RISK_STYLE[intel.spoofingRisk];

  return (
    <div className="border-t border-gray-700 pt-4 space-y-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Phone Intelligence</div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Line type</div>
          <div className="text-gray-200 text-xs">{lt.icon} {lt.label}</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Country</div>
          <div className="text-gray-200 text-xs">{intel.country}</div>
        </div>
        {intel.region && (
          <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-0.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Region</div>
            <div className="text-gray-200 text-xs">{intel.region}</div>
          </div>
        )}
        <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Spoofing risk</div>
          <div className={`font-semibold text-xs ${risk.cls}`}>{risk.label}</div>
        </div>
        {intel.normalised && intel.normalised !== intel.country && (
          <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-0.5 col-span-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Normalised</div>
            <div className="text-gray-200 text-xs font-mono">{intel.normalised}</div>
          </div>
        )}
      </div>

      {intel.wangiriRisk && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-xs text-red-300 space-y-1">
          <div className="font-bold">Wangiri Scam Warning</div>
          <p>You receive one ring, call back out of curiosity, and are charged international premium rates. <strong>Do not call back under any circumstances.</strong></p>
        </div>
      )}

      {/* Honest disclosure about tracing limits */}
      <div className="bg-gray-800/40 rounded-lg p-3 text-xs text-gray-500 space-y-1.5">
        <div className="font-semibold text-gray-400 flex items-center gap-1.5">
          <span aria-hidden="true">ℹ️</span> About caller ID tracing
        </div>
        <p>
          Caller ID can be spoofed freely — any number can be faked as the source. The real originating number lives in carrier signalling data (SS7/ANI) that is only accessible to telcos and law enforcement.{" "}
          <strong className="text-gray-400">No civilian tool can unmask a spoofed number.</strong>
        </p>
        <p>
          If you&apos;ve been scammed, report it to{" "}
          <span className="text-emerald-400">Scamwatch (scamwatch.gov.au)</span> and your telco — they can work with carriers to investigate and block the source.
        </p>
      </div>
    </div>
  );
}

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

      {result.phoneIntel && <PhoneIntelPanel intel={result.phoneIntel} />}
    </div>
  );
}
