"use client";

import { useLang } from "@/lib/lang";
import StatsBar from "./StatsBar";

export default function HomeHero() {
  const { t } = useLang();
  return (
    <div className="text-center space-y-2">
      <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
        {t("home.title")}
      </h1>
      {/* Subtitle carries the privacy promise inline — privacy is the core of
          this tool, so it's read up front (not buried in tiny print on the card). */}
      <p className="text-base text-gray-300">{t("home.subtitle")}</p>
      <StatsBar />
    </div>
  );
}
