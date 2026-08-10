"use client";

// A one-line map of the year, with a band per scam season and a marker at today.
//
// This is the piece of the calendar that a list genuinely cannot do: seven
// windows over twelve months is spatial data, and only laid out on an axis does
// it show that late November carries three overlapping campaigns while March
// carries none. The list below it answers "what is this season"; the ribbon
// answers "where am I, and what's crowded".
//
// Purely decorative in the accessibility sense: every season it draws is also a
// row in the list beneath it, with its dates in text. Duplicating that into
// labels here would make a screen reader read the whole calendar twice, so the
// graphic is aria-hidden and the list is the accessible content. The one thing
// the ribbon says that the list doesn't — where today falls — is carried by the
// visible date in the page header.

import { useLang } from "@/lib/lang";
import { seasonBands, yearFraction, isActiveOn, type CivilDate } from "@/lib/scamCalendar";
import type { RegionCode } from "@/lib/regions";

// Single letters, January-first. Deliberately not localised: the ribbon is a
// glance-level graphic and these are initials, not prose — a locale needing
// different month initials needs a different ribbon, which is a real change
// rather than a string swap.
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export default function YearRibbon({
  region,
  today,
}: {
  region: RegionCode;
  today: CivilDate;
}) {
  const { t } = useLang();
  const bands = seasonBands(region);
  if (bands.length === 0) return null;

  const now = yearFraction(today);

  return (
    <figure className="space-y-1.5 m-0">
      <div
        className="relative h-8 rounded-lg bg-gray-800/40 border border-gray-700/50 overflow-hidden"
        aria-hidden="true"
      >
        {/* Month gridlines, so a band's position reads as a month rather than
            an arbitrary offset. Eleven internal dividers, not twelve. */}
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className="absolute inset-y-0 w-px bg-gray-700/40"
            style={{ left: `${((i + 1) / 12) * 100}%` }}
          />
        ))}

        {bands.map((band, i) => {
          const active = isActiveOn(band.season, today);
          return (
            <span
              key={`${band.season.id}-${i}`}
              className={[
                "absolute h-2.5 rounded-full",
                active
                  ? "bg-amber-400/80 top-1.5"
                  : "bg-gray-600/70 bottom-1.5",
              ].join(" ")}
              style={{
                left: `${band.start * 100}%`,
                width: `${Math.max(band.length * 100, 1)}%`,
              }}
            />
          );
        })}

        {/* Today. Drawn last so it sits above every band. */}
        <span
          className="absolute inset-y-0 w-0.5 bg-emerald-400"
          style={{ left: `${now * 100}%` }}
        />
      </div>

      <div className="flex text-[10px] text-gray-600 select-none" aria-hidden="true">
        {MONTH_INITIALS.map((m, i) => (
          <span key={i} className="flex-1 text-center">
            {m}
          </span>
        ))}
      </div>

      <figcaption className="sr-only">{t("calendar.ribbon.label")}</figcaption>
    </figure>
  );
}
