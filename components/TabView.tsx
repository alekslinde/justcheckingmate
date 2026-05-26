"use client";

import { useState } from "react";
import ScamChecker from "./ScamChecker";
import LegitimacyTester from "./LegitimacyTester";

const TABS = [
  {
    id: "check",
    label: "Check a Scam",
    icon: "🔍",
    description: "Got something suspicious? Chuck it in here.",
  },
  {
    id: "legitimacy",
    label: "Legitimacy Tester",
    icon: "📋",
    description: "Sending something? Check if it looks legit before you send it.",
  },
];

export default function TabView() {
  const [active, setActive] = useState<"check" | "legitimacy">("check");

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id as typeof active)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition-all border-b-2 ${
              active === tab.id
                ? tab.id === "check"
                  ? "border-amber-500 text-amber-400 bg-amber-950/20"
                  : "border-blue-500 text-blue-400 bg-blue-950/20"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className={`px-6 py-3 border-b border-gray-800 text-xs ${
        active === "check" ? "text-amber-700 bg-amber-950/10" : "text-blue-800 bg-blue-950/10"
      }`}>
        {TABS.find((t) => t.id === active)?.description}
      </div>

      {/* Content */}
      <div className="p-6">
        {active === "check" ? <ScamChecker /> : <LegitimacyTester />}
      </div>
    </div>
  );
}
