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
import type { RegionCode } from "@justcheckingmate/engine/regions";

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
    // A quiet strip, not a tinted card. This is background context under the
    // primary action — a second full card competing with the check box for
    // attention was most of what pushed the page long.
    <aside className="flex items-baseline gap-3 rounded-xl border border-[var(--rule)] px-3.5 py-3 text-[13.5px] text-[var(--text-dim)]">
      <span
        aria-hidden="true"
        className="w-[7px] h-[7px] rounded-full bg-[var(--caution)] shrink-0 self-center shadow-[0_0_0_3px_rgba(232,163,61,0.16)]"
      />
      <p className="min-w-0">
        <span className="font-semibold text-[var(--foreground)]">
          {t("home.radar.heading")}:
        </span>{" "}
        {shown.map((threat) => threat.title).join(" · ")}
        {remaining > 0 && (
          <span className="text-[var(--faint)]">
            {" "}
            {t("home.radar.more", { count: remaining })}
          </span>
        )}{" "}
        {/* Inline, so the strip stays one line of reading rather than a card
            with a call to action stacked under it. */}
        <Link
          href="/radar"
          className="text-[var(--clear)] hover:underline underline-offset-2 whitespace-nowrap"
        >
          {t("home.radar.cta")}
        </Link>
      </p>
    </aside>
  );
}
