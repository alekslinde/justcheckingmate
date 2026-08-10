"use client";

// Home-page teaser for the threat radar — the campaigns circulating right now,
// with a link to the full radar.
//
// Sits below the check box for the same reason SeasonTeaser does: someone
// arriving mid-panic with a dodgy SMS needs the paste field first, and our
// background information must not push it down the page.
//
// Titles only, deliberately. The teaser's job is to say "these are around at the
// moment" — reprinting each summary would turn it into a second page competing
// with the check box, which is the failure mode SeasonTeaser's comment warns
// about. It also names a hard cap: an unbounded list would grow with every
// sweep until the teaser was the page.

import Link from "next/link";
import { useLang } from "@/lib/lang";
import { activeThreats } from "@/lib/threatRadar";
import type { RegionCode } from "@/lib/regions";

/**
 * How many titles to name before falling back to a count.
 *
 * Three fits one or two lines on a phone. The remainder is summarised as "and N
 * more" rather than truncated silently, so the reader knows the list is longer
 * than what they can see.
 */
const MAX_SHOWN = 3;

export default function RadarTeaser({ region }: { region: RegionCode }) {
  const { t } = useLang();
  const active = activeThreats(region);

  // Nothing circulating, or no radar for this region — render nothing rather
  // than an empty shell. Same contract as SeasonTeaser.
  if (active.length === 0) return null;

  const shown = active.slice(0, MAX_SHOWN);
  const remaining = active.length - shown.length;

  return (
    <aside className="bg-sky-500/5 border border-sky-500/30 rounded-2xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sky-400 shrink-0" aria-hidden="true">◎</span>
        <h2 className="text-xs font-bold uppercase tracking-wider text-sky-300">
          {t("home.radar.heading")}
        </h2>
      </div>

      <p className="text-sm text-gray-200 font-medium">
        {shown.map((threat) => threat.title).join(" · ")}
        {remaining > 0 && (
          <span className="text-gray-400 font-normal">
            {" "}
            {t("home.radar.more", { count: remaining })}
          </span>
        )}
      </p>

      <Link
        href="/radar"
        className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-block pt-1"
      >
        {t("home.radar.cta")}
      </Link>
    </aside>
  );
}
