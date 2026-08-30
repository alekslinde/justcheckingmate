"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";
import { AUTH_LEGEND, StaticAuthPill } from "@/components/AuthBadges";
import PageHeader from "@/components/PageHeader";
import EmailExportGuide from "@/components/EmailExportGuide";
import Collapsible from "@/components/Collapsible";
import { activeSectionId } from "@/lib/toc";

// Type icons mirror the input/report type pickers used across the app, so they
// stay as a consistent scanning aid. The tactic/source/flag lists used purely
// decorative emoji and now lead with a neutral marker instead.
const SCAM_TYPE_ICONS = ["🔗", "📱", "📧", "📞", "📷"];
const TACTIC_COUNT = 6;
const SOURCE_COUNT = 6;
const FLAG_COUNT = 8;

const AGENCIES = [
  { name: "Scamwatch (ACCC)", abbr: null, site: "scamwatch.gov.au", href: "https://www.scamwatch.gov.au" },
  { name: "ReportCyber", abbr: "Australian Signals Directorate", site: "cyber.gov.au/report", href: "https://www.cyber.gov.au/report" },
  { name: "IDCARE (ID theft)", abbr: null, site: "idcare.org", href: "https://www.idcare.org" },
  { name: "ACSC", abbr: "Australian Cyber Security Centre", site: "cyber.gov.au", href: "https://www.cyber.gov.au" },
];

// The explanatory content is now a sequence of <Collapsible> cards, each grouped
// by how it's read: orientation (what scams look like, where they come from),
// the core teaching (how scammers operate, red flags, what to do), and technical
// reference (email auth). Reference and secondary sections collapse by default;
// the core teaching stays open but is split so any part can be collapsed. The
// coloured callouts — "if you've been caught" (red) and "where to report"
// (emerald) — stay standalone open cards: their colour carries meaning.
//
// H2 matches the heading style Collapsible renders in its summary, so the two
// remaining plain cards (calendar pointer, and the callouts' headings) sit at
// the same visual level as the disclosures around them.
const H2 =
  "font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--foreground)]";

const key = (k: string) => k as MessageKey;

// Anchors for the jump links. Kept next to the TOC that renders them so a
// renamed section can't leave a link pointing at nothing.
const TOC = [
  { id: "caught", labelKey: "learn.caught.heading" },
  { id: "what-scams-look-like", labelKey: "learn.types.heading" },
  { id: "how-to-spot", labelKey: "learn.tactics.heading" },
  { id: "scam-calendar", labelKey: "learn.calendar.heading" },
  { id: "technical-signals", labelKey: "learn.auth.heading" },
  { id: "where-to-report", labelKey: "learn.report.heading" },
  { id: "block-email", labelKey: "learn.block.email.heading" },
  { id: "block-phone", labelKey: "learn.block.phone.heading" },
  { id: "using-this-tool", labelKey: "learn.part.using.heading" },
] as const;

// The mail clients and phone platforms the block/report guides cover. Slugs, not
// indices, so each maps to a readable message key (learn.block.email.<slug>.*).
const BLOCK_EMAIL = ["gmail", "outlook", "apple", "yahoo", "any"] as const;
const BLOCK_PHONE = ["ios", "android", "authorities", "apps"] as const;

// How far down the viewport the sticky chrome reaches, in px: the site header
// (58) plus the TOC bar that pins beneath it (~46 — py-2.5 around a single chip
// row). Used to decide which section is "current" — the last one whose top has
// scrolled up past that chrome. It only needs to be close: an off-by-a-few-px
// value shifts the active-link hand-off by a few pixels of scroll, nothing more.
// The anchored sections clear it via their own scroll-mt-24 (96px), comfortably
// more than this.
const TOC_BAR_HEIGHT = 104;

// Part header — the page is split into two distinct halves: "Spotting scams"
// (what scams are / how to identify them) and "Getting the most from this tool"
// (how to capture a scam so we can read it). Larger and divider-led so the two
// halves read as separate sections, not just more cards.
//
// The id is optional: Part 2 carries its anchor on a wrapping <section> instead,
// so that a deep link to #using-this-tool can open the capture guides nested
// inside it (see the hash-open effect) rather than just scrolling to a header.
function PartHeader({ id, heading, intro }: { id?: string; heading: string; intro: string }) {
  return (
    <div id={id} className="scroll-mt-24 pt-4">
      <div className="h-px bg-[var(--rule)] mb-6" />
      <h2 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(20px,2.6vw,26px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]">
        {heading}
      </h2>
      <p className="text-[15px] text-[var(--text-dim)] mt-1.5 max-w-[62ch]">{intro}</p>
    </div>
  );
}

export default function LearnContent({
  activeSeasons = [],
}: {
  /** Titles of the seasons active today, resolved server-side. */
  activeSeasons?: string[];
}) {
  const { t } = useLang();

  // Reveal collapsed content when its anchor is navigated to. A jump link to a
  // closed <details> would otherwise scroll to a bare header and hide the content
  // it promised. Two cases: the target itself is a collapsible (a table-of-
  // contents link), or the target is a container whose collapsibles should open
  // (the check flow deep-links to #using-this-tool for the capture guide, which
  // is a <section> wrapping three disclosures). Runs on load and on every in-page
  // hash change; anchors with no collapsibles (the emergency block, the calendar
  // pointer) are left untouched.
  useEffect(() => {
    const openTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.querySelectorAll("details").forEach((d) => {
        d.open = true;
      });
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);

  // Which section the reader is currently in, so the sticky TOC can highlight it
  // — turning the index from a one-shot list into a "you are here" that tracks
  // as you scroll. Computed from scroll position rather than IntersectionObserver
  // because the answer we want ("the last heading scrolled up past the bar") is
  // exactly a top-edge comparison, and the sections are collapsible, so their
  // heights change under the observer's feet.
  const [activeId, setActiveId] = useState<string>(TOC[0].id);
  const tocRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const sections = TOC.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const computeActive = () => {
      // Read the DOM here; the selection itself is pure and lives in lib/toc so
      // it can be tested without a browser.
      const tops = sections.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top }));
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      const id = activeSectionId(tops, { barHeight: TOC_BAR_HEIGHT, atBottom });
      if (id) setActiveId(id);
    };

    computeActive();
    window.addEventListener("scroll", computeActive, { passive: true });
    window.addEventListener("resize", computeActive);
    return () => {
      window.removeEventListener("scroll", computeActive);
      window.removeEventListener("resize", computeActive);
    };
  }, []);

  // Keep the active chip in view within the horizontally-scrolling bar, so on a
  // narrow screen the highlighted link never sits off-screen. block:"nearest"
  // holds the page still (the bar is always fully visible); only the bar's own
  // horizontal scroll moves.
  useEffect(() => {
    const chip = tocRef.current?.querySelector<HTMLElement>(`[data-toc="${activeId}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    // Full-width chrome, matching every other page. The prose inside sets its
    // own measure (max-w-[62ch] on the body copy, 60ch on the header) rather
    // than relying on a narrow container, so lines stay readable while cards and
    // grids get the full width to lay out in.
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-5">
      <PageHeader
        eyebrow={t("learn.eyebrow")}
        title={t("learn.headline")}
        lede={t("learn.intro")}
      />

      {/* Table of contents — a sticky, horizontally-scrollable index. The page is
          long and covers several distinct needs, so the fastest route to any one
          is a persistent bar that also shows where you are, not a one-shot list
          scrolled past once. It pins to the top as the (non-sticky) site header
          scrolls away; -mx-4 lets the divider span the column while the inner
          padding keeps the chips aligned with the content. The active chip is
          highlighted and scrolled into view as you move through the page. */}
      <nav
        aria-label={t("learn.toc.heading")}
        className="sticky top-[58px] z-20 -mx-5 sm:-mx-8 border-y border-[var(--rule)] bg-[var(--ink)]/85 backdrop-blur"
      >
        <ul
          ref={tocRef}
          className="flex gap-1.5 overflow-x-auto px-5 sm:px-8 py-2.5 list-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TOC.map(({ id, labelKey }) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  data-toc={id}
                  aria-current={active ? "location" : undefined}
                  className={`block whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[var(--clear)]/40 bg-[var(--clear)]/12 text-[var(--clear)]"
                      : "border-transparent text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--ink-2)]"
                  }`}
                >
                  {t(key(labelKey))}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Emergency content first. Everything else on this page can wait; someone
          who has just clicked a link or shared card details cannot, and making
          them scroll past DMARC explainers to reach help is the one failure this
          page cannot afford. */}
      <section
        id="caught"
        className="scroll-mt-24 rounded-xl border border-l-2 border-[var(--rule)] border-l-[var(--scam)] bg-[var(--scam)]/[0.07] p-5 space-y-3.5"
      >
        <div>
          {/* The one red heading on the page. Colour is doing real work here —
              it marks the section you need when you have no patience to read —
              so nothing else competes for it. */}
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--scam-text)]">
            {t("learn.caught.heading")}
          </h2>
          <p className="text-sm text-[var(--text-dim)] mt-1.5">{t("learn.caught.intro")}</p>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-[var(--rule)] bg-[var(--ink-2)] p-3.5">
              <p className="text-sm font-semibold text-[var(--foreground)]">{t(key(`learn.caught.${i}.situation`))}</p>
              <p className="text-sm text-[var(--text-dim)] mt-1 leading-relaxed">{bold(t(key(`learn.caught.${i}.action`)))}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-[var(--faint)] leading-relaxed">{bold(t("learn.caught.outro"))}</p>
      </section>

      {/* ── Part 1: Spotting scams ─────────────────────────────────────────── */}
      <PartHeader
        id="spotting-scams"
        heading={t("learn.part.spot.heading")}
        intro={t("learn.part.spot.intro")}
      />

      {/* Card 1 — orientation. Collapsed by default: it's read once to get your
          bearings, not on every visit, so it opens on demand rather than pushing
          the core teaching below it down the page. Split into two disclosures,
          one per heading, so each opens to a single focused topic. */}
      <Collapsible id="what-scams-look-like" title={t("learn.types.heading")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SCAM_TYPE_ICONS.map((icon, i) => (
            <div key={i} className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span aria-hidden="true">{icon}</span>
                <span className="text-sm font-semibold text-[var(--foreground)]">{t(key(`learn.types.${i + 1}.label`))}</span>
              </div>
              <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">{t(key(`learn.types.${i + 1}.desc`))}</p>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title={t("learn.sources.heading")}>
        <div className="grid sm:grid-cols-2 gap-2">
          {Array.from({ length: SOURCE_COUNT }, (_, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-[var(--clear)] mt-0.5 shrink-0" aria-hidden="true">›</span>
              <p className="text-sm leading-relaxed">
                <span className="font-semibold text-[var(--foreground)]">{t(key(`learn.sources.${i + 1}.title`))}.</span>{" "}
                <span className="text-[var(--text-dim)]">{t(key(`learn.sources.${i + 1}.desc`))}</span>
              </p>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* The core teaching — recognising a scam in front of you. Phase 1 kept
          this open; Phase 2 splits what was one 20-item card into three focused
          disclosures so the reader can collapse whatever they've read and jump
          to the part they want. All open by default: this is the point of the
          page and safety advice, so it is separated for scanning, never hidden. */}

      {/* How scammers operate — the conceptual half: name the tactic, break the
          spell. Carries the how-to-spot anchor the table of contents points at. */}
      <Collapsible id="how-to-spot" title={t("learn.tactics.heading")} defaultOpen>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.tactics.intro")}</p>
          {/* A hairline-separated row list rather than free-floating bullets:
              six named tactics are a reference set the reader comes back to, and
              the rules make each one its own object to scan for. */}
          <ul className="grid gap-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)] list-none">
            {Array.from({ length: TACTIC_COUNT }, (_, i) => (
              <li key={i} className="bg-[var(--ink-2)] px-4 py-3.5">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {t(key(`learn.tactics.${i + 1}.title`))}
                </p>
                <p className="text-[13.5px] text-[var(--text-dim)] mt-1 leading-relaxed">
                  {t(key(`learn.tactics.${i + 1}.desc`))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Collapsible>

      {/* Red flags — the surface half: the quick two-column checklist. */}
      <Collapsible title={t("learn.flags.heading")} defaultOpen>
        <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5 text-sm text-[var(--text-dim)] list-none">
          {Array.from({ length: FLAG_COUNT }, (_, i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-[var(--caution)] mt-0.5 shrink-0" aria-hidden="true">⚑</span>
              <span>{t(key(`learn.flags.${i + 1}`))}</span>
            </li>
          ))}
        </ul>
      </Collapsible>

      {/* What to do when something seems off — the action checklist. */}
      <Collapsible title={t("learn.handle.heading")} defaultOpen>
        <ul className="space-y-2.5 text-sm text-[var(--text-dim)] list-none">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-[var(--clear)] mt-0.5 shrink-0" aria-hidden="true">✓</span>
              <span>{bold(t(key(`learn.handle.${i}`)))}</span>
            </li>
          ))}
        </ul>
      </Collapsible>

      {/* Scam calendar — a pointer, not the calendar itself. The full thing has
          its own page; reproducing it here would duplicate content and make an
          already-long page longer. Names today's active seasons so the link
          promises something specific rather than a generic "see also". */}
      <article id="scam-calendar" className="scroll-mt-24 bg-[var(--ink-2)] border border-[var(--rule)] rounded-xl p-5 space-y-3">
        <h2 className={H2}>{t("learn.calendar.heading")}</h2>
        <p className="text-sm text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{t("learn.calendar.body")}</p>
        {activeSeasons.length > 0 && (
          // The live bit: what is actually in season as you read this. Marked
          // with the same amber pulse the home strip uses, so "this is current"
          // reads the same way everywhere.
          <p className="flex items-baseline gap-2.5 text-sm text-[var(--foreground)]">
            <span
              aria-hidden="true"
              className="w-[7px] h-[7px] shrink-0 self-center rounded-full bg-[var(--caution)] shadow-[0_0_0_3px_rgba(232,163,61,0.16)]"
            />
            <span>{t("learn.calendar.active", { seasons: activeSeasons.join(", ") })}</span>
          </p>
        )}
        <Link
          href="/calendar"
          className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
        >
          {t("learn.calendar.cta")}
        </Link>
      </article>

      {/* Card 3 — reference material. Collapsed by default: it's consulted when a
          result mentions SPF or DMARC, not read start to finish, so it no longer
          spends a screen of the page on a legend most readers never need. */}
      <Collapsible id="technical-signals" title={t("learn.auth.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.auth.intro")}</p>
          <div className="space-y-4 pt-1">
            {AUTH_LEGEND.map((entry) => (
              <div key={entry.protocol} className="space-y-1.5">
                <p className="text-sm text-[var(--text-dim)] leading-relaxed">
                  {/* Protocol names are identifiers you meet in a verdict, so
                      they take the mono face that carries identifiers elsewhere. */}
                  <span className="font-[family-name:var(--font-mono-ui)] font-medium text-[var(--foreground)]">{entry.protocol}.</span>{" "}
                  {t(entry.explainKey as MessageKey)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {entry.verdicts.map((v) => (
                    <StaticAuthPill key={v.label} label={v.label} severity={v.severity} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* Where to report + disclaimer */}
      <section
        id="where-to-report"
        className="scroll-mt-24 rounded-xl border border-l-2 border-[var(--rule)] border-l-[var(--clear)] bg-[var(--clear)]/[0.055] p-5"
      >
        <div className="space-y-3 text-sm">
          <h2 className={H2}>{t("learn.report.heading")}</h2>
          <p className="text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{bold(t("learn.report.body"))}</p>
          <div className="grid sm:grid-cols-2 gap-2 pt-1">
            {AGENCIES.map(({ name, abbr: abbrTitle, site, href }) => (
              <a key={site} href={href} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-[var(--rule)] bg-[var(--ink-2)] px-3.5 py-2.5 hover:border-[var(--clear)]/50 transition-colors block">
                <div className="text-sm text-[var(--foreground)] font-semibold">
                  {abbrTitle ? <abbr title={abbrTitle} className="no-underline">{name}</abbr> : name}
                  <span className="sr-only"> ({t("a11y.newTab")})</span>
                </div>
                <div className="mt-0.5 font-[family-name:var(--font-mono-ui)] text-[12.5px] text-[var(--clear)]">{site}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Blocking & reporting spam — how to stop a sender and report them, in the
          common mail clients, phones and messaging apps. Moved here from the
          About page: it's how-to guidance, which is Learn's job, whereas About is
          the canonical record of privacy behaviour. Collapsed by default and
          grouped with "where to report" as the "act on it" cluster. */}
      <Collapsible id="block-email" title={t("learn.block.email.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.block.email.intro")}</p>
          <div className="space-y-3">
            {BLOCK_EMAIL.map((slug) => (
              <div key={slug} className="space-y-1">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">{t(key(`learn.block.email.${slug}.title`))}</h3>
                <p className="text-sm text-[var(--text-dim)] leading-relaxed">{bold(t(key(`learn.block.email.${slug}.body`)))}</p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      <Collapsible id="block-phone" title={t("learn.block.phone.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.block.phone.intro")}</p>
          <div className="space-y-3">
            {BLOCK_PHONE.map((slug) => (
              <div key={slug} className="space-y-1">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">{t(key(`learn.block.phone.${slug}.title`))}</h3>
                <p className="text-sm text-[var(--text-dim)] leading-relaxed">{bold(t(key(`learn.block.phone.${slug}.body`)))}</p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* ── Part 2: Getting the most from this tool ────────────────────────────
          A deliberately separate appendix: this is how-to reference for capturing
          a scam, not part of learning to spot one. It lives here rather than in
          the check flow on purpose — the flow keeps a quiet "See the guide →"
          pointer to #using-this-tool instead of re-crowding itself with inline
          expandables (see CheckFlow). The anchor sits on this <section> so that
          arriving from that pointer opens the guides inside it, rather than
          landing on three closed toggles. */}
      <section id="using-this-tool" className="scroll-mt-24 space-y-6">
        <PartHeader
          heading={t("learn.part.using.heading")}
          intro={t("learn.part.using.intro")}
        />

        {/* One collapsible each — reached for when you're about to capture a
            scam, so each opens on demand rather than stacking three open sections
            at the foot of an already-long page. The email guide renders open
            inside its own disclosure (the outer Collapsible is the toggle). */}
        <Collapsible title={t("learn.using.photo.heading")}>
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{t("check.help.photo.body")}</p>
        </Collapsible>

        <Collapsible title={t("learn.using.image.heading")}>
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{t("check.help.image.body")}</p>
        </Collapsible>

        <Collapsible title={t("learn.using.email.heading")}>
          <EmailExportGuide expandable={false} />
        </Collapsible>
      </section>

      {/* Left-aligned with the rest of the page: a lone centred line reads as a
          layout accident when everything above it starts at the same edge. */}
      <p className="pt-2 pb-4 text-sm">
        <Link href="/" className="text-[var(--clear)] hover:underline underline-offset-2 font-medium">
          {t("learn.footer.cta")}
        </Link>
      </p>
    </main>
  );
}
