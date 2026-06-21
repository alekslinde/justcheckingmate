"use client";

import Link from "next/link";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";
import { AUTH_LEGEND, StaticAuthPill } from "@/components/AuthBadges";
import EmailExportGuide from "@/components/EmailExportGuide";

// Type icons mirror the input/report type pickers used across the app, so they
// stay as a consistent scanning aid. The tactic/source/flag lists used purely
// decorative emoji and now lead with a neutral marker instead.
const SCAM_TYPE_ICONS = ["🔗", "📱", "📧", "📞", "📷"];
const TACTIC_COUNT = 6;
const SOURCE_COUNT = 6;
const FLAG_COUNT = 8;

const AGENCIES = [
  { name: "Scamwatch (ACCC)", abbr: null, site: "scamwatch.gov.au", href: "https://www.scamwatch.gov.au" },
  { name: "ReportCyber", abbr: "Australian Signals Directorate", site: "cyber.gov.au/report", href: "https://www.cyber.gov.au/report" },
  { name: "IDCARE (ID theft)", abbr: null, site: "idcare.org", href: "https://www.idcare.org" },
  { name: "ACSC", abbr: "Australian Cyber Security Centre", site: "cyber.gov.au", href: "https://www.cyber.gov.au" },
];

// One card holds all the neutral explanatory sections (mirrors the About page).
// The two coloured callouts below — "if you've been caught" (red) and "where to
// report" (emerald) — stay as standalone cards: their colour carries meaning.
const CARD = "bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-8";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

const key = (k: string) => k as MessageKey;

// Part header — the page is split into two distinct halves: "Spotting scams"
// (what scams are / how to identify them) and "Getting the most from this tool"
// (how to capture a scam so we can read it). Larger and divider-led so the two
// halves read as separate sections, not just more cards.
function PartHeader({ id, heading, intro }: { id: string; heading: string; intro: string }) {
  return (
    <div id={id} className="scroll-mt-20 pt-2">
      <div className="h-px bg-gray-800 mb-6" />
      <h2 className="text-xl font-black text-gray-100 tracking-tight">{heading}</h2>
      <p className="text-sm text-gray-400 mt-1">{intro}</p>
    </div>
  );
}

export default function LearnContent() {
  const { t } = useLang();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">{t("learn.title")}</h1>
        <p className="text-sm text-gray-400">{t("learn.intro")}</p>
      </div>

      {/* ── Part 1: Spotting scams ─────────────────────────────────────────── */}
      <PartHeader
        id="spotting-scams"
        heading={t("learn.part.spot.heading")}
        intro={t("learn.part.spot.intro")}
      />

      <article className={CARD}>
        {/* What this tool checks */}
        <section className="space-y-3">
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
        <section className="space-y-3">
          <h2 className={H2}>{t("learn.tactics.heading")}</h2>
          <p className="text-sm text-gray-400">{t("learn.tactics.intro")}</p>
          <div className="space-y-2">
            {Array.from({ length: TACTIC_COUNT }, (_, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-emerald-400/70 mt-1 shrink-0" aria-hidden="true">›</span>
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-gray-100">{t(key(`learn.tactics.${i + 1}.title`))}.</span>{" "}
                  {t(key(`learn.tactics.${i + 1}.desc`))}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Where scams come from */}
        <section className="space-y-3">
          <h2 className={H2}>{t("learn.sources.heading")}</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {Array.from({ length: SOURCE_COUNT }, (_, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-emerald-400/70 mt-0.5 shrink-0" aria-hidden="true">›</span>
                <p className="text-sm text-gray-300">
                  <span className="font-medium text-gray-100">{t(key(`learn.sources.${i + 1}.title`))}.</span>{" "}
                  <span className="text-gray-400">{t(key(`learn.sources.${i + 1}.desc`))}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Email authentication checks */}
        <section className="space-y-3">
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
        <section className="space-y-3">
          <h2 className={H2}>{t("learn.flags.heading")}</h2>
          <ul className="grid sm:grid-cols-2 gap-2 text-sm text-gray-300 list-none">
            {Array.from({ length: FLAG_COUNT }, (_, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 shrink-0" aria-hidden="true">⚑</span>
                <span>{t(key(`learn.flags.${i + 1}`))}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* How to handle it */}
        <section className="space-y-3">
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
      </article>

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
      </section>

      {/* ── Part 2: Getting the most from this tool ────────────────────────── */}
      <PartHeader
        id="using-this-tool"
        heading={t("learn.part.using.heading")}
        intro={t("learn.part.using.intro")}
      />

      <article className={CARD}>
        {/* Taking a photo */}
        <section className="space-y-2">
          <h2 className={H2}>{t("learn.using.photo.heading")}</h2>
          <p className="text-sm text-gray-400">{t("check.help.photo.body")}</p>
        </section>

        {/* Uploading an image */}
        <section className="space-y-2">
          <h2 className={H2}>{t("learn.using.image.heading")}</h2>
          <p className="text-sm text-gray-400">{t("check.help.image.body")}</p>
        </section>

        {/* Getting the email source — reuses the per-mail-client export guide. */}
        <section className="space-y-2">
          <h2 className={H2}>{t("learn.using.email.heading")}</h2>
          <EmailExportGuide expandable={false} />
        </section>
      </article>

      <p className="text-center text-sm text-gray-400 pb-4">
        <Link href="/" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium">
          {t("learn.footer.cta")}
        </Link>
      </p>
    </main>
  );
}
