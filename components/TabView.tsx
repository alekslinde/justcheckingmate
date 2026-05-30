"use client";

import { useState, useRef, useEffect } from "react";
import ScamChecker from "./ScamChecker";
import ReportForm from "./ReportForm";
import { ScamType } from "@/lib/scamDetector";

type TabId = "check" | "report";

const TABS: { id: TabId; label: string; icon: string; activeClass: string }[] = [
  { id: "check",  label: "Check a Scam", icon: "🔍", activeClass: "border-emerald-500 text-emerald-400 bg-emerald-950/20" },
  { id: "report", label: "Report It",    icon: "🚨", activeClass: "border-red-500 text-red-300 bg-red-950/20" },
];

export default function TabView() {
  const [active, setActive] = useState<TabId>("check");
  const [reportKey, setReportKey] = useState(0);
  const [reportPrefill, setReportPrefill] = useState<{
    type: ScamType; content: string;
    scamUrl: string; scamPhone: string; scamEmail: string;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);

  function handleReport(type: ScamType, content: string, ids: { scamUrl: string; scamPhone: string; scamEmail: string }) {
    setReportPrefill({ type, content, ...ids });
    setReportKey((k) => k + 1);
    setActive("report");
  }

  // Move focus to the panel when the user switches tabs so keyboard users
  // don't have to re-navigate through the tab bar. Skip initial mount —
  // stealing focus on page load is disruptive and triggers UA underline
  // artefacts on sibling text in some browsers.
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    panelRef.current?.focus({ preventScroll: true });
  }, [active]);

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

      {/* Content */}
      <div
        ref={panelRef}
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={-1}
        className="p-6 focus:outline-none"
      >
        {active === "check"  && <ScamChecker onReport={handleReport} />}
        {active === "report" && <ReportForm key={reportKey} initialType={reportPrefill?.type} initialContent={reportPrefill?.content} initialScamUrl={reportPrefill?.scamUrl} initialScamPhone={reportPrefill?.scamPhone} initialScamEmail={reportPrefill?.scamEmail} />}
      </div>
    </div>
  );
}
