"use client";

import { CheckResult, PhoneIntel } from "@/lib/scamDetector";
import { defangText } from "@/lib/urlSanitizer";
import { useLang, MessageKey } from "@/lib/lang";

const VERDICTS = {
  safe:        { icon: "✅", bg: "bg-green-900/40",  border: "border-green-700",  text: "text-green-400",  bar: "bg-green-500" },
  suspicious:  { icon: "⚠️", bg: "bg-yellow-900/40", border: "border-yellow-700", text: "text-yellow-400", bar: "bg-yellow-500" },
  likely_scam: { icon: "🚨", bg: "bg-red-900/40",    border: "border-red-700",    text: "text-red-400",    bar: "bg-red-500" },
  unknown:     { icon: "🤷", bg: "bg-gray-800",      border: "border-gray-600",   text: "text-gray-300",   bar: "bg-gray-500" },
};

// ── Action steps shown for actionable verdicts ────────────────────────────────

function ActionSteps({ verdict }: { verdict: "suspicious" | "likely_scam" }) {
  const { t } = useLang();
  const heading = t(`verdict.${verdict}.nextSteps` as MessageKey);
  const steps =
    verdict === "likely_scam"
      ? [
          t("verdict.likely_scam.step1"),
          t("verdict.likely_scam.step2"),
          t("verdict.likely_scam.step3"),
          t("verdict.likely_scam.step4"),
        ]
      : [
          t("verdict.suspicious.step1"),
          t("verdict.suspicious.step2"),
          t("verdict.suspicious.step3"),
        ];

  const accentCls = verdict === "likely_scam" ? "text-red-400" : "text-yellow-400";
  const bgCls     = verdict === "likely_scam"
    ? "bg-red-950/40 border-red-900/60"
    : "bg-yellow-950/30 border-yellow-900/60";

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${bgCls}`}>
      <p className={`text-sm font-bold ${accentCls}`}>{heading}</p>
      <ol className="space-y-1.5 list-none">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-100">
            <span className={`shrink-0 font-bold ${accentCls}`} aria-hidden="true">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Phone intelligence panel ──────────────────────────────────────────────────

const LINE_TYPE_META: Record<PhoneIntel["lineType"], { icon: string; label: string }> = {
  mobile:       { icon: "📱", label: "Mobile phone" },
  fixed:        { icon: "☎️",  label: "Fixed landline" },
  voip_likely:  { icon: "🌐", label: "Internet phone (easy to fake)" },
  premium:      { icon: "💸", label: "Premium rate — costs extra to call" },
  freecall:     { icon: "📞", label: "Free call (1800)" },
  shared_cost:  { icon: "📞", label: "Shared cost (1300 / 13xx)" },
  emergency:    { icon: "🚨", label: "Emergency services" },
  unknown:      { icon: "❓", label: "Unknown type" },
};

const SPOOFING_RISK_STYLE: Record<PhoneIntel["spoofingRisk"], { label: string; cls: string }> = {
  low:       { label: "Low",                cls: "text-green-400" },
  medium:    { label: "Moderate",           cls: "text-yellow-400" },
  high:      { label: "High",               cls: "text-orange-400" },
  very_high: { label: "Very likely fake",   cls: "text-red-400" },
};

function PhoneIntelPanel({ intel }: { intel: PhoneIntel }) {
  const lt   = LINE_TYPE_META[intel.lineType];
  const risk = SPOOFING_RISK_STYLE[intel.spoofingRisk];

  return (
    <div className="border-t border-gray-700 pt-4 space-y-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        Phone details
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Type</div>
          <div className="text-gray-200 text-sm">{lt.icon} {lt.label}</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Country</div>
          <div className="text-gray-200 text-sm">{intel.country}</div>
        </div>
        {intel.region && (
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Area</div>
            <div className="text-gray-200 text-sm">{intel.region}</div>
          </div>
        )}
        <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Fake number risk</div>
          <div className={`font-semibold text-sm ${risk.cls}`}>{risk.label}</div>
        </div>
        {intel.normalised && (
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5 col-span-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Number (formatted)</div>
            <div className="text-gray-200 text-sm font-mono">{intel.normalised}</div>
          </div>
        )}
      </div>

      {intel.wangiriRisk && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300 space-y-1">
          <div className="font-bold">One-ring scam warning</div>
          <p>
            Scammers call once and hang up. When you call back you&apos;re charged international
            premium rates. <strong>Do not call back under any circumstances.</strong>
          </p>
        </div>
      )}

      <div className="bg-gray-800/40 rounded-lg p-3 text-sm text-gray-400 space-y-1.5">
        <div className="font-semibold text-gray-300 flex items-center gap-1.5">
          <span aria-hidden="true">ℹ️</span> Can scammers fake a phone number?
        </div>
        <p>
          Yes — scammers can display any number they want as the caller ID. It costs them
          nothing and is very common. The real source is only known to the phone company
          and can only be traced by police.
        </p>
        <p>
          If you&apos;ve been scammed, report it to{" "}
          <span className="text-emerald-400">Scamwatch (scamwatch.gov.au)</span>{" "}
          and your telco — they can help trace and block the source.
        </p>
      </div>
    </div>
  );
}

// ── Main badge ────────────────────────────────────────────────────────────────

export default function VerdictBadge({ result }: { result: CheckResult }) {
  const { t } = useLang();
  const v     = VERDICTS[result.verdict];
  const label = t(`verdict.${result.verdict}.label` as MessageKey);
  const sub   = t(`verdict.${result.verdict}.sub`   as MessageKey);

  return (
    <div className={`${v.bg} border ${v.border} rounded-xl p-5 space-y-4`}>

      {/* Header: icon + verdict + sub-label (no raw score in primary position) */}
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">{v.icon}</span>
        <div>
          <div className={`font-bold text-lg ${v.text}`}>{label}</div>
          <div className="text-sm text-gray-300">{sub}</div>
        </div>
      </div>

      {/* Risk bar — score relegated to small label alongside it */}
      <div className="space-y-1">
        <div
          role="progressbar"
          aria-valuenow={result.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Risk score: ${result.score} out of 100`}
          className="w-full bg-gray-800 rounded-full h-2.5"
        >
          <div
            className={`${v.bar} h-2.5 rounded-full transition-[width] duration-500`}
            style={{ width: `${result.score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500" aria-hidden="true">
          <span>Low risk</span>
          <span>Risk score: {result.score}/100</span>
          <span>High risk</span>
        </div>
      </div>

      {/* Action steps for verdicts that need them */}
      {(result.verdict === "likely_scam" || result.verdict === "suspicious") && (
        <ActionSteps verdict={result.verdict} />
      )}

      {/* Details — secondary, below the action steps */}
      <p className="text-sm text-gray-400 border-t border-gray-700/50 pt-3">
        {defangText(result.details)}
      </p>

      {/* Warning flags */}
      {result.flags.length > 0 && (
        <div className="space-y-1.5">
          {result.flags.map((flag, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true">⚑</span>
              <span>{defangText(flag)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Phone intelligence panel */}
      {result.phoneIntel && <PhoneIntelPanel intel={result.phoneIntel} />}
    </div>
  );
}
