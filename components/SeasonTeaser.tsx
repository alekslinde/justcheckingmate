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
    // A quiet strip, matching the radar teaser. The comment below already
    // warned against competing with the check box for attention; printing the
    // full `why` paragraph did exactly that, so the titles now carry it and the
    // detail stays on the calendar page where it belongs.
    <aside className="flex items-baseline gap-3 rounded-xl border border-[var(--rule)] px-3.5 py-3 text-[13.5px] text-[var(--text-dim)]">
      <span
        aria-hidden="true"
        className="w-[7px] h-[7px] rounded-full bg-[var(--caution)] shrink-0 self-center shadow-[0_0_0_3px_rgba(232,163,61,0.16)]"
      />
      <p className="min-w-0">
        <span className="font-semibold text-[var(--foreground)]">
          {t("home.season.heading")}:
        </span>{" "}
        {active.map((s) => s.title).join(" · ")}{" "}
        <Link
          href="/calendar"
          className="text-[var(--clear)] hover:underline underline-offset-2 whitespace-nowrap"
        >
          {t("home.season.cta")}
        </Link>
      </p>
    </aside>
  );
}
