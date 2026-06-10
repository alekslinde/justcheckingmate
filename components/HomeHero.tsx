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
      <p className="text-base text-gray-300">{t("home.subtitle")}</p>
      <StatsBar />
    </div>
  );
}
