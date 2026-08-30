"use client";

import { useLang } from "@/lib/lang";
import StatsBar from "./StatsBar";

export default function HomeHero() {
  const { t } = useLang();
  return (
    // Left-aligned rather than centred: the page reads as a tool with a job to
    // do, and centred text sets a different, more brochure-like expectation.
    // Capped at 20ch so the display line breaks where the meaning does instead
    // of running the full width of the wider layout.
    <div className="space-y-3">
      <h1 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(28px,5vw,50px)] leading-[1.06] tracking-[-0.02em] text-[var(--foreground)] max-w-[20ch] text-balance">
        {t("home.title")}
      </h1>
      {/* Carries the privacy promise inline — privacy is the core of this tool,
          so it is read up front, not buried in small print on the card. */}
      <p className="text-base sm:text-[17px] text-[var(--text-dim)] max-w-[58ch] leading-relaxed">
        {t("home.subtitle")}
      </p>
      <StatsBar />
    </div>
  );
}
