"use client";

// Home-page teaser for the scam calendar — "what's in season right now", with a
// link to the full calendar.
//
// Deliberately placed *below* the check box on the home page: someone arriving
// mid-panic with a dodgy SMS needs the paste field first, and a seasonal notice
// pushing it down the page would trade their urgent need for our background
// information.
//
// A client component for the tone preference (localStorage, so server-invisible),
// with `today` resolved server-side — same split as ScamCalendar, and for the
// same reason: the browser clock is a device setting, not the user's region.

import Link from "next/link";
import { useLang } from "@/lib/lang";
import { activeSeasons, type CivilDate } from "@/lib/scamCalendar";
import type { RegionCode } from "@justcheckingmate/engine/regions";

export default function SeasonTeaser({
  region,
  today,
}: {
  region: RegionCode;
  /** The region's civil date, resolved server-side via regionToday(). */
  today: CivilDate;
}) {
  const { t } = useLang();
  const active = activeSeasons(region, today);

  // Nothing in season, or no calendar for this region — render nothing rather
  // than an empty shell. The home page's job is the check box; this earns its
  // space only when it has something to say.
  if (active.length === 0) return null;

  return (
    <aside className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 shrink-0" aria-hidden="true">⚑</span>
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--caution)]">
          {t("home.season.heading")}
        </h2>
      </div>

      {/* Titles only, not each season's full `why` — that paragraph belongs on
          the calendar page. A teaser that reprints it stops being a teaser and
          starts competing with the check box for attention. */}
      <p className="text-sm text-gray-200 font-medium">
        {active.map((s) => s.title).join(" · ")}
      </p>
      <p className="text-sm text-gray-400">{active[0].why}</p>

      <Link
        href="/calendar"
        className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block pt-1"
      >
        {t("home.season.cta")}
      </Link>
    </aside>
  );
}
