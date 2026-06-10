"use client";

import { CheckResult, PhoneIntel } from "@/lib/scamDetector";
import { defangText } from "@/lib/urlSanitizer";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";

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

const LINE_TYPE_META: Record<PhoneIntel["lineType"], { icon: string; labelKey: MessageKey }> = {
  mobile:       { icon: "📱", labelKey: "phone.lineType.mobile" },
  fixed:        { icon: "☎️",  labelKey: "phone.lineType.fixed" },
  voip_likely:  { icon: "🌐", labelKey: "phone.lineType.voip" },
  premium:      { icon: "💸", labelKey: "phone.lineType.premium" },
  freecall:     { icon: "📞", labelKey: "phone.lineType.freecall" },
  shared_cost:  { icon: "📞", labelKey: "phone.lineType.shared" },
  emergency:    { icon: "🚨", labelKey: "phone.lineType.emergency" },
  unknown:      { icon: "❓", labelKey: "phone.lineType.unknown" },
};

const SPOOFING_RISK_STYLE: Record<PhoneIntel["spoofingRisk"], { labelKey: MessageKey; cls: string }> = {
  low:       { labelKey: "phone.risk.low",      cls: "text-green-400" },
  medium:    { labelKey: "phone.risk.medium",   cls: "text-yellow-400" },
  high:      { labelKey: "phone.risk.high",     cls: "text-orange-400" },
  very_high: { labelKey: "phone.risk.veryHigh", cls: "text-red-400" },
};

function PhoneIntelPanel({ intel }: { intel: PhoneIntel }) {
  const { t } = useLang();
  const lt   = LINE_TYPE_META[intel.lineType];
  const risk = SPOOFING_RISK_STYLE[intel.spoofingRisk];

  return (
    <div className="border-t border-gray-700 pt-4 space-y-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {t("phone.heading")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t("phone.type")}</div>
          <div className="text-gray-200 text-sm">{lt.icon} {t(lt.labelKey)}</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t("phone.country")}</div>
          <div className="text-gray-200 text-sm">{intel.country}</div>
        </div>
        {intel.region && (
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t("phone.area")}</div>
            <div className="text-gray-200 text-sm">{intel.region}</div>
          </div>
        )}
        <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t("phone.fakeRisk")}</div>
          <div className={`font-semibold text-sm ${risk.cls}`}>{t(risk.labelKey)}</div>
        </div>
        {intel.normalised && (
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-0.5 col-span-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t("phone.formatted")}</div>
            <div className="text-gray-200 text-sm font-mono">{intel.normalised}</div>
          </div>
        )}
      </div>

      {intel.wangiriRisk && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300 space-y-1">
          <div className="font-bold">{t("phone.wangiri.title")}</div>
          <p>{bold(t("phone.wangiri.body"))}</p>
        </div>
      )}

      <div className="bg-gray-800/40 rounded-lg p-3 text-sm text-gray-400 space-y-1.5">
        <div className="font-semibold text-gray-300 flex items-center gap-1.5">
          <span aria-hidden="true">ℹ️</span> {t("phone.spoof.title")}
        </div>
        <p>{t("phone.spoof.body")}</p>
        <p>
          {t("phone.spoof.report.pre")}{" "}
          <a
            href="https://www.scamwatch.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            Scamwatch (scamwatch.gov.au)<span className="sr-only"> ({t("a11y.newTab")})</span><span aria-hidden="true"> ↗</span>
          </a>{" "}
          {t("phone.spoof.report.post")}
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

      {/* Risk bar — a static measurement, so meter (not progressbar) semantics */}
      <div className="space-y-1">
        <div
          role="meter"
          aria-valuenow={result.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("verdict.riskScore", { n: result.score })}
          className="w-full bg-gray-800 rounded-full h-2.5"
        >
          <div
            className={`${v.bar} h-2.5 rounded-full transition-[width] duration-500`}
            style={{ width: `${result.score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500" aria-hidden="true">
          <span>{t("verdict.lowRisk")}</span>
          <span>{t("verdict.riskScore", { n: result.score })}</span>
          <span>{t("verdict.highRisk")}</span>
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
