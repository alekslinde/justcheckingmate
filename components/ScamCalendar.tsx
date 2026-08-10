"use client";

// Scam calendar — "what's in season right now", plus the year ahead.
//
// A client component so it can read the user's tone preference, which lives in
// localStorage and is therefore unavailable on the server (see lib/lang.tsx).
// The *date* is not decided here: `today` is resolved server-side and passed in,
// because the browser clock is the user's device setting rather than their
// region, and a traveller or a device with a wrong clock would otherwise see the
// wrong season. Server decides when, client decides how it reads.
//
// Educational only — nothing here influences a verdict. The copy is deliberately
// careful not to imply the tool scores messages differently by date: a season
// tells you what's *likely*, and likelihood is context for a person, not a
// reason for the detector to move a number.

import Link from "next/link";
import { useLang, type MessageKey } from "@/lib/lang";
import {
  activeSeasons,
  upcomingSeasons,
  calendarForRegion,
  daysUntilStart,
  formatWindow,
  type ScamSeason,
  type CivilDate,
} from "@/lib/scamCalendar";
import type { RegionCode } from "@/lib/regions";

// Matches the card styling used across Learn and About.
const CARD = "bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

/**
 * The "starts in N" label, chosen by day count.
 *
 * Thresholds switch on the raw days rather than on each unit's rounded value:
 * rounding independently is what made 59 days read as "about 8 weeks" and 60 as
 * "about 2 months", a seam where the same gap described itself two ways.
 */
function startsInLabel(days: number, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  if (days === 0) return t("calendar.starts.today");
  if (days === 1) return t("calendar.starts.tomorrow");
  if (days < 14) return t("calendar.starts.days", { count: days });
  if (days < 60) return t("calendar.starts.weeks", { count: Math.round(days / 7) });
  const months = Math.round(days / 30);
  return t(months === 1 ? "calendar.starts.month" : "calendar.starts.months", { count: months });
}

function SeasonCard({ season, active }: { season: ScamSeason; active: boolean }) {
  const { t } = useLang();

  return (
    <article
      className={[
        "rounded-xl border p-4 space-y-3",
        active
          ? "bg-amber-500/5 border-amber-500/30"
          : "bg-gray-800/40 border-gray-700/50",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-100 text-base">{season.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatWindow(season.window)} · {t(`calendar.confidence.${season.confidence}` as MessageKey)}
          </p>
        </div>
        {active && (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-1">
            {t("calendar.badge.active")}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400">{season.why}</p>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t("calendar.lures.heading")}
        </p>
        <ul className="space-y-1 list-none">
          {season.lures.map((lure) => (
            <li key={lure} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-amber-400/80 mt-0.5 shrink-0" aria-hidden="true">⚑</span>
              <span>{lure}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-start gap-2 pt-1 border-t border-gray-700/50 mt-1">
        <span className="text-emerald-400/80 mt-2 shrink-0" aria-hidden="true">✓</span>
        <p className="text-sm text-gray-300 pt-1.5">{season.advice}</p>
      </div>
    </article>
  );
}

/**
 * The honest empty state, shown only on the standalone page.
 *
 * As a *section* on another page, an unauthored region rendered nothing — right,
 * because there was surrounding content to carry the page. As a whole page that
 * would be a dead end, so this says plainly that we have no data rather than
 * substituting another country's seasons, and points somewhere useful.
 */
function EmptyState() {
  const { t } = useLang();
  return (
    <article className={CARD}>
      <section className="space-y-2">
        <h2 className={H2}>{t("calendar.empty.heading")}</h2>
        <p className="text-sm text-gray-400">{t("calendar.empty.body")}</p>
      </section>
      <Link
        href="/learn"
        className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block"
      >
        {t("calendar.learnCta")}
      </Link>
    </article>
  );
}

export default function ScamCalendar({
  region,
  today,
  standalone = false,
}: {
  region: RegionCode;
  /**
   * The region's civil date, resolved server-side via regionToday(). A plain
   * month/day pair rather than a Date so it means the same thing after crossing
   * the RSC boundary — a Date would be re-read in the *browser's* timezone.
   */
  today: CivilDate;
  /** Renders an explanatory empty state instead of nothing when true. */
  standalone?: boolean;
}) {
  const { t } = useLang();
  const all = calendarForRegion(region);

  // A region with no authored calendar never borrows another's seasons. Inline
  // it renders nothing; as a page it explains itself.
  if (all.length === 0) return standalone ? <EmptyState /> : null;

  const active = activeSeasons(region, today);
  const upcoming = upcomingSeasons(region, today, 2);
  const shownIds = new Set([...active, ...upcoming].map((s) => s.id));
  const rest = all.filter((s) => !shownIds.has(s.id));

  return (
    <article className={CARD} id="scam-calendar">
      <section className="space-y-2">
        <h2 className={H2}>{t("calendar.title")}</h2>
        <p className="text-sm text-gray-400">{t("calendar.intro")}</p>
        <p className="text-sm text-gray-500">{t("calendar.neutrality")}</p>
      </section>

      {active.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            {t("calendar.active.heading")}
          </h3>
          <div className="space-y-3">
            {active.map((s) => (
              <SeasonCard key={s.id} season={s} active />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t("calendar.upcoming.heading")}
          </h3>
          <div className="space-y-3">
            {upcoming.map((s) => (
              <div key={s.id} className="space-y-1.5">
                <p className="text-xs text-gray-500">{startsInLabel(daysUntilStart(s, today), t)}</p>
                <SeasonCard season={s} active={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t("calendar.rest.heading")}
          </h3>
          <div className="space-y-3">
            {rest.map((s) => (
              <SeasonCard key={s.id} season={s} active={false} />
            ))}
          </div>
        </section>
      )}

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <p className="text-xs text-gray-500">{t("calendar.outro")}</p>
        {/* Only on the standalone page — inline, the surrounding page already
            carries its own navigation and this would be a link to itself. */}
        {standalone && (
          <Link
            href="/learn"
            className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block"
          >
            {t("calendar.learnCta")}
          </Link>
        )}
      </div>
    </article>
  );
}
