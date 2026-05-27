"use client";

import { useState } from "react";
import ScamChecker from "./ScamChecker";
import LegitimacyTester from "./LegitimacyTester";
import ReportForm from "./ReportForm";

type TabId = "check" | "legitimacy" | "report";

const TABS: { id: TabId; label: string; icon: string; description: string; activeClass: string; descClass: string }[] = [
  {
    id: "check",
    label: "Check a Scam",
    icon: "🔍",
    description: "Got something suspicious? Chuck it in here.",
    activeClass: "border-amber-500 text-amber-400 bg-amber-950/20",
    descClass: "text-amber-700 bg-amber-950/10",
  },
  {
    id: "report",
    label: "Report It",
    icon: "🚨",
    description: "Found a scam? Lodge a report so we can update our records.",
    activeClass: "border-red-500 text-red-400 bg-red-950/20",
    descClass: "text-red-900 bg-red-950/10",
  },
  {
    id: "legitimacy",
    label: "Legitimacy Tester",
    icon: "📋",
    description: "Sending something? Check if it looks legit before you send it.",
    activeClass: "border-blue-500 text-blue-400 bg-blue-950/20",
    descClass: "text-blue-900 bg-blue-950/10",
  },
];

export default function TabView() {
  const [active, setActive] = useState<TabId>("check");

  const tab = TABS.find((t) => t.id === active)!;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3.5 text-xs sm:text-sm font-semibold transition-all border-b-2 ${
              active === t.id
                ? t.activeClass
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
            }`}
          >
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className={`px-6 py-2.5 border-b border-gray-800 text-xs ${tab.descClass}`}>
        {tab.description}
      </div>

      {/* Content */}
      <div className="p-6">
        {active === "check"      && <ScamChecker />}
        {active === "report"     && <ReportForm />}
        {active === "legitimacy" && <LegitimacyTester />}
      </div>
    </div>
  );
}
