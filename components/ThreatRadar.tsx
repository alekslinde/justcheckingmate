"use client";

// Threat radar — what's circulating now, grouped by how live it is.
//
// A client component for the same reason ScamCalendar is one: it reads the tone
// preference, which lives in localStorage and is invisible to the server.
//
// Unlike the calendar it takes no date prop. Nothing here is computed against
// "today" — an entry's status is authored by the sweep that reviewed it, not
// derived from how old its lastSeen is. That is deliberate: a campaign quiet for
// three weeks is not automatically dead, and inferring "subsided" from a date
// would silently downgrade live threats between sweeps. A human decides, and the
// "Reviewed <date>" line tells the reader how fresh that judgement is.
//
// Educational only — nothing here influences a verdict.

import Link from "next/link";
import { useLang, type MessageKey } from "@/lib/lang";
import {
  radarForRegion,
  threatsByStatus,
  lastUpdated,
  formatRadarDate,
  roadmapUrl,
  radarSummary,
  uncoveredThreats,
  type ThreatEntry,
  type RadarCoverage,
} from "@/lib/threatRadar";
import { resolveRegionPack, type RegionCode } from "@justcheckingmate/engine/regions";

// Matches the card styling used across Learn, About and the calendar.
const CARD = "bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

// Coverage is rendered as inline text in the collapsed row rather than as a
// filled badge. A badge on every card put the same "covered" pill on the large
// majority of rows, which read as decoration and crowded out the title; naming
// only the exceptions makes the exceptions visible. Where it is called out, amber is
// deliberate — red is the verdict colour in this app, and a detection gap is a
// statement about us, not about anything the user is holding.
//
// "n/a" is not a valid message-key fragment, so the lookup goes through a map
// rather than being interpolated. Keyed by the union so a new coverage value is
// a compile error here rather than a raw key rendered to the page.
const COVERAGE_KEY: Record<RadarCoverage, MessageKey> = {
  covered: "radar.coverage.covered",
  partial: "radar.coverage.partial",
  none: "radar.coverage.none",
  "n/a": "radar.coverage.na",
};

/**
 * One campaign, collapsed to a scannable row until asked to open.
 *
 * The first draft rendered every card at full weight — badge, summary, lures,
 * advice, detection, source, five section labels — once per entry. That
 * measured 17,000px on a phone, twenty screens of scrolling, with no single card
 * fitting on screen at once, and it made scanning impossible: the reader had to
 * read to find out whether a card was relevant to them.
 *
 * So the card carries only what supports the scan decision — title, channel,
 * and a coverage marker — and everything else moves behind a `<details>`. The
 * detail is unchanged when opened; it just stops being mandatory. `<details>`
 * rather than state because it needs no JS, survives Ctrl+F (browsers open a
 * closed `<details>` to reveal a match), and is keyboard- and screen-reader-
 * navigable for free.
 */
function ThreatCard({ threat }: { threat: ThreatEntry }) {
  const { t } = useLang();
  const isGap = threat.coverage === "partial" || threat.coverage === "none";

  return (
    <article className="rounded-xl border border-gray-700/50 bg-gray-800/40">
      <details className="group">
        {/* Matches the filter dropdowns on the reports page, which are the app's
            existing "open this to see more" affordance: a right-aligned chevron
            at the same weight and near-white tint. Those dropdowns draw their
            own chevron rather than using the native <select> indicator, which
            iOS Safari paints in light-mode chrome regardless of text colour.
            The default <details> marker is suppressed because it can't be sized
            or coloured to match — it renders as a small dim triangle on the
            left, far weaker than the control it sits beside. Drawn as an inline
            SVG rather than a text glyph so stroke weight is explicit and the
            rotation is smooth. */}
        <summary className="cursor-pointer list-none p-4 min-h-[44px] rounded-xl hover:bg-gray-800/60 transition-colors">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {/* h4, one level below the group heading — the cards nest inside
                  "Circulating now", and matching its level would flatten the
                  two in a screen reader's outline. */}
              <h4 className="font-bold text-gray-100 text-base">{threat.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                {t(`radar.channel.${threat.channel}` as MessageKey)}
                {/* Only the exceptions are named in the collapsed row. "We catch
                    this" was on 20 of 25 cards — a near-constant label spending
                    the most prominent slot on the card to say nothing. Silence
                    now means covered, and the summary line above states that
                    convention so the absence is readable rather than ambiguous. */}
                {isGap && (
                  <>
                    {" · "}
                    <span className="text-amber-300">{t(COVERAGE_KEY[threat.coverage])}</span>
                  </>
                )}
                {threat.coverage === "n/a" && (
                  <>
                    {" · "}
                    <span className="text-gray-400">{t(COVERAGE_KEY[threat.coverage])}</span>
                  </>
                )}
              </p>
            </div>
            {/* Same geometry as the <select> chevrons on /submissions, which
                are drawn from this same path at `text-gray-200` and
                stroke-width 2.5 — a downward V, rotated 180° here on open. */}
            <svg
              className="shrink-0 w-5 h-5 mt-0.5 text-gray-200 transition-transform duration-200 group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          {/* Visible only to assistive tech: the chevron alone doesn't say what
              opening the row would reveal. */}
          <span className="sr-only">{t("radar.expand")}</span>
        </summary>

        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-gray-400">{threat.summary}</p>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t("radar.lures.heading")}
            </p>
            <ul className="space-y-1 list-none">
              {/* Index-suffixed rather than keyed on the string alone: two
                  entries could legitimately quote the same lure, and nothing in
                  the data model forbids it. The list is static, so index is
                  stable here. */}
              {threat.lures.map((lure, i) => (
                <li key={`${lure}-${i}`} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-amber-400/80 mt-0.5 shrink-0" aria-hidden="true">⚑</span>
                  <span>{lure}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 pt-1 border-t border-gray-700/50 mt-1">
            <span className="text-emerald-400/80 mt-2 shrink-0" aria-hidden="true">✓</span>
            <p className="text-sm text-gray-300 pt-1.5">{threat.advice}</p>
          </div>

          {/* What we do about it. For `none` and `n/a` there is no rule to
              describe, so a fixed line states the gap rather than leaving a
              silent absence the reader would fill in optimistically. */}
          <div className="text-xs text-gray-500 border-t border-gray-700/50 pt-3 space-y-1">
            <p className="font-semibold uppercase tracking-wider">
              {t("radar.detection.heading")}
            </p>
            <p>
              {threat.detection ??
                t(threat.coverage === "n/a" ? "radar.coverage.na.body" : "radar.coverage.none.body")}
            </p>
            {/* The evidence link. Every claim on this card traces to the sweep
                that recorded it — without this the provenance is asserted rather
                than checkable, which is the whole difference from a news feed. */}
            <p className="pt-1">
              <a
                href={roadmapUrl(threat)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-emerald-400 underline underline-offset-2 transition-colors"
              >
                {t("radar.source", { date: formatRadarDate(threat.lastSeen) })}
              </a>
            </p>
          </div>
        </div>
      </details>
    </article>
  );
}

function ThreatGroup({ heading, threats }: { heading: string; threats: ThreatEntry[] }) {
  if (threats.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{heading}</h3>
      <div className="space-y-3">
        {threats.map((threat) => (
          <ThreatCard key={threat.id} threat={threat} />
        ))}
      </div>
    </section>
  );
}

/**
 * The honest empty state, shown only on the standalone page.
 *
 * Same contract as the calendar's: inline, an unauthored region renders nothing
 * because surrounding content carries the page; as a whole page that would be a
 * dead end, so this says plainly we have no data rather than substituting
 * another country's campaigns.
 */
function EmptyState() {
  const { t } = useLang();
  return (
    <article className={CARD}>
      <section className="space-y-2">
        <h2 className={H2}>{t("radar.empty.heading")}</h2>
        <p className="text-sm text-gray-400">{t("radar.empty.body")}</p>
      </section>
      <Link
        href="/learn"
        className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block"
      >
        {t("radar.learnCta")}
      </Link>
    </article>
  );
}

export default function ThreatRadar({
  region,
  standalone = false,
}: {
  region: RegionCode;
  /** Renders an explanatory empty state instead of nothing when true. */
  standalone?: boolean;
}) {
  const { t } = useLang();
  const all = radarForRegion(region);

  if (all.length === 0) return standalone ? <EmptyState /> : null;

  const reviewed = lastUpdated(region);
  // Named rather than hardcoded: the intro renders for whichever region has an
  // authored radar, and RADARS is shaped to hold more than one. "circulating in
  // Australia" was correct only for as long as AU stayed the only entry.
  const regionName = resolveRegionPack(region).name;
  const summary = radarSummary(region);
  const gaps = uncoveredThreats(region);

  return (
    <article className={CARD} id="threat-radar">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className={H2}>{t("radar.title")}</h2>
          {reviewed && (
            <p className="text-xs text-gray-500">
              {t("radar.updated", { date: formatRadarDate(reviewed) })}
            </p>
          )}
        </div>
        <p className="text-sm text-gray-400">{t("radar.intro", { region: regionName })}</p>
        <p className="text-sm text-gray-500">{t("radar.neutrality")}</p>
      </section>

      {/* The orienting line. With every card collapsed, the shape of the board
          is no longer visible by scrolling it — this states the counts up front,
          and establishes the convention the collapsed rows rely on: coverage is
          only called out where it is *not* complete. */}
      <section className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t("radar.summary.heading")}
        </h3>
        <p className="text-sm text-gray-300">
          {t("radar.summary.body", {
            active: summary.active,
            watchlist: summary.watchlist,
            covered: summary.covered,
            total: summary.total,
          })}
        </p>
      </section>

      {/* Gaps first, before the full board. They are the handful of entries
          where the reader is genuinely on their own, and burying them among the
          many "we catch this" rows is the one ordering that makes
          the honesty useless. Same cards, so nothing is duplicated in substance
          — they simply also appear in their status group below. */}
      {gaps.length > 0 && (
        <ThreatGroup heading={t("radar.gaps.heading")} threats={gaps} />
      )}

      <ThreatGroup
        heading={t("radar.active.heading")}
        threats={threatsByStatus(region, "active")}
      />
      <ThreatGroup
        heading={t("radar.watchlist.heading")}
        threats={threatsByStatus(region, "watchlist")}
      />
      <ThreatGroup
        heading={t("radar.subsided.heading")}
        threats={threatsByStatus(region, "subsided")}
      />

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t("radar.method.heading")}
          </p>
          <p className="text-xs text-gray-500">{t("radar.method.body")}</p>
        </div>
        {/* Only on the standalone page — inline, the surrounding page carries
            its own navigation and one of these would link to itself. */}
        {standalone && (
          <div className="flex flex-col gap-2">
            <Link
              href="/calendar"
              className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block"
            >
              {t("radar.calendarCta")}
            </Link>
            <Link
              href="/learn"
              className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block"
            >
              {t("radar.learnCta")}
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
