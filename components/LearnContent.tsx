"use client";

import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";
import { AUTH_LEGEND, StaticAuthPill } from "@/components/AuthBadges";

const SCAM_TYPE_ICONS = ["🔗", "📱", "📧", "📞", "📷"];
const TACTIC_ICONS = ["⏰", "🎭", "🎁", "🔐", "💸", "❤️"];
const SOURCE_ICONS = ["📱", "📧", "📞", "🛒", "🔎", "💬"];
const FLAG_ICONS = ["🏦", "⏰", "🎁", "🔗", "📱", "💳", "📞", "📎"];

const AGENCIES = [
  { name: "Scamwatch (ACCC)", abbr: null, site: "scamwatch.gov.au", href: "https://www.scamwatch.gov.au" },
  { name: "ReportCyber", abbr: "Australian Signals Directorate", site: "cyber.gov.au/report", href: "https://www.cyber.gov.au/report" },
  { name: "IDCARE (ID theft)", abbr: null, site: "idcare.org", href: "https://www.idcare.org" },
  { name: "ACSC", abbr: "Australian Cyber Security Centre", site: "cyber.gov.au", href: "https://www.cyber.gov.au" },
];

const SECTION = "bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

const key = (k: string) => k as MessageKey;

export default function LearnContent() {
  const { t } = useLang();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">{t("learn.title")}</h1>
        <p className="text-sm text-gray-400">{t("learn.intro")}</p>
      </div>

      {/* What this tool checks */}
      <section className={SECTION}>
        <h2 className={H2}>{t("learn.types.heading")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCAM_TYPE_ICONS.map((icon, i) => (
            <div key={i} className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span aria-hidden="true">{icon}</span>
                <span className="text-sm font-medium text-gray-200">{t(key(`learn.types.${i + 1}.label`))}</span>
              </div>
              <p className="text-xs text-gray-500">{t(key(`learn.types.${i + 1}.desc`))}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How scammers operate */}
      <section className={SECTION}>
        <h2 className={H2}>{t("learn.tactics.heading")}</h2>
        <p className="text-sm text-gray-400">{t("learn.tactics.intro")}</p>
        <div className="space-y-2">
          {TACTIC_ICONS.map((icon, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-lg shrink-0" aria-hidden="true">{icon}</span>
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-gray-100">{t(key(`learn.tactics.${i + 1}.title`))}.</span>{" "}
                {t(key(`learn.tactics.${i + 1}.desc`))}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Where scams come from */}
      <section className={SECTION}>
        <h2 className={H2}>{t("learn.sources.heading")}</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {SOURCE_ICONS.map((icon, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-lg shrink-0" aria-hidden="true">{icon}</span>
              <p className="text-sm text-gray-300">
                <span className="font-medium text-gray-100">{t(key(`learn.sources.${i + 1}.title`))}.</span>{" "}
                <span className="text-gray-400">{t(key(`learn.sources.${i + 1}.desc`))}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Email authentication checks */}
      <section className={SECTION}>
        <h2 className={H2}>{t("learn.auth.heading")}</h2>
        <p className="text-sm text-gray-400">{t("learn.auth.intro")}</p>
        <div className="space-y-4 pt-1">
          {AUTH_LEGEND.map((entry) => (
            <div key={entry.protocol} className="space-y-1.5">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-gray-100">{entry.protocol}. </span>
                {t(entry.explainKey as MessageKey)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {entry.verdicts.map((v) => (
                  <StaticAuthPill key={v.label} label={v.label} severity={v.severity} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Red flags */}
      <section className={SECTION}>
        <h2 className={H2}>{t("learn.flags.heading")}</h2>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm text-gray-300 list-none">
          {FLAG_ICONS.map((icon, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="shrink-0" aria-hidden="true">{icon}</span>
              <span>{t(key(`learn.flags.${i + 1}`))}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* How to handle it */}
      <section className={SECTION}>
        <h2 className={H2}>{t("learn.handle.heading")}</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-none">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true">✓</span>
              <span>{bold(t(key(`learn.handle.${i}`)))}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* If you've already been caught */}
      <section className="bg-red-950/30 border border-red-900/50 rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-red-300 text-sm uppercase tracking-wider">
            {t("learn.caught.heading")}
          </h2>
          <p className="text-sm text-gray-300 mt-1">{t("learn.caught.intro")}</p>
        </div>
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-100">{t(key(`learn.caught.${i}.situation`))}</p>
              <p className="text-sm text-gray-300 mt-0.5">{bold(t(key(`learn.caught.${i}.action`)))}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400">{bold(t("learn.caught.outro"))}</p>
      </section>

      {/* Where to report + disclaimer */}
      <section className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden="true">🇦🇺</span>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-emerald-400">{t("learn.report.heading")}</p>
            <p className="text-gray-300">{bold(t("learn.report.body"))}</p>
            <div className="grid sm:grid-cols-2 gap-2 pt-1">
              {AGENCIES.map(({ name, abbr: abbrTitle, site, href }) => (
                <a key={site} href={href} target="_blank" rel="noopener noreferrer"
                  className="bg-gray-900/60 rounded-lg px-3 py-2 hover:bg-gray-900 transition-colors block">
                  <div className="text-sm text-gray-200 font-semibold">
                    {abbrTitle ? <abbr title={abbrTitle}>{name}</abbr> : name}
                    <span className="sr-only"> ({t("a11y.newTab")})</span>
                  </div>
                  <div className="text-sm text-emerald-400 font-mono">{site}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
