"use client";

import { useState, useRef, useEffect } from "react";
import ScamChecker from "./ScamChecker";
import ReportForm from "./ReportForm";

type TabId = "check" | "report";

const TABS: {
  id: TabId;
  label: string;
  icon: string;
  description: string;
  activeClass: string;
  descClass: string;
}[] = [
  {
    id: "check",
    label: "Check a Scam",
    icon: "🔍",
    description: "Got something suspicious? Chuck it in here.",
    activeClass: "border-emerald-500 text-emerald-400 bg-emerald-950/20",
    descClass: "text-emerald-400 bg-emerald-950/10",
  },
  {
    id: "report",
    label: "Report It",
    icon: "🚨",
    description: "Found a scam? Lodge a report so we can update our records.",
    activeClass: "border-red-500 text-red-300 bg-red-950/20",
    descClass: "text-red-300 bg-red-950/10",
  },
];

export default function TabView() {
  const [active, setActive] = useState<TabId>("check");
  const panelRef = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);

  // Move focus to the panel when the user switches tabs so keyboard users
  // don't have to re-navigate through the tab bar. Skip initial mount —
  // stealing focus on page load is disruptive and triggers UA underline
  // artefacts on sibling text in some browsers.
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    panelRef.current?.focus({ preventScroll: true });
  }, [active]);

  const tab = TABS.find((t) => t.id === active)!;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div role="tablist" aria-label="Main sections" className="flex border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3.5 text-sm font-semibold transition-all border-b-2 ${
              active === t.id
                ? t.activeClass
                : "border-transparent text-gray-300 hover:text-gray-100 hover:bg-gray-800/50"
            }`}
          >
            <span aria-hidden="true">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className={`px-6 py-2.5 border-b border-gray-800 text-sm no-underline ${tab.descClass}`}>
        {tab.description}
      </div>

      {/* Content */}
      <div
        ref={panelRef}
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={-1}
        className="p-6 focus:outline-none"
      >
        {active === "check"  && <ScamChecker />}
        {active === "report" && <ReportForm />}
      </div>
    </div>
  );
}
