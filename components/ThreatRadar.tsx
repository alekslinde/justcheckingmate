"use client";

// Threat radar — what's circulating now, grouped by how live it is.
//
// A client component for the same reason ScamCalendar is one: it reads the tone
// preference, which lives in localStorage and is invisible to the server.
//
// Unlike the calendar it takes no date prop. Nothing here is computed against
// "today" — an entry's status is authored by the sweep that reviewed it, not
// derived from how old its lastSeen is. That is deliberate: a campaign quiet for
// three weeks is not automatically dead, and inferring "subsided" from a date
// would silently downgrade live threats between sweeps. A human decides, and the
// "Reviewed <date>" line tells the reader how fresh that judgement is.
//
// Educational only — nothing here influences a verdict.

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useLang, type MessageKey } from "@/lib/lang";
import {
  radarForRegion,
  threatsByStatus,
  lastUpdated,
  formatRadarDate,
  roadmapUrl,
  radarSummary,
  uncoveredThreats,
  filterByChannel,
  channelCounts,
  type ThreatEntry,
  type RadarCoverage,
  type RadarChannel,
  type ChannelFilterValue,
} from "@/lib/threatRadar";
import { resolveRegionPack, type RegionCode } from "@justcheckingmate/engine/regions";
import FreshnessStamp from "./FreshnessStamp";
import PageHeader from "./PageHeader";
import RegionBar from "./RegionBar";

// Matches the card styling used across Learn, About and the calendar.
const CARD = "bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl p-6 space-y-6";
const H2 =
  "font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--foreground)]";

// Group heading: the display face with the count carried as a pill, so the shape
// of the board reads at a glance rather than having to be counted by scrolling.
const H3 =
  "font-[family-name:var(--font-display)] font-semibold text-[clamp(18px,2.2vw,22px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]";

// How many rows a group shows before the "show more" cap. Five is what fits on a
// phone without the next group's heading being pushed out of reach, which is
// what makes the board's shape scannable rather than a single long scroll.
const GROUP_CAP = 5;

// The channel filter's options, in the order they are offered. "all" first
// because it is the default; the rest follow the RadarChannel union so a new
// channel is a compile error here rather than a silently missing button.
const CHANNELS = ["sms", "email", "phone", "web", "mixed"] as const satisfies readonly RadarChannel[];

// Coverage is rendered as inline text in the collapsed row rather than as a
// filled badge. A badge on every card put the same "covered" pill on the large
// majority of rows, which read as decoration and crowded out the title; naming
// only the exceptions makes the exceptions visible. Where it is called out, amber is
// deliberate — red is the verdict colour in this app, and a detection gap is a
// statement about us, not about anything the user is holding.
//
// "n/a" is not a valid message-key fragment, so the lookup goes through a map
// rather than being interpolated. Keyed by the union so a new coverage value is
// a compile error here rather than a raw key rendered to the page.
const COVERAGE_KEY: Record<RadarCoverage, MessageKey> = {
  covered: "radar.coverage.covered",
  partial: "radar.coverage.partial",
  none: "radar.coverage.none",
  "n/a": "radar.coverage.na",
};

/**
 * One campaign, collapsed to a scannable row until asked to open.
 *
 * The first draft rendered every card at full weight — badge, summary, lures,
 * advice, detection, source, five section labels — once per entry. That
 * measured 17,000px on a phone, twenty screens of scrolling, with no single card
 * fitting on screen at once, and it made scanning impossible: the reader had to
 * read to find out whether a card was relevant to them.
 *
 * So the card carries only what supports the scan decision — title, channel,
 * and a coverage marker — and everything else moves behind a `<details>`. The
 * detail is unchanged when opened; it just stops being mandatory. `<details>`
 * rather than state because it needs no JS, survives Ctrl+F (browsers open a
 * closed `<details>` to reveal a match), and is keyboard- and screen-reader-
 * navigable for free.
 */
function ThreatCard({ threat }: { threat: ThreatEntry }) {
  const { t } = useLang();
  const isGap = threat.coverage === "partial" || threat.coverage === "none";

  return (
    <article className="rounded-xl border border-[var(--rule)] bg-[var(--ink)]">
      <details className="group">
        {/* Matches the filter dropdowns on the reports page, which are the app's
            existing "open this to see more" affordance: a right-aligned chevron
            at the same weight and near-white tint. Those dropdowns draw their
            own chevron rather than using the native <select> indicator, which
            iOS Safari paints in light-mode chrome regardless of text colour.
            The default <details> marker is suppressed because it can't be sized
            or coloured to match — it renders as a small dim triangle on the
            left, far weaker than the control it sits beside. Drawn as an inline
            SVG rather than a text glyph so stroke weight is explicit and the
            rotation is smooth. */}
        <summary className="cursor-pointer list-none p-4 min-h-[44px] rounded-xl hover:bg-[var(--ink-3)]/50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {/* h4, one level below the group heading — the cards nest inside
                  "Circulating now", and matching its level would flatten the
                  two in a screen reader's outline. */}
              <h4 className="font-semibold text-[var(--foreground)] text-[15px]">{threat.title}</h4>
              <p className="text-xs text-[var(--faint)] mt-1">
                {t(`radar.channel.${threat.channel}` as MessageKey)}
                {/* Only the exceptions are named in the collapsed row. "We catch
                    this" was on 20 of 25 cards — a near-constant label spending
                    the most prominent slot on the card to say nothing. Silence
                    now means covered, and the summary line above states that
                    convention so the absence is readable rather than ambiguous. */}
                {isGap && (
                  <>
                    {" · "}
                    <span className="text-[var(--caution)]">{t(COVERAGE_KEY[threat.coverage])}</span>
                  </>
                )}
                {threat.coverage === "n/a" && (
                  <>
                    {" · "}
                    <span className="text-[var(--text-dim)]">{t(COVERAGE_KEY[threat.coverage])}</span>
                  </>
                )}
              </p>
            </div>
            {/* Same geometry as the <select> chevrons on /submissions and the
                Collapsible on Learn — a downward V at stroke-width 2.5, rotated
                180° here on open. */}
            <svg
              className="shrink-0 w-[18px] h-[18px] mt-0.5 text-[var(--faint)] transition-transform duration-200 group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          {/* Visible only to assistive tech: the chevron alone doesn't say what
              opening the row would reveal. */}
          <span className="sr-only">{t("radar.expand")}</span>
        </summary>

        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-[var(--text-dim)] leading-relaxed">{threat.summary}</p>

          <div className="space-y-1.5">
            <p className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
              {t("radar.lures.heading")}
            </p>
            <ul className="space-y-1 list-none">
              {/* Index-suffixed rather than keyed on the string alone: two
                  entries could legitimately quote the same lure, and nothing in
                  the data model forbids it. The list is static, so index is
                  stable here. */}
              {threat.lures.map((lure, i) => (
                <li key={`${lure}-${i}`} className="flex items-start gap-2 text-sm text-[var(--text-dim)]">
                  <span className="text-[var(--caution)] mt-0.5 shrink-0" aria-hidden="true">⚑</span>
                  <span>{lure}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 pt-1 border-t border-[var(--rule)] mt-1">
            <span className="text-[var(--clear)] mt-2 shrink-0" aria-hidden="true">✓</span>
            <p className="text-sm text-[var(--text-dim)] pt-1.5 leading-relaxed">{threat.advice}</p>
          </div>

          {/* What we do about it. For `none` and `n/a` there is no rule to
              describe, so a fixed line states the gap rather than leaving a
              silent absence the reader would fill in optimistically. */}
          <div className="text-xs text-[var(--faint)] border-t border-[var(--rule)] pt-3 space-y-1">
            <p className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em]">
              {t("radar.detection.heading")}
            </p>
            <p>
              {threat.detection ??
                t(threat.coverage === "n/a" ? "radar.coverage.na.body" : "radar.coverage.none.body")}
            </p>
            {/* The evidence link. Every claim on this card traces to the sweep
                that recorded it — without this the provenance is asserted rather
                than checkable, which is the whole difference from a news feed. */}
            <p className="pt-1">
              <a
                href={roadmapUrl(threat)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-dim)] hover:text-[var(--clear)] underline underline-offset-2 transition-colors"
              >
                {t("radar.source", { date: formatRadarDate(threat.lastSeen) })}
              </a>
            </p>
          </div>
        </div>
      </details>
    </article>
  );
}

/**
 * One status group, capped until asked to show the rest.
 *
 * The cap is per-group rather than per-page: without it the first group runs
 * long enough that the second group's heading is off-screen, and the heading is
 * what tells the reader the board has a shape at all. Entries are already
 * ordered most-recently-seen first, so the visible five are the freshest.
 *
 * Collapsing scrolls the group's own heading back into view — otherwise the page
 * shortens under the reader and leaves them somewhere further down than where
 * they clicked.
 */
function ThreatGroup({ heading, threats }: { heading: string; threats: ThreatEntry[] }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (threats.length === 0) return null;

  const shown = expanded ? threats : threats.slice(0, GROUP_CAP);
  const hiddenCount = threats.length - shown.length;

  return (
    <section className="space-y-3">
      <h3 ref={headingRef} className={`${H3} flex items-center gap-2.5 scroll-mt-24`}>
        {heading}
        {/* The count belongs with the heading, not in prose below it: "how many"
            is the first thing asked of a list like this. */}
        <span className="font-[family-name:var(--font-mono-ui)] text-[12px] font-medium text-[var(--text-dim)] bg-[var(--ink-3)] rounded-full px-2 py-0.5 tabular-nums">
          {threats.length}
        </span>
      </h3>
      <div className="space-y-2.5">
        {shown.map((threat) => (
          <ThreatCard key={threat.id} threat={threat} />
        ))}
      </div>
      {(hiddenCount > 0 || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            const collapsing = expanded;
            setExpanded(!expanded);
            if (collapsing) headingRef.current?.scrollIntoView({ block: "start" });
          }}
          className="w-full font-[family-name:var(--font-mono-ui)] text-[11px] tracking-[0.07em] uppercase text-[var(--text-dim)] border border-[var(--rule)] rounded-lg px-3.5 py-2.5 hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
        >
          {expanded ? t("radar.fewer") : t("radar.more", { n: hiddenCount })}
        </button>
      )}
    </section>
  );
}

/**
 * Filter by how a scam reaches you — the one axis a reader actually arrives
 * with ("I got a text"). Status and coverage are our categories; the channel is
 * theirs, which is why it is the filter offered rather than the other two.
 */
function ChannelFilter({
  value,
  counts,
  total,
  onChange,
}: {
  value: ChannelFilterValue;
  counts: Record<RadarChannel, number>;
  total: number;
  onChange: (next: ChannelFilterValue) => void;
}) {
  const { t } = useLang();

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-[var(--clear)]/40 bg-[var(--clear)]/12 text-[var(--clear)]"
        : "border-[var(--rule)] text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--ink-3)]"
    }`;

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("radar.filter.heading")}>
      <button type="button" aria-pressed={value === "all"} onClick={() => onChange("all")} className={chip(value === "all")}>
        {t("radar.filter.all")} <span className="tabular-nums opacity-70">{total}</span>
      </button>
      {CHANNELS.map((ch) => {
        // A channel with no entries in this region is not offered: a button that
        // can only ever empty the board is a dead end, not a filter.
        if (counts[ch] === 0) return null;
        return (
          <button
            key={ch}
            type="button"
            aria-pressed={value === ch}
            onClick={() => onChange(ch)}
            className={chip(value === ch)}
          >
            {t(`radar.filter.${ch}` as MessageKey)}{" "}
            <span className="tabular-nums opacity-70">{counts[ch]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The honest empty state, shown only on the standalone page.
 *
 * Same contract as the calendar's: inline, an unauthored region renders nothing
 * because surrounding content carries the page; as a whole page that would be a
 * dead end, so this says plainly we have no data rather than substituting
 * another country's campaigns.
 */
function EmptyState({ region }: { region: RegionCode }) {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      {/* The region bar renders here too, and it has to: picking a region we
          have no radar for is a normal thing to do, and without the control
          still on screen it would be a dead end with no way back. */}
      <RegionBar region={region} />
      <article className={CARD}>
        <section className="space-y-2">
          <h2 className={H2}>{t("radar.empty.heading")}</h2>
          <p className="text-sm text-[var(--text-dim)]">{t("radar.empty.body")}</p>
        </section>
        <Link
          href="/learn"
          className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
        >
          {t("radar.learnCta")}
        </Link>
      </article>
    </div>
  );
}

export default function ThreatRadar({
  region,
  standalone = false,
}: {
  region: RegionCode;
  /** Renders an explanatory empty state instead of nothing when true. */
  standalone?: boolean;
}) {
  const { t } = useLang();
  const all = radarForRegion(region);
  const [channel, setChannel] = useState<ChannelFilterValue>("all");
  const counts = useMemo(() => channelCounts(region), [region]);

  if (all.length === 0) return standalone ? <EmptyState region={region} /> : null;

  const reviewed = lastUpdated(region);
  // Named rather than hardcoded: the intro renders for whichever region has an
  // authored radar, and RADARS is shaped to hold more than one. "circulating in
  // Australia" was correct only for as long as AU stayed the only entry.
  const regionName = resolveRegionPack(region).name;
  const summary = radarSummary(region);
  const gaps = uncoveredThreats(region);
  const byChannel = (entries: ThreatEntry[]) => filterByChannel(entries, channel);

  return (
    <article className={standalone ? "space-y-6" : CARD} id="threat-radar">
      {/* Standalone, this is the page, so it takes the page header every other
          page uses. Inline on the home page it is one card among several and
          keeps the smaller heading, which is why the two differ. */}
      {standalone ? (
        <>
          {/* The neutrality line rides with the lede rather than floating below
              the header: it qualifies what the lede just promised, and a gap
              between them reads as a new section starting. */}
          <PageHeader
            eyebrow={t("radar.eyebrow")}
            title={t("radar.headline")}
            lede={`${t("radar.intro", { region: regionName })} ${t("radar.neutrality")}`}
          />
        </>
      ) : (
        <section className="space-y-2">
          <h2 className={H2}>{t("radar.title")}</h2>
          <p className="text-sm text-[var(--text-dim)]">{t("radar.intro", { region: regionName })}</p>
          <p className="text-sm text-[var(--faint)]">{t("radar.neutrality")}</p>
        </section>
      )}

      {/* Which region's board this is, and how to change it. Standalone only:
          inline on the home page the check flow already owns region, and a
          second control for the same thing would be a fork, not a convenience.
          It sits above the freshness stamp because "whose data" comes before
          "how fresh" — a fresh review of the wrong country is still wrong. */}
      {standalone && <RegionBar region={region} />}

      {/* Promoted from a grey line beside the heading: how current the data
          is deserves to be read, not found. */}
      {reviewed && (
        <FreshnessStamp
          date={formatRadarDate(reviewed)}
          note={t("radar.freshness.note", { n: String(summary.total) })}
        />
      )}

      {/* The orienting line. With every card collapsed, the shape of the board
          is no longer visible by scrolling it — this states the counts up front,
          and establishes the convention the collapsed rows rely on: coverage is
          only called out where it is *not* complete. */}
      <section className="rounded-xl border border-[var(--rule)] bg-[var(--ink)] p-4 space-y-2">
        <h3 className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
          {t("radar.summary.heading")}
        </h3>
        <p className="text-sm text-[var(--text-dim)] leading-relaxed">
          {t("radar.summary.body", {
            active: summary.active,
            watchlist: summary.watchlist,
            covered: summary.covered,
            total: summary.total,
          })}
        </p>
      </section>

      {/* Gaps first, before the full board. They are the handful of entries
          where the reader is genuinely on their own, and burying them among the
          many "we catch this" rows is the one ordering that makes
          the honesty useless. Same cards, so nothing is duplicated in substance
          — they simply also appear in their status group below. */}
      {/* Filter by how it reaches you, then the count line that says what the
          board is currently showing — without it, a filter that hides most of
          the page looks like missing data rather than an applied filter. */}
      <div className="space-y-2.5">
        <ChannelFilter value={channel} counts={counts} total={all.length} onChange={setChannel} />
        <p className="text-[12.5px] text-[var(--faint)]" aria-live="polite">
          {channel === "all"
            ? t("radar.showing.all", { n: all.length })
            : t("radar.showing.filtered", { n: counts[channel], total: all.length })}
        </p>
      </div>

      {/* Every group empty means the filter matched nothing. Saying so beats
          rendering a page of headings with nothing under them, which reads as
          broken rather than filtered. */}
      {channel !== "all" && counts[channel] === 0 && (
        <p className="text-sm text-[var(--text-dim)]">{t("radar.filter.none")}</p>
      )}

      {/* The channel in each key remounts the group when the filter changes, so
          a group left expanded doesn't stay expanded over a different, shorter
          list — the "show fewer" button would then be offering to collapse rows
          the reader never expanded. */}
      {gaps.length > 0 && (
        <ThreatGroup
          key={`gaps-${channel}`}
          heading={t("radar.gaps.heading")}
          threats={byChannel(gaps)}
        />
      )}

      <ThreatGroup
        key={`active-${channel}`}
        heading={t("radar.active.heading")}
        threats={byChannel(threatsByStatus(region, "active"))}
      />
      <ThreatGroup
        key={`watchlist-${channel}`}
        heading={t("radar.watchlist.heading")}
        threats={byChannel(threatsByStatus(region, "watchlist"))}
      />
      <ThreatGroup
        key={`subsided-${channel}`}
        heading={t("radar.subsided.heading")}
        threats={byChannel(threatsByStatus(region, "subsided"))}
      />

      <div className="border-t border-[var(--rule)] pt-4 space-y-3">
        <div className="space-y-1">
          <p className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
            {t("radar.method.heading")}
          </p>
          <p className="text-xs text-[var(--faint)] leading-relaxed max-w-[70ch]">{t("radar.method.body")}</p>
        </div>
        {/* Only on the standalone page — inline, the surrounding page carries
            its own navigation and one of these would link to itself. */}
        {standalone && (
          <div className="flex flex-col gap-2">
            <Link
              href="/calendar"
              className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
            >
              {t("radar.calendarCta")}
            </Link>
            <Link
              href="/learn"
              className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
            >
              {t("radar.learnCta")}
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
