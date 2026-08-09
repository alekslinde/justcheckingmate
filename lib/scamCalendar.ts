// Scam calendar — which campaigns spike, and when.
//
// Purely educational: this module feeds a calendar view that teaches people what
// to expect at this time of year. It does **not** touch scoring. A verdict must
// not change because of the date — a tax scam in March is still a tax scam, and
// a legitimate ATO email in July is still legitimate. Seasonality raises the
// *base rate* of a campaign, which is useful for a human to know and dangerous
// for a scorer to assume, so it stays out of scamDetector entirely.
//
// The data mirrors the region-pack pattern in lib/regions: seasons are data, not
// logic, and are authored per region. Only AU is authored today; every other
// region resolves to an empty list and the UI hides the section rather than
// showing Australian tax dates to a British user (see calendarForRegion).
//
// Windows are month/day pairs with no year, because these recur annually. That
// makes them comparable across years but means a window can wrap the year end
// (Christmas parcel scams run late November into early January) — isActiveOn
// handles that case explicitly rather than assuming start <= end.

import type { RegionCode } from "@/lib/regions";

/** A recurring annual window. Month is 1-12 to match how people write dates. */
export interface SeasonWindow {
  /** 1-12. */
  startMonth: number;
  startDay: number;
  /** 1-12. */
  endMonth: number;
  endDay: number;
}

/**
 * How reliably this campaign spikes in its window.
 *
 * Honesty matters more than drama here: `fixed` is a date the calendar itself
 * guarantees (tax lodgement opens July 1 every year), while `floating` shifts
 * annually (Black Friday tracks US Thanksgiving) and `elevated` is a broad
 * seasonal lift rather than a sharp spike. The UI says which, so nobody reads a
 * soft trend as a hard deadline.
 */
export type SeasonConfidence = "fixed" | "floating" | "elevated";

export interface ScamSeason {
  /** Stable identifier — used as a React key and for message lookups. */
  id: string;
  /** Short display name, e.g. "Tax season". */
  title: string;
  window: SeasonWindow;
  confidence: SeasonConfidence;
  /** One sentence on why this window is busy. */
  why: string;
  /** The specific lures that spike. Concrete beats abstract for recognition. */
  lures: string[];
  /**
   * What to actually do. Phrased as a verifiable habit rather than "be careful",
   * so the calendar teaches a check rather than just raising anxiety.
   */
  advice: string;
}

// ── Australia ───────────────────────────────────────────────────────────────
//
// Sourced from the campaigns already detected in lib/regions/au.ts, so the
// calendar explains signals the tool genuinely looks for rather than inventing
// a parallel taxonomy. Where au.ts carries a keyword group, the season below
// names the same campaign.

const AU_SEASONS: ScamSeason[] = [
  {
    id: "tax-time",
    title: "Tax season",
    // Lodgement opens 1 July; ATO impersonation reports peaked in July and stay
    // elevated while returns are processed and debts issued.
    window: { startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 },
    confidence: "fixed",
    why: "Tax returns open on 1 July, so a message about your refund or a tax debt suddenly looks plausible. ATO impersonation reports jump sharply in July and stay high while returns are processed.",
    lures: [
      "\"Your tax refund is waiting — confirm your bank details\"",
      "\"You have an outstanding tax debt, legal action will be taken\"",
      "Fake myGov and ATO login pages",
      "\"Your TFN has been suspended\"",
    ],
    advice: "The ATO never sends a link to log in, and never threatens arrest by SMS. Open the ATO app or type my.gov.au yourself — never follow the link in the message.",
  },
  {
    id: "eofy-business",
    title: "End of financial year",
    // June: invoice/BAS pressure on businesses before the 30 June close.
    window: { startMonth: 6, startDay: 1, endMonth: 6, endDay: 30 },
    confidence: "fixed",
    why: "Businesses are pushing through invoices and BAS before 30 June, so a fake invoice or a \"we've changed our bank details\" email lands in a pile of real ones.",
    lures: [
      "Fake supplier invoices with changed bank details",
      "\"Update your payment details before EOFY\"",
      "Fake super contribution deadline notices",
    ],
    advice: "Any bank-detail change on an invoice gets a phone call to a number you already had — not the number on the invoice. This is the single most expensive scam for Australian businesses.",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    // Floating: tracks US Thanksgiving (fourth Thursday of November), so the
    // window is deliberately wide rather than pinned to a date that moves.
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Everyone is expecting deals from brands they don't normally hear from, which is exactly the cover a fake store or discount SMS needs.",
    lures: [
      "Fake online stores advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand impersonation SMS with shortened links",
      "Too-good-to-be-true prices on sold-out items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping the ad or the text. If a store is new to you, check how long the domain has existed before you enter card details.",
  },
  {
    id: "christmas-parcels",
    title: "Christmas parcel season",
    // Wraps the year end — the January tail covers returns and late deliveries.
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on parcels, so \"delivery failed\" is a guess that pays off far more often than usual.",
    lures: [
      "\"Your parcel is held — pay a redelivery fee\"",
      "Fake Australia Post and courier tracking pages",
      "\"Invalid postal code, update your address\"",
      "Fake charity appeals in the giving season",
    ],
    advice: "Australia Post never asks for a fee by SMS link. Track parcels in the official app using the tracking number you were given at purchase.",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app signups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money in six months.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or share \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who moves the conversation to investing, is running a script. Money sent is money gone — reverse-image-search their photos.",
  },
  {
    id: "winter-energy",
    title: "Winter energy bills",
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Winter bills are high and cost-of-living rebates are in the news, so both \"you owe us\" and \"here's your rebate\" find willing readers.",
    lures: [
      "\"Your energy rebate is ready — claim it now\"",
      "Fake AGL, Origin and EnergyAustralia disconnection notices",
      "\"Final notice before disconnection\"",
    ],
    advice: "Log in to your energy account directly to check any balance or rebate. Real rebates are applied to your bill, not paid out after you enter your card details.",
  },
  {
    id: "back-to-school",
    title: "Back to school & enrolment",
    window: { startMonth: 1, startDay: 10, endMonth: 2, endDay: 20 },
    confidence: "elevated",
    why: "School fees, uniform orders and enrolment paperwork all move in the same few weeks, and parents are paying invoices from addresses they've never seen before.",
    lures: [
      "Fake school fee invoices with altered bank details",
      "\"Confirm your child's enrolment details\"",
      "Fake student discount and device offers",
    ],
    advice: "Confirm any school payment request through the school's published phone number before paying, especially if the bank details differ from last term.",
  },
];

const CALENDARS: Partial<Record<RegionCode, ScamSeason[]>> = {
  AU: AU_SEASONS,
};

/**
 * IANA timezone used to decide what "today" is for a region's calendar.
 *
 * Necessary because the server clock is not the user's clock: in production it
 * is UTC, and AEST is UTC+10. Reading the raw server date would place an AU user
 * loading the page at 9am on 1 July into 30 June — showing "Tax season" as
 * *upcoming* on the exact morning ATO lodgement opens, which is precisely when
 * the advice matters most. Every AU-facing date here (1 July, 30 June EOFY) sits
 * on a boundary that a ten-hour skew crosses.
 *
 * One zone per region is a deliberate simplification. Australia spans three, so
 * this is the eastern seaboard where most of the population lives; the error for
 * a Perth user is at most two hours on a boundary day, against a guaranteed ten
 * hours for everyone if we used UTC. Seasons are month-scale windows, so a
 * two-hour edge case is immaterial in a way a systematic skew is not.
 */
const REGION_TIMEZONE: Partial<Record<RegionCode, string>> = {
  AU: "Australia/Sydney",
};

/**
 * Today's civil date in a region's local timezone, as a Date whose local-time
 * fields (getMonth/getDate) read as that region's date.
 *
 * Intl gives the correct civil date without a timezone library and handles DST
 * itself. The result is only ever consumed through getMonth()/getDate() by the
 * windowing functions below, so re-anchoring those fields is sufficient — the
 * returned value is not a true instant and must not be treated as one.
 */
export function regionToday(code: RegionCode, now: Date = new Date()): Date {
  const timeZone = REGION_TIMEZONE[code];
  if (!timeZone) return now;

  // en-CA formats as YYYY-MM-DD, so the parts are unambiguous by type.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const field = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = field("year");
  const month = field("month");
  const day = field("day");

  // Intl should always supply all three; if a runtime somehow doesn't, fall back
  // to the server date rather than constructing an invalid one.
  if (!year || !month || !day) return now;

  // Anchored at midday so no local DST shift can move the date field.
  return new Date(year, month - 1, day, 12);
}

/**
 * Seasons authored for a region, or an empty list where we have none.
 *
 * Empty is the honest answer, not a reason to substitute Australia's calendar:
 * the whole point of the region packs is that showing AU tax dates to a UK user
 * is worse than showing nothing. Callers render nothing on an empty list.
 */
export function calendarForRegion(code: RegionCode): ScamSeason[] {
  return CALENDARS[code] ?? [];
}

/** Whether any region has an authored calendar — drives nav/link visibility. */
export function hasCalendar(code: RegionCode): boolean {
  return calendarForRegion(code).length > 0;
}

// Day-of-year style ordinal that ignores leap years. Comparing (month, day)
// pairs as a single number is enough for windowing and avoids Date arithmetic
// entirely, which keeps this pure and timezone-free.
function ordinal(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Whether a season is active on a given date.
 *
 * Handles year-wrapping windows (Nov 20 → Jan 15): when the start ordinal is
 * greater than the end ordinal, the window is the *union* of "after the start"
 * and "before the end" rather than the empty intersection a naive range check
 * would produce.
 */
export function isActiveOn(season: ScamSeason, date: Date): boolean {
  const now = ordinal(date.getMonth() + 1, date.getDate());
  const start = ordinal(season.window.startMonth, season.window.startDay);
  const end = ordinal(season.window.endMonth, season.window.endDay);

  return start <= end
    ? now >= start && now <= end
    : now >= start || now <= end;
}

/** Seasons active on `date`, in authored order. */
export function activeSeasons(code: RegionCode, date: Date): ScamSeason[] {
  return calendarForRegion(code).filter((s) => isActiveOn(s, date));
}

// Distance in days from `now` to the next occurrence of a window's start,
// ignoring leap years. Used only for ordering and for the "starts in N weeks"
// hint, so month-length approximation is acceptable and kept deliberately
// simple rather than pulling in date arithmetic.
const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

// Clamped rather than trusting the caller: an out-of-range month indexes past
// the table and yields undefined, which turns into NaN and propagates silently
// into both the sort order and the rendered "starts in about NaN months". A
// 0-based month is an easy authoring slip given the getMonth() + 1 calls
// nearby, so this fails visibly-but-safely instead of poisoning the output.
function dayOfYear(month: number, day: number): number {
  const clamped = Math.min(Math.max(Math.trunc(month), 1), 12);
  return DAYS_BEFORE_MONTH[clamped] + day;
}

export function daysUntilStart(season: ScamSeason, date: Date): number {
  const today = dayOfYear(date.getMonth() + 1, date.getDate());
  const start = dayOfYear(season.window.startMonth, season.window.startDay);
  const diff = start - today;
  return diff >= 0 ? diff : diff + 365;
}

/**
 * Seasons that aren't active yet, ordered by how soon they start.
 *
 * `limit` defaults to 3 — the calendar's "coming up" strip is a glance, not an
 * index; the full year is listed separately below it.
 */
export function upcomingSeasons(code: RegionCode, date: Date, limit = 3): ScamSeason[] {
  // Decorate-sort-undecorate: the distance is computed once per season rather
  // than on every comparison, so the comparator is a plain numeric compare over
  // fixed values and cannot go non-transitive if daysUntilStart ever changes.
  return calendarForRegion(code)
    .filter((s) => !isActiveOn(s, date))
    .map((season) => ({ season, days: daysUntilStart(season, date) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, limit)
    .map(({ season }) => season);
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Human-readable window, e.g. "1 July – 31 October". */
export function formatWindow(window: SeasonWindow): string {
  const start = `${window.startDay} ${MONTH_NAMES[window.startMonth]}`;
  const end = `${window.endDay} ${MONTH_NAMES[window.endMonth]}`;
  return `${start} – ${end}`;
}
