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
import YearRibbon from "@/components/YearRibbon";
import {
  activeSeasons,
  upcomingSeasons,
  remainingSeasons,
  calendarForRegion,
  daysUntilStart,
  daysUntilEnd,
  formatWindow,
  type ScamSeason,
  type CivilDate,
} from "@/lib/scamCalendar";
import type { RegionCode } from "@/lib/regions";

// Matches the card styling used across Learn and About.
const CARD = "bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

// How many not-yet-active seasons get their own "coming up" row. The rest fold
// into the collapsed index below, so this is a display budget rather than the
// glance-sized strip upcomingSeasons() documents as its default.
const UPCOMING_LIMIT = 2;

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

/**
 * The "N left" label for an active season, on the same thresholds as
 * startsInLabel so a gap of 40 days describes itself as "about 6 weeks" in both
 * directions rather than switching units by which end of the window it names.
 *
 * The small counts do *not* mirror startsInLabel, because the two functions
 * count different things. daysUntilStart is exclusive — 1 means the season
 * begins tomorrow — while daysUntilEnd is inclusive of the end day, so 1 means
 * it runs today *and* tomorrow: two days left, not one. Copying the "tomorrow"
 * branch across is what made a season with two days left announce "1 day left".
 */
function endsInLabel(days: number, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  if (days === 0) return t("calendar.ends.today");
  // Inclusive throughout: `remaining` is how many days the season still covers,
  // today included, which is what "N left" means to a reader.
  const remaining = days + 1;
  if (remaining < 14) return t("calendar.ends.days", { count: remaining });
  if (remaining < 60) return t("calendar.ends.weeks", { count: Math.round(remaining / 7) });
  const months = Math.round(remaining / 30);
  return t(months === 1 ? "calendar.ends.month" : "calendar.ends.months", { count: months });
}

/** Window and confidence, the one-line subtitle shared by the card and the row. */
function SeasonMeta({ season }: { season: ScamSeason }) {
  const { t } = useLang();
  return (
    <>
      {formatWindow(season.window)} · {t(`calendar.confidence.${season.confidence}` as MessageKey)}
    </>
  );
}

/** The lures + advice body. Shared so a collapsed row expands to the same content. */
function SeasonBody({ season }: { season: ScamSeason }) {
  const { t } = useLang();

  return (
    <>
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
    </>
  );
}

/**
 * A season in full — used only for what's active right now.
 *
 * Everything else is a SeasonRow. Giving a season five months away the same
 * height as the one the user is standing in was what made this page six phone
 * screens long, so full weight is now reserved for the thing that's true today.
 */
function SeasonCard({ season, today }: { season: ScamSeason; today: CivilDate }) {
  const { t } = useLang();

  return (
    <article className="rounded-xl border p-4 space-y-3 bg-amber-500/10 border-amber-500/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-100 text-base">{season.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            <SeasonMeta season={season} />
          </p>
        </div>
        {/* How much of the window is left, not just that it's open: ten weeks of
            tax season remaining is more actionable than "active". */}
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-1">
          {t("calendar.badge.active")} · {endsInLabel(daysUntilEnd(season, today), t)}
        </span>
      </div>

      <SeasonBody season={season} />
    </article>
  );
}

/**
 * A collapsed season — title, timing, and a disclosure.
 *
 * Native <details>/<summary> rather than useState: it brings keyboard support,
 * the right screen-reader semantics, and find-in-page over the collapsed text
 * for free, none of which a div-and-state version gets without work. The
 * `marker:hidden` and `[&::-webkit-details-marker]` rules drop the platform
 * triangle so the chevron can sit where the layout wants it.
 */
function SeasonRow({ season, timing }: { season: ScamSeason; timing: string }) {
  return (
    <details className="group rounded-xl border bg-gray-800/40 border-gray-700/50 open:bg-gray-800/60">
      {/* No aria-label here. One would replace the whole accessible name, so a
          screen reader would hear "Tax season — show what to look for" and lose
          the window, the confidence and the timing that a sighted user can scan
          without expanding anything. The visible text is already the better
          name; <summary> announces the expand/collapse affordance itself. */}
      <summary className="flex items-center gap-3 p-3 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden rounded-xl hover:bg-gray-700/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
        <span
          className="shrink-0 text-gray-500 text-xs transition-transform group-open:rotate-90"
          aria-hidden="true"
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-gray-200 text-sm truncate">{season.title}</span>
          {/* truncate clips visually on a narrow row; the full string stays in
              the accessible name because it's still real text in the DOM. */}
          <span className="block text-xs text-gray-500 truncate">
            <SeasonMeta season={season} />
          </span>
        </span>
        <span className="shrink-0 text-xs text-gray-500">{timing}</span>
      </summary>

      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-700/50 mt-1">
        <SeasonBody season={season} />
      </div>
    </details>
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
  const upcoming = upcomingSeasons(region, today, UPCOMING_LIMIT);
  const rest = remainingSeasons(region, today, UPCOMING_LIMIT);

  return (
    <article className={CARD} id="scam-calendar">
      {/* Intro only. The neutrality line moved to the outro: it's a disclaimer
          about how we score, and standing it between the reader and the season
          they came for spent the top of the page on a caveat. */}
      <section className="space-y-2">
        <h2 className={H2}>{t("calendar.title")}</h2>
        <p className="text-sm text-gray-400">{t("calendar.intro")}</p>
      </section>

      <YearRibbon region={region} today={today} />

      {active.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            {t("calendar.active.heading")}
          </h3>
          <div className="space-y-3">
            {active.map((s) => (
              <SeasonCard key={s.id} season={s} today={today} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t("calendar.upcoming.heading")}
          </h3>
          <div className="space-y-2">
            {upcoming.map((s) => (
              <SeasonRow
                key={s.id}
                season={s}
                timing={startsInLabel(daysUntilStart(s, today), t)}
              />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t("calendar.rest.heading")}
            </h3>
            <span className="text-xs text-gray-600">
              {t("calendar.rest.count", { count: rest.length })}
            </span>
          </div>
          {/* Two columns from sm up: four rows become two, and the section
              reads as an index rather than a queue of things to get through. */}
          <div className="grid gap-2 sm:grid-cols-2">
            {rest.map((s) => (
              <SeasonRow
                key={s.id}
                season={s}
                timing={startsInLabel(daysUntilStart(s, today), t)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <p className="text-xs text-gray-500">{t("calendar.neutrality")}</p>
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
