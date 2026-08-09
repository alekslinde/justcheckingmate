import { describe, it, expect } from "vitest";
import {
  calendarForRegion,
  hasCalendar,
  isActiveOn,
  activeSeasons,
  upcomingSeasons,
  daysUntilStart,
  formatWindow,
  regionToday,
  type ScamSeason,
} from "@/lib/scamCalendar";
import { supportedRegions } from "@/lib/regions";

// Local dates throughout: isActiveOn reads getMonth/getDate, so constructing
// with new Date(y, m, d) keeps the test independent of the runner's timezone.
const on = (month: number, day: number) => new Date(2026, month - 1, day);

const season = (window: ScamSeason["window"]): ScamSeason => ({
  id: "test",
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

  it("authors every season with valid month/day bounds", () => {
    for (const s of calendarForRegion("AU")) {
      expect(s.window.startMonth).toBeGreaterThanOrEqual(1);
      expect(s.window.startMonth).toBeLessThanOrEqual(12);
      expect(s.window.endMonth).toBeGreaterThanOrEqual(1);
      expect(s.window.endMonth).toBeLessThanOrEqual(12);
      expect(s.window.startDay).toBeGreaterThanOrEqual(1);
      expect(s.window.startDay).toBeLessThanOrEqual(31);
      expect(s.window.endDay).toBeGreaterThanOrEqual(1);
      expect(s.window.endDay).toBeLessThanOrEqual(31);
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
    const au = regionToday("AU", utcInstant);
    expect(au.getMonth() + 1).toBe(7); // user is already in July
    expect(au.getDate()).toBe(1);
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

  it("returns the given date unchanged for a region with no timezone mapped", () => {
    const d = new Date(Date.UTC(2026, 5, 30, 23, 0));
    expect(regionToday("GB", d).getTime()).toBe(d.getTime());
  });

  it("applies the summer DST offset, not a fixed one", () => {
    // Sydney is UTC+11 in January (AEDT), not UTC+10, so 1 Jan 13:30 UTC is
    // already 2 Jan locally. Intl handles the transition; a hardcoded offset
    // would get this wrong for half the year.
    const au = regionToday("AU", new Date(Date.UTC(2026, 0, 1, 13, 30)));
    expect(Number.isNaN(au.getTime())).toBe(false);
    expect(au.getMonth() + 1).toBe(1);
    expect(au.getDate()).toBe(2);
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
