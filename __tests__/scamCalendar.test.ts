import { describe, it, expect } from "vitest";
import {
  calendarForRegion,
  hasCalendar,
  isActiveOn,
  activeSeasons,
  upcomingSeasons,
  remainingSeasons,
  daysUntilStart,
  daysUntilEnd,
  seasonBands,
  packSeasonBands,
  yearFraction,
  formatWindow,
  regionToday,
  isWellFormedWindow,
  type ScamSeason,
} from "@/lib/scamCalendar";
import { supportedRegions } from "@/lib/regions";

// Local dates throughout: isActiveOn reads getMonth/getDate, so constructing
// with new Date(y, m, d) keeps the test independent of the runner's timezone.
const on = (month: number, day: number) => new Date(2026, month - 1, day);

const season = (window: ScamSeason["window"], id = "test"): ScamSeason => ({
  id,
  title: "Test",
  window,
  confidence: "fixed",
  why: "why",
  lures: ["lure"],
  advice: "advice",
});

describe("calendarForRegion", () => {
  it("returns authored seasons for AU", () => {
    expect(calendarForRegion("AU").length).toBeGreaterThan(0);
  });

  it("returns an empty list for regions with no authored calendar", () => {
    // Deliberate: an unauthored region must render nothing rather than
    // inheriting Australia's tax dates.
    for (const code of supportedRegions().filter((c) => c !== "AU")) {
      expect(calendarForRegion(code)).toEqual([]);
      expect(hasCalendar(code)).toBe(false);
    }
  });

  it("reports AU as having a calendar", () => {
    expect(hasCalendar("AU")).toBe(true);
  });

  it("gives every season a unique id", () => {
    const ids = calendarForRegion("AU").map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Checks against each month's real length, not a blanket 31 — a 31 April or a
  // 30 February would pass the loose bound and still be a date that never comes.
  it("authors every season as a real calendar date", () => {
    for (const s of calendarForRegion("AU")) {
      expect(isWellFormedWindow(s.window), `${s.id} has an impossible date`).toBe(true);
    }
  });

  it("gives every season non-empty teaching content", () => {
    for (const s of calendarForRegion("AU")) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.advice.length).toBeGreaterThan(0);
      expect(s.lures.length).toBeGreaterThan(0);
    }
  });
});

describe("isActiveOn", () => {
  const normal = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });

  it("is active inside a normal window", () => {
    expect(isActiveOn(normal, on(8, 15))).toBe(true);
  });

  it("is inclusive of both boundaries", () => {
    expect(isActiveOn(normal, on(7, 1))).toBe(true);
    expect(isActiveOn(normal, on(10, 31))).toBe(true);
  });

  it("is inactive outside a normal window", () => {
    expect(isActiveOn(normal, on(6, 30))).toBe(false);
    expect(isActiveOn(normal, on(11, 1))).toBe(false);
  });

  // The case a naive start<=now<=end check gets wrong: the window spans the
  // year boundary, so both December and January must be active.
  const wrapping = season({ startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 });

  it("is active in the tail of a year-wrapping window", () => {
    expect(isActiveOn(wrapping, on(12, 25))).toBe(true);
    expect(isActiveOn(wrapping, on(1, 5))).toBe(true);
  });

  it("is active on both boundaries of a year-wrapping window", () => {
    expect(isActiveOn(wrapping, on(11, 20))).toBe(true);
    expect(isActiveOn(wrapping, on(1, 15))).toBe(true);
  });

  it("is inactive in the middle of the year for a wrapping window", () => {
    expect(isActiveOn(wrapping, on(6, 1))).toBe(false);
    expect(isActiveOn(wrapping, on(1, 16))).toBe(false);
    expect(isActiveOn(wrapping, on(11, 19))).toBe(false);
  });

  it("handles a single-day window", () => {
    const oneDay = season({ startMonth: 3, startDay: 4, endMonth: 3, endDay: 4 });
    expect(isActiveOn(oneDay, on(3, 4))).toBe(true);
    expect(isActiveOn(oneDay, on(3, 5))).toBe(false);
    expect(isActiveOn(oneDay, on(3, 3))).toBe(false);
  });
});

describe("activeSeasons", () => {
  it("finds tax season in August for AU", () => {
    const ids = activeSeasons("AU", on(8, 10)).map((s) => s.id);
    expect(ids).toContain("tax-time");
  });

  it("finds christmas parcels in early January for AU", () => {
    const ids = activeSeasons("AU", on(1, 5)).map((s) => s.id);
    expect(ids).toContain("christmas-parcels");
  });

  it("returns nothing for a region with no calendar", () => {
    expect(activeSeasons("GB", on(8, 10))).toEqual([]);
  });

  it("never returns an inactive season", () => {
    const date = on(4, 1);
    for (const s of activeSeasons("AU", date)) {
      expect(isActiveOn(s, date)).toBe(true);
    }
  });
});

describe("daysUntilStart", () => {
  it("is zero on the start day", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilStart(s, on(7, 1))).toBe(0);
  });

  it("counts forward within the same year", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilStart(s, on(6, 29))).toBe(2);
  });

  it("wraps to next year once the start has passed", () => {
    const s = season({ startMonth: 2, startDay: 1, endMonth: 3, endDay: 1 });
    // From 2 Feb, next February start is nearly a full year away.
    expect(daysUntilStart(s, on(2, 2))).toBeGreaterThan(300);
  });
});

describe("daysUntilEnd", () => {
  it("counts inclusively to the last day", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilEnd(s, on(10, 30))).toBe(1);
  });

  it("is zero on the final day", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilEnd(s, on(10, 31))).toBe(0);
  });

  it("handles a window that wraps the year end", () => {
    const s = season({ startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 });
    // 1 December sits in the November leg; the 15 January close is 45 days on.
    expect(daysUntilEnd(s, on(12, 1))).toBe(45);
    // 1 January sits in the January leg — same window, no wrap needed.
    expect(daysUntilEnd(s, on(1, 1))).toBe(14);
  });

  // The guard that keeps an inactive season from reporting most of a year left.
  it("returns zero rather than a wrapped count when inactive", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilEnd(s, on(11, 20))).toBe(0);
  });
});

describe("remainingSeasons", () => {
  it("excludes active and upcoming seasons", () => {
    const date = on(8, 10);
    const ids = remainingSeasons("AU", date, 2).map((s) => s.id);
    const shown = [
      ...activeSeasons("AU", date).map((s) => s.id),
      ...upcomingSeasons("AU", date, 2).map((s) => s.id),
    ];
    for (const id of shown) expect(ids).not.toContain(id);
  });

  it("orders by soonest start rather than authored order", () => {
    const date = on(8, 10);
    const list = remainingSeasons("AU", date, 2);
    const gaps = list.map((s) => daysUntilStart(s, date));
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps);
  });

  it("accounts for every authored season exactly once across the three groups", () => {
    const date = on(8, 10);
    const ids = [
      ...activeSeasons("AU", date),
      ...upcomingSeasons("AU", date, 2),
      ...remainingSeasons("AU", date, 2),
    ].map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(calendarForRegion("AU").map((s) => s.id).sort());
  });

  it("returns nothing for a region with no calendar", () => {
    expect(remainingSeasons("US", on(8, 10), 2)).toEqual([]);
  });
});

describe("seasonBands", () => {
  it("emits one band per non-wrapping season and two for a wrapping one", () => {
    const bands = seasonBands("AU");
    const wrapping = calendarForRegion("AU").filter(
      (s) =>
        s.window.startMonth * 100 + s.window.startDay >
        s.window.endMonth * 100 + s.window.endDay,
    );
    expect(bands).toHaveLength(calendarForRegion("AU").length + wrapping.length);
  });

  it("keeps every band inside the year", () => {
    for (const band of seasonBands("AU")) {
      expect(band.start).toBeGreaterThanOrEqual(0);
      expect(band.length).toBeGreaterThan(0);
      expect(band.start + band.length).toBeLessThanOrEqual(1);
    }
  });

  // The mixed 0-based start / 1-based end in seasonBands is deliberate: the
  // difference is an inclusive day count. Swept over every window an author
  // could write, so a "tidy-up" that aligns the bases fails here.
  it("stays inside the year for every representable window", () => {
    const daysIn = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    for (let sm = 1; sm <= 12; sm++) {
      for (let em = 1; em <= 12; em++) {
        for (const [sd, ed] of [[1, 1], [daysIn[sm], daysIn[em]], [1, daysIn[em]], [daysIn[sm], 1]]) {
          const w = { startMonth: sm, startDay: sd, endMonth: em, endDay: ed };
          const bands = packSeasonBands([season(w)]);

          for (const band of bands) {
            expect(band.start).toBeGreaterThanOrEqual(0);
            expect(band.length).toBeGreaterThan(0);
            expect(band.start + band.length).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it("gives overlapping seasons different lanes", () => {
    // 1–30 June sits entirely inside 1 June – 31 August.
    const bands = packSeasonBands([
      season({ startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 }, "wide"),
      season({ startMonth: 6, startDay: 1, endMonth: 6, endDay: 30 }, "narrow"),
    ]);

    expect(new Set(bands.map((b) => b.lane)).size).toBe(2);
  });

  it("reuses a lane for seasons that don't overlap", () => {
    const bands = packSeasonBands([
      season({ startMonth: 1, startDay: 1, endMonth: 2, endDay: 1 }, "early"),
      season({ startMonth: 6, startDay: 1, endMonth: 7, endDay: 1 }, "late"),
    ]);

    expect(bands.every((b) => b.lane === 0)).toBe(true);
  });

  it("never overlaps two bands within a lane", () => {
    const byLane = new Map<number, { start: number; length: number }[]>();
    for (const band of seasonBands("AU")) {
      const list = byLane.get(band.lane) ?? [];
      list.push(band);
      byLane.set(band.lane, list);
    }

    for (const list of byLane.values()) {
      const sorted = [...list].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start).toBeGreaterThanOrEqual(
          sorted[i - 1].start + sorted[i - 1].length,
        );
      }
    }
  });

  it("uses no more lanes than the busiest overlap requires", () => {
    // Nothing in the AU set stacks more than three deep on any single day.
    const bands = seasonBands("AU");
    const used = new Set(bands.map((b) => b.lane)).size;

    let busiest = 0;
    for (let d = 0; d < 365; d++) {
      const point = d / 365;
      const covering = bands.filter(
        (b) => point >= b.start && point < b.start + b.length,
      ).length;
      busiest = Math.max(busiest, covering);
    }

    expect(used).toBe(busiest);
  });

  it("splits a wrapping season into a tail and a head segment", () => {
    const parts = seasonBands("AU").filter((b) => b.season.id === "christmas-parcels");
    expect(parts).toHaveLength(2);
    expect(parts.some((b) => b.start === 0)).toBe(true);
    expect(parts.some((b) => b.start + b.length === 1)).toBe(true);
  });

  it("returns nothing for a region with no calendar", () => {
    expect(seasonBands("US")).toEqual([]);
  });
});

describe("yearFraction", () => {
  it("is zero on 1 January and near one at year end", () => {
    expect(yearFraction(on(1, 1))).toBe(0);
    expect(yearFraction(on(12, 31))).toBeCloseTo(1, 1);
    expect(yearFraction(on(12, 31))).toBeLessThan(1);
  });

  it("increases monotonically through the year", () => {
    const points = [on(1, 1), on(4, 15), on(7, 1), on(10, 31), on(12, 20)];
    const fractions = points.map(yearFraction);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  });
});

describe("upcomingSeasons", () => {
  it("excludes currently-active seasons", () => {
    const date = on(8, 10);
    const ids = upcomingSeasons("AU", date, 10).map((s) => s.id);
    expect(ids).not.toContain("tax-time");
  });

  it("orders by soonest start", () => {
    const date = on(8, 10);
    const list = upcomingSeasons("AU", date, 10);
    const gaps = list.map((s) => daysUntilStart(s, date));
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps);
  });

  it("respects the limit", () => {
    expect(upcomingSeasons("AU", on(8, 10), 2)).toHaveLength(2);
  });

  it("returns nothing for a region with no calendar", () => {
    expect(upcomingSeasons("US", on(8, 10))).toEqual([]);
  });
});

describe("regionToday", () => {
  // The bug this exists to prevent: production servers run UTC, AEST is UTC+10,
  // so the server date lags the user's by up to ten hours. 1 July is when ATO
  // lodgement opens and tax-scam advice matters most.
  it("resolves an AU date that UTC would still call the previous day", () => {
    // 30 June 23:00 UTC === 1 July 09:00 AEST.
    const utcInstant = new Date(Date.UTC(2026, 5, 30, 23, 0));
    expect(utcInstant.getUTCMonth() + 1).toBe(6); // server sees June
    expect(regionToday("AU", utcInstant)).toEqual({ month: 7, day: 1 });
  });

  it("puts tax season live on the AU morning lodgement opens", () => {
    const utcInstant = new Date(Date.UTC(2026, 5, 30, 23, 0));
    const ids = activeSeasons("AU", regionToday("AU", utcInstant)).map((s) => s.id);
    expect(ids).toContain("tax-time");
  });

  it("keeps EOFY active through the AU end of 30 June", () => {
    // 30 June 13:00 UTC === 30 June 23:00 AEST — still EOFY for the user.
    const utcInstant = new Date(Date.UTC(2026, 5, 30, 13, 0));
    const ids = activeSeasons("AU", regionToday("AU", utcInstant)).map((s) => s.id);
    expect(ids).toContain("eofy-business");
  });

  it("falls back to the server's civil date for a region with no calendar", () => {
    const d = new Date(Date.UTC(2026, 5, 30, 23, 0));
    expect(regionToday("GB", d)).toEqual({ month: d.getMonth() + 1, day: d.getDate() });
  });

  // The reason regionToday returns month/day rather than a Date: the value is
  // resolved on the server and then read again inside a client component, where
  // a Date would be interpreted in the *browser's* timezone. A device set to
  // UTC+13 would shift it a day and show a season active before it starts.
  it("returns a timezone-free value that survives the client boundary", () => {
    const civil = regionToday("AU", new Date(Date.UTC(2026, 5, 30, 23, 0)));
    // Structurally cloneable and meaningful without a timezone — what crosses
    // the RSC wire is exactly what the client reads back.
    expect(JSON.parse(JSON.stringify(civil))).toEqual(civil);
    expect(civil).not.toBeInstanceOf(Date);
  });

  // The concrete defect: a Date carries an instant, so a browser in an extreme
  // offset re-reads it as a different day. Here the server resolves 30 June in
  // Sydney; a device at UTC+14 reading the same instant as a Date sees 1 July
  // and would show tax season a day early. The CivilDate does not move.
  it("does not shift a day on a device in an extreme-offset timezone", () => {
    // 30 June 13:00 UTC === 30 June 23:00 AEST — EOFY, tax season not yet open.
    const instant = new Date(Date.UTC(2026, 5, 30, 13, 0));
    const civil = regionToday("AU", instant);
    expect(civil).toEqual({ month: 6, day: 30 });

    // What a UTC+14 client would have computed from the old noon-anchored Date.
    const asSeenAtPlus14 = new Date(instant.getTime() + 14 * 60 * 60 * 1000);
    expect(asSeenAtPlus14.getUTCDate()).toBe(1); // the day it would have jumped to

    // The season set is driven by the civil date, so it stays correct regardless.
    const ids = activeSeasons("AU", civil).map((s) => s.id);
    expect(ids).toContain("eofy-business");
    expect(ids).not.toContain("tax-time");
  });

  it("applies the summer DST offset, not a fixed one", () => {
    // Sydney is UTC+11 in January (AEDT), not UTC+10, so 1 Jan 13:30 UTC is
    // already 2 Jan locally. Intl handles the transition; a hardcoded offset
    // would get this wrong for half the year.
    expect(regionToday("AU", new Date(Date.UTC(2026, 0, 1, 13, 30)))).toEqual({ month: 1, day: 2 });
  });
});

describe("dayOfYear bounds (via daysUntilStart)", () => {
  // A 0-based month is an easy authoring slip next to all the getMonth() + 1
  // calls. Unclamped it indexes past the table and yields NaN, which sorts
  // arbitrarily and renders as "Starts in about NaN months".
  it("never returns NaN for an out-of-range month", () => {
    const bad = season({ startMonth: 0, startDay: 1, endMonth: 13, endDay: 1 });
    expect(Number.isNaN(daysUntilStart(bad, on(6, 1)))).toBe(false);
  });

  it("never returns NaN for a month above the table", () => {
    const bad = season({ startMonth: 13, startDay: 1, endMonth: 13, endDay: 2 });
    expect(Number.isNaN(daysUntilStart(bad, on(6, 1)))).toBe(false);
  });

  // The day was the undefended half of the pair: an out-of-range day produces an
  // ordinal overlapping the next month, so the season sorts wrongly and counts
  // down to a date that never arrives.
  it("clamps a day beyond the end of the month", () => {
    const bad = season({ startMonth: 4, startDay: 45, endMonth: 5, endDay: 1 });
    const days = daysUntilStart(bad, on(1, 1));
    expect(Number.isNaN(days)).toBe(false);
    // 30 April is the real last day, so it can never read as further out than that.
    expect(days).toBeLessThanOrEqual(daysUntilStart(season({ startMonth: 5, startDay: 1, endMonth: 5, endDay: 2 }), on(1, 1)));
  });

  it("clamps a 31st in a 30-day month to the month's real end", () => {
    const impossible = season({ startMonth: 4, startDay: 31, endMonth: 5, endDay: 1 });
    const real = season({ startMonth: 4, startDay: 30, endMonth: 5, endDay: 1 });
    expect(daysUntilStart(impossible, on(1, 1))).toBe(daysUntilStart(real, on(1, 1)));
  });

  it("clamps a zero or negative day", () => {
    const bad = season({ startMonth: 4, startDay: 0, endMonth: 5, endDay: 1 });
    expect(daysUntilStart(bad, on(1, 1))).toBe(
      daysUntilStart(season({ startMonth: 4, startDay: 1, endMonth: 5, endDay: 1 }), on(1, 1)),
    );
  });
});

describe("isWellFormedWindow", () => {
  it("accepts a real window", () => {
    expect(isWellFormedWindow({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 })).toBe(true);
  });

  it("accepts 29 February being absent — February tops out at 28", () => {
    // Leap years are deliberately ignored throughout, so 29 Feb is not authorable.
    expect(isWellFormedWindow({ startMonth: 2, startDay: 28, endMonth: 3, endDay: 1 })).toBe(true);
    expect(isWellFormedWindow({ startMonth: 2, startDay: 29, endMonth: 3, endDay: 1 })).toBe(false);
  });

  it("rejects a day past the end of a 30-day month", () => {
    expect(isWellFormedWindow({ startMonth: 4, startDay: 31, endMonth: 5, endDay: 1 })).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isWellFormedWindow({ startMonth: 0, startDay: 1, endMonth: 5, endDay: 1 })).toBe(false);
    expect(isWellFormedWindow({ startMonth: 13, startDay: 1, endMonth: 5, endDay: 1 })).toBe(false);
  });

  it("rejects a non-integer date", () => {
    expect(isWellFormedWindow({ startMonth: 4.5, startDay: 1, endMonth: 5, endDay: 1 })).toBe(false);
    expect(isWellFormedWindow({ startMonth: 4, startDay: 1.5, endMonth: 5, endDay: 1 })).toBe(false);
  });

  it("checks the end of the window too, not just the start", () => {
    expect(isWellFormedWindow({ startMonth: 4, startDay: 1, endMonth: 6, endDay: 31 })).toBe(false);
  });
});

describe("calendar/timezone coupling", () => {
  // Belt-and-braces alongside the compile-time guarantee: REGION_TIMEZONE is
  // keyed by `keyof typeof CALENDARS`, so a region with seasons but no timezone
  // fails to build. This asserts the observable consequence — that every region
  // with a calendar actually resolves a date away from the raw server clock.
  it("resolves a region-local date for every region that has a calendar", () => {
    // 30 June 23:00 UTC — a boundary instant where every region we author a
    // calendar for is already on the following civil day.
    //
    // Compared against UTC rather than the *runner's* local date: production
    // runs UTC, and comparing to local would make this pass or fail depending on
    // where the test happens to run (it read as a false failure under TZ=Sydney,
    // where the server clock legitimately agrees with the region).
    const instant = new Date(Date.UTC(2026, 5, 30, 23, 0));
    const utcCivil = { month: instant.getUTCMonth() + 1, day: instant.getUTCDate() };

    for (const code of supportedRegions()) {
      if (calendarForRegion(code).length === 0) continue;
      expect(
        regionToday(code, instant),
        `${code} has a calendar but resolved to the UTC date`,
      ).not.toEqual(utcCivil);
    }
  });
});

describe("surfacing (home teaser / learn card / calendar page)", () => {
  // The teaser, the Learn link card and the calendar page all derive their
  // content from activeSeasons(), so they cannot disagree about what is in
  // season. This pins that shared source rather than the three renderers.
  it("gives the same active seasons to every surface", () => {
    const date = on(8, 10);
    const forCalendar = activeSeasons("AU", date).map((s) => s.id);
    const forTeaser = activeSeasons("AU", date).map((s) => s.id);
    expect(forTeaser).toEqual(forCalendar);
    expect(forTeaser.length).toBeGreaterThan(0);
  });

  // Both the teaser and the Learn card hide themselves when nothing is active,
  // so an empty result must be reachable rather than theoretical — otherwise the
  // hidden branch is dead code that never gets exercised.
  it("returns nothing for a region without a calendar, so teasers stay hidden", () => {
    expect(activeSeasons("GB", on(8, 10))).toEqual([]);
    expect(activeSeasons("ZZ", on(8, 10))).toEqual([]);
  });

  it("exposes a title for every active season, for the teaser's summary line", () => {
    for (const s of activeSeasons("AU", on(8, 10))) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.why.trim().length).toBeGreaterThan(0);
    }
  });

  // The AU calendar has real quiet stretches — roughly March–May and the first
  // half of November. The teaser and Learn card correctly hide themselves then,
  // which is the honest behaviour: inventing a season to keep a banner on screen
  // would be filling space rather than warning anyone.
  //
  // This documents the quiet months rather than forbidding them, so that adding
  // or removing a season shows up here as a deliberate change in coverage.
  it("has quiet months, and hides the teaser rather than inventing a season", () => {
    const quietMonths = new Set<number>();
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day++) {
        if (activeSeasons("AU", on(month, day)).length === 0) quietMonths.add(month);
      }
    }
    expect([...quietMonths].sort((a, b) => a - b)).toEqual([3, 4, 5, 11]);
  });

  it("covers the months that matter most for AU scams", () => {
    // Tax time and the pre-Christmas retail window are the two periods the
    // calendar exists for; a gap in either would be a coverage bug.
    for (const month of [6, 7, 8, 9, 10, 12]) {
      expect(
        activeSeasons("AU", on(month, 15)).length,
        `no active season mid-month ${month}`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("formatWindow", () => {
  it("formats a normal window", () => {
    expect(formatWindow({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 }))
      .toBe("1 July – 31 October");
  });

  it("formats a year-wrapping window without special-casing", () => {
    expect(formatWindow({ startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 }))
      .toBe("20 November – 15 January");
  });
});
