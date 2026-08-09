// Scam calendar — "what's in season right now", plus the year ahead.
//
// A server component on purpose: the whole thing is a pure function of the
// region and today's date, so there is nothing to hydrate, and an unauthored
// region ships no season data to the client at all.
//
// Educational only — nothing here influences a verdict. The copy is deliberately
// careful not to imply the tool scores messages differently by date: a season
// tells you what's *likely*, and likelihood is context for a person, not a
// reason for the detector to move a number.

import {
  activeSeasons,
  upcomingSeasons,
  calendarForRegion,
  daysUntilStart,
  formatWindow,
  type ScamSeason,
  type SeasonConfidence,
} from "@/lib/scamCalendar";
import type { RegionCode } from "@/lib/regions";

// Matches the card styling used across Learn and About.
const CARD = "bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

// Confidence is surfaced rather than hidden — a floating window shouldn't read
// like a guaranteed date, and a broad seasonal lift shouldn't read like a spike.
const CONFIDENCE_LABEL: Record<SeasonConfidence, string> = {
  fixed: "Same dates every year",
  floating: "Dates shift year to year",
  elevated: "Raised risk, not a fixed date",
};

function startsInLabel(days: number): string {
  if (days === 0) return "Starts today";
  if (days === 1) return "Starts tomorrow";
  if (days < 14) return `Starts in ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `Starts in about ${weeks} weeks`;
  const months = Math.round(days / 30);
  return `Starts in about ${months} month${months === 1 ? "" : "s"}`;
}

function SeasonCard({ season, active }: { season: ScamSeason; active: boolean }) {
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
            {formatWindow(season.window)} · {CONFIDENCE_LABEL[season.confidence]}
          </p>
        </div>
        {active && (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-1">
            Active now
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400">{season.why}</p>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          What you&rsquo;ll see
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

export default function ScamCalendar({
  region,
  now = new Date(),
}: {
  region: RegionCode;
  /** Injectable for tests and for stable rendering; defaults to render time. */
  now?: Date;
}) {
  const all = calendarForRegion(region);

  // A region with no authored calendar renders nothing at all, rather than
  // showing another country's seasons. Honest coverage over filled space.
  if (all.length === 0) return null;

  const active = activeSeasons(region, now);
  const upcoming = upcomingSeasons(region, now, 2);
  const shownIds = new Set([...active, ...upcoming].map((s) => s.id));
  const rest = all.filter((s) => !shownIds.has(s.id));

  return (
    <article className={CARD} id="scam-calendar">
      <section className="space-y-2">
        <h2 className={H2}>Scam calendar</h2>
        <p className="text-sm text-gray-400">
          Scammers follow the calendar, because a message only works when
          it&rsquo;s plausible. Knowing what&rsquo;s in season makes the odd one
          out easier to spot. This is background knowledge only &mdash; we check
          every message the same way, whatever the date.
        </p>
      </section>

      {active.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            In season right now
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
            Coming up
          </h3>
          <div className="space-y-3">
            {upcoming.map((s) => (
              <div key={s.id} className="space-y-1.5">
                <p className="text-xs text-gray-500">{startsInLabel(daysUntilStart(s, now))}</p>
                <SeasonCard season={s} active={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Rest of the year
          </h3>
          <div className="space-y-3">
            {rest.map((s) => (
              <SeasonCard key={s.id} season={s} active={false} />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-500 border-t border-gray-800 pt-4">
        Out-of-season doesn&rsquo;t mean safe. These campaigns run all year &mdash;
        they just work best when you&rsquo;re expecting them.
      </p>
    </article>
  );
}
