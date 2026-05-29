"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reportId, setReportId] = useState<string | null>(null);
  const [totalReports, setTotalReports] = useState<number | null>(null);

  const loadedAt = useRef(0);

  useEffect(() => {
    loadedAt.current = Date.now();
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
          hp,
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
        <div className="text-5xl" aria-hidden="true">🦘</div>
        <div>
          <h3 className="font-bold text-green-400 text-lg mb-1">Thank you — you&apos;ve helped protect others.</h3>
          <p className="text-gray-300 text-sm">
            Your report has been logged. Every submission helps warn others about this scam.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 inline-block mx-auto">
          <div className="text-sm text-gray-400 mb-0.5">Report reference</div>
          <div className="font-mono text-emerald-400 font-bold">{reportId}</div>
        </div>
        {totalReports !== null && (
          <p className="text-sm text-gray-400">
            {totalReports.toLocaleString()} reports submitted by Australians like you.{" "}
            <Link href="/submissions" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
              View all →
            </Link>
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all"
          >
            Report another
          </button>
          <Link
            href="/submissions"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-emerald-400 text-sm rounded-lg transition-all"
          >
            View community submissions →
          </Link>
        </div>
        <div className="text-sm text-gray-400 pt-2 border-t border-gray-800">
          For immediate help, report to{" "}
          <a
            href="https://www.scamwatch.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            Scamwatch (scamwatch.gov.au)
          </a>{" "}
          or call{" "}
          <a
            href="tel:1800595160"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            IDCARE on 1800 595 160
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>

      {/* Honeypot — off-screen, never shown to real users */}
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
        <div className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900/50 rounded-lg px-3 py-2">
          <span className="text-emerald-400" aria-hidden="true">📊</span>
          <span>
            <strong className="text-gray-100">{totalReports.toLocaleString()}</strong> scams reported by Australians so far
          </span>
        </div>
      )}

      {/* Required field note */}
      <p className="text-sm text-gray-400">
        Fields marked <span aria-hidden="true" className="text-red-400">*</span>
        <span className="sr-only">with an asterisk</span> are required.
      </p>

      {/* Type — radio group */}
      <fieldset>
        <legend className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">
          What are you reporting?
        </legend>
        <div role="radiogroup" aria-labelledby="report-type-legend" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REPORT_TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                type === t.value
                  ? "bg-emerald-500 border-emerald-400 text-gray-900 font-semibold"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-gray-100"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Scam content */}
      <div>
        <label htmlFor="report-content" className="block text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">
          The scam content{" "}
          <span aria-hidden="true" className="text-red-400">*</span>
        </label>
        <textarea
          id="report-content"
          required
          aria-required="true"
          aria-describedby="content-count"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={PLACEHOLDERS[type]}
          rows={type === "url" || type === "phone" ? 2 : 4}
          maxLength={2000}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-sm font-mono"
        />
        <div id="content-count" aria-live="polite" className="text-right text-sm text-gray-400 mt-0.5">
          {content.length}/2000
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="report-description" className="block text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
          What happened?{" "}
          <span className="text-gray-400 normal-case font-normal">(optional but helpful)</span>
        </label>
        <textarea
          id="report-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="E.g. Got a text claiming to be from the ATO asking me to verify my TFN. Almost fell for it..."
          rows={3}
          maxLength={1000}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 resize-y text-sm"
        />
      </div>

      {/* Contact */}
      <div>
        <label htmlFor="report-contact" className="block text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Your email{" "}
          <span className="text-gray-400 normal-case font-normal">(optional — only for follow-up)</span>
        </label>
        <input
          id="report-contact"
          type="email"
          aria-describedby="contact-hint"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com.au"
          maxLength={200}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 text-sm"
        />
        <p id="contact-hint" className="mt-1 text-sm text-gray-400">
          Never shared. Only used if we need to follow up on your report.
        </p>
      </div>

      {/* Error */}
      {status === "error" && (
        <div role="alert" className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
          Strewth, something went wrong. Give it another crack.
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!content.trim() || status === "submitting"}
        aria-busy={status === "submitting"}
        className="w-full py-3 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-800 disabled:text-gray-400 text-gray-900 font-bold rounded-lg transition-all text-sm uppercase tracking-wide"
      >
        {status === "submitting" ? "Lodging your report..." : "Report This Scam 🚨"}
      </button>

      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 space-y-1.5">
        <p className="text-sm text-emerald-400 font-semibold text-center">
          For urgent matters, contact Scamwatch, your bank, or the{" "}
          <abbr title="Australian Federal Police">AFP</abbr>{" "}
          directly — this tool is not a substitute for official reporting channels.
        </p>
        <p className="text-sm text-gray-400 text-center">
          Your report is valuable. Every submission helps raise awareness and protects others from the same scam.
        </p>
      </div>
    </form>
  );
}
