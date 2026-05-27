"use client";

import { useEffect, useState } from "react";
import { PublicReport } from "@/lib/reportStore";

import { timeAgo, truncate } from "@/lib/formatters";

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  url:    { label: "Dodgy Link",     icon: "🔗" },
  sms:    { label: "Scam SMS",       icon: "📱" },
  email:  { label: "Phishing Email", icon: "📧" },
  phone:  { label: "Scam Number",    icon: "📞" },
  qr:     { label: "QR Code",        icon: "📷" },
  custom: { label: "Other",          icon: "🤔" },
};

export default function LatestReports() {
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports?limit=10")
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="font-bold text-amber-400 text-sm uppercase tracking-wider">
          Latest Submissions
        </h2>
        <span className="text-xs text-gray-400">Community-reported scams</span>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="px-5 py-10 text-center space-y-2">
          <div className="text-3xl" aria-hidden="true">🦘</div>
          <p className="text-sm text-gray-300 font-medium">No reports yet.</p>
          <p className="text-xs text-gray-400">
            Found a scam? Hit <span className="text-red-300 font-semibold">Report It</span> above and help protect other Australians.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-800">
            {reports.map((r) => {
              const t = TYPE_LABELS[r.type] ?? { label: r.type, icon: "🤔" };
              return (
                <li key={r.id} className="px-5 py-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                      <span aria-hidden="true">{t.icon}</span>
                      {t.label}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">{timeAgo(r.submittedAt)}</span>
                  </div>
                  <p className="text-sm font-mono text-gray-200 break-all">
                    {truncate(r.content, 120)}
                  </p>
                  {r.description && (
                    <p className="text-xs text-gray-400 italic">
                      {truncate(r.description, 160)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {reports.length < 6 && (
            <p className="px-5 py-3 text-xs text-gray-500 text-center border-t border-gray-800">
              Still building — more reports coming in as Australians use the tool.
            </p>
          )}
        </>
      )}
    </div>
  );
}
