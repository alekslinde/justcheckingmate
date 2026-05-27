"use client";

import { useState, useEffect, useRef } from "react";
import { ScamType } from "@/lib/scamDetector";

const REPORT_TYPES: { value: ScamType; label: string; icon: string }[] = [
  { value: "url",    label: "Dodgy Link / Website", icon: "🔗" },
  { value: "sms",    label: "Scam Text / SMS",      icon: "📱" },
  { value: "email",  label: "Phishing Email",        icon: "📧" },
  { value: "phone",  label: "Scam Phone Number",     icon: "📞" },
  { value: "qr",     label: "Dodgy QR Code",         icon: "📷" },
  { value: "custom", label: "Something Else",        icon: "🤔" },
];

const PLACEHOLDERS: Record<ScamType, string> = {
  url:    "Paste the URL, e.g. https://my-g0v-ato.tk/verify",
  sms:    "Paste the full SMS message text...",
  email:  "Paste the email content or the sender's address...",
  phone:  "Enter the phone number, e.g. +61 412 345 678",
  qr:     "Paste the URL the QR code resolves to...",
  custom: "Describe or paste whatever you received...",
};

type Status = "idle" | "submitting" | "success" | "error";

export default function ReportForm() {
  const [type, setType] = useState<ScamType>("url");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [hp, setHp] = useState(""); // honeypot — never set by real users
  const [status, setStatus] = useState<Status>("idle");
  const [reportId, setReportId] = useState<string | null>(null);
  const [totalReports, setTotalReports] = useState<number | null>(null);

  // Record when the form was rendered — used server-side to detect bots (too-fast submit)
  const loadedAt = useRef(Date.now());

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then((d) => setTotalReports(d.totalReports))
      .catch(() => null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || status === "submitting") return;

    setStatus("submitting");

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          content,
          description,
          contact,
          hp,            // honeypot value
          loadedAt: loadedAt.current,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReportId(data.reportId);
        setStatus("success");
        setTotalReports((n) => (n !== null ? n + 1 : n));
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  function reset() {
    setContent("");
    setDescription("");
    setContact("");
    setReportId(null);
    setStatus("idle");
    loadedAt.current = Date.now();
  }

  if (status === "success") {
    return (
      <div className="space-y-5 text-center py-4">
        <div className="text-5xl">🦘</div>
        <div>
          <h3 className="font-bold text-green-400 text-lg mb-1">Ripper — thanks for reporting it!</h3>
          <p className="text-gray-400 text-sm">
            Your report has been logged. Every submission helps protect other Australians from getting done over.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 inline-block mx-auto">
          <div className="text-xs text-gray-500 mb-0.5">Report reference</div>
          <div className="font-mono text-amber-400 font-bold">{reportId}</div>
        </div>
        {totalReports !== null && (
          <p className="text-xs text-gray-600">
            {totalReports.toLocaleString()} reports submitted by Australians like you
          </p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all"
        >
          Report another one
        </button>
        <div className="text-xs text-gray-600 pt-2 border-t border-gray-800">
          For immediate help, report to{" "}
          <span className="text-amber-700">Scamwatch (scamwatch.gov.au)</span> or call{" "}
          <span className="text-amber-700">IDCARE on 1800 595 160</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>

      {/* Honeypot — visually hidden, never shown to real users.
          Positioned off-screen rather than display:none so some bots don't skip it. */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0 }} aria-hidden="true">
        <label htmlFor="website">Website (leave blank)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      {/* Stats badge */}
      {totalReports !== null && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-900/50 rounded-lg px-3 py-2">
          <span className="text-amber-600">📊</span>
          <span>
            <strong className="text-gray-400">{totalReports.toLocaleString()}</strong> scams reported by Australians so far
          </span>
        </div>
      )}

      {/* Type */}
      <div>
        <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
          What are you reporting?
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REPORT_TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                type === t.value
                  ? "bg-amber-500 border-amber-400 text-gray-900 font-semibold"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scam content */}
      <div>
        <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
          The scam content <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={PLACEHOLDERS[type]}
          rows={type === "url" || type === "phone" ? 2 : 4}
          maxLength={2000}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-y text-sm font-mono"
        />
        <div className="text-right text-xs text-gray-700 mt-0.5">{content.length}/2000</div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          What happened? <span className="text-gray-600">(optional but helpful)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="E.g. Got a text claiming to be from the ATO asking me to verify my TFN. Almost fell for it..."
          rows={3}
          maxLength={1000}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 resize-y text-sm"
        />
      </div>

      {/* Contact */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Your email <span className="text-gray-600">(optional — only for follow-up)</span>
        </label>
        <input
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com.au"
          maxLength={200}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 text-sm"
        />
        <p className="mt-1 text-xs text-gray-600">
          Never shared. Only used if we need to follow up on your report.
        </p>
      </div>

      {/* Error */}
      {status === "error" && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          Strewth, something went wrong. Give it another crack.
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!content.trim() || status === "submitting"}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-800 disabled:text-gray-600 text-gray-900 font-bold rounded-lg transition-all text-sm uppercase tracking-wide"
      >
        {status === "submitting" ? "Lodging your report..." : "Report This Scam 🚨"}
      </button>

      <p className="text-xs text-gray-700 text-center">
        For urgent matters, contact Scamwatch, your bank, or the AFP directly.
        This tool is not a substitute for official reporting channels.
      </p>
    </form>
  );
}
