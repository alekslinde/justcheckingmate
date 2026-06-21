"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ScamType } from "@/lib/scamDetector";
import { summariseAuth } from "@/lib/emailHeaders";
import { EmailTrackingReport } from "@/lib/emailTracking";
import { analyseEmailSource } from "@/lib/emailSource";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";
import { useBugReport } from "./BugReportProvider";
import EmailExportGuide from "./EmailExportGuide";

const REPORT_TYPES: { value: ScamType; labelKey: MessageKey; icon: string }[] = [
  { value: "url",    labelKey: "report.type.url",    icon: "🔗" },
  { value: "sms",    labelKey: "report.type.sms",    icon: "📱" },
  { value: "email",  labelKey: "report.type.email",  icon: "📧" },
  { value: "phone",  labelKey: "report.type.phone",  icon: "📞" },
  { value: "qr",     labelKey: "report.type.qr",     icon: "📷" },
  { value: "custom", labelKey: "report.type.custom", icon: "❓" },
];

const PLACEHOLDER_KEYS: Record<ScamType, MessageKey> = {
  url:    "report.placeholder.url",
  sms:    "report.placeholder.sms",
  email:  "report.placeholder.email",
  phone:  "report.placeholder.phone",
  qr:     "report.placeholder.qr",
  custom: "report.placeholder.custom",
};

type Status = "idle" | "submitting" | "success" | "error";

interface EmailAuth { spf: string; dkim: string; dkimDomain: string; dmarc: string }
const EMPTY_AUTH: EmailAuth = { spf: "", dkim: "", dkimDomain: "", dmarc: "" };

// Map an SPF/DKIM/DMARC verdict word to a Tailwind chip class. "pass" reads as
// safe (emerald), "fail" as bad (red), the soft/neutral middle as caution
// (amber); anything else (none/error/unknown) is neutral grey.
function authChipClass(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "pass":
    case "bestguesspass":
      return "bg-emerald-900/50 border-emerald-700 text-emerald-300";
    case "fail":
    case "permerror":
      return "bg-red-900/40 border-red-800 text-red-300";
    case "softfail":
    case "neutral":
    case "temperror":
      return "bg-amber-900/40 border-amber-800 text-amber-300";
    default:
      return "bg-gray-800 border-gray-700 text-gray-400";
  }
}

// Small coloured verdict chip, e.g. "SPF pass" in green. Rendered only when the
// verdict word is present.
function AuthChip({ label, verdict }: { label: string; verdict: string }) {
  if (!verdict) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${authChipClass(verdict)}`}>
      <span className="font-semibold">{label}</span>
      <span>{verdict.toLowerCase()}</span>
    </span>
  );
}

export default function ReportForm({ initialType, initialContent, initialScamUrl, initialScamPhone, initialScamEmail, initialScamReplyTo, initialAuth }: { initialType?: ScamType; initialContent?: string; initialScamUrl?: string; initialScamPhone?: string; initialScamEmail?: string; initialScamReplyTo?: string; initialAuth?: EmailAuth } = {}) {
  const { t } = useLang();
  const { reportFailure } = useBugReport();
  const [type, setType] = useState<ScamType>(initialType ?? "url");
  const [content, setContent] = useState(initialContent ?? "");
  const [description, setDescription] = useState("");
  const [scamUrl, setScamUrl] = useState(initialScamUrl ?? "");
  const [scamPhone, setScamPhone] = useState(initialScamPhone ?? "");
  const [scamEmail, setScamEmail] = useState(initialScamEmail ?? "");
  const [scamReplyTo, setScamReplyTo] = useState(initialScamReplyTo ?? "");
  const [emailSource, setEmailSource] = useState("");
  const [parseNote, setParseNote] = useState<string | null>(null);
  // When the email was already identified upstream (Check→Report handoff gave us
  // a From address), the raw-source paste box adds nothing — the headers are
  // already parsed. Keep it available behind a toggle for power users who want to
  // enrich a missing SPF/DKIM, but collapsed by default in that case.
  const [showSource, setShowSource] = useState(!initialScamEmail);
  // Authentication verdicts pulled from pasted headers. Not directly editable —
  // derived from the source and submitted as-is so the public report can show
  // the SPF/DKIM/DMARC picture. Empty until a source is parsed.
  const [auth, setAuth] = useState<EmailAuth>(initialAuth ?? EMPTY_AUTH);
  const authSummary = summariseAuth(auth);
  // Broader tracking surface (pixels + click redirects, CSS beacons, read
  // receipts, …). Seeded from initialContent so a Check→Report handoff shows
  // tracking immediately; re-derived whenever a source is pasted/parsed.
  const [trackingReport, setTrackingReport] = useState<EmailTrackingReport | null>(() => {
    if (!initialContent?.trim()) return null;
    const tr = analyseEmailSource(initialContent).tracking;
    return tr.hasTracking ? tr : null;
  });
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

  // Parse pasted email source / a dropped .eml entirely client-side and
  // auto-fill the From and Reply-To fields. The raw source is NEVER submitted —
  // only the two extracted scammer addresses are. This keeps the reporter's own
  // address and routing metadata on their device.
  function parseSource(raw: string) {
    setEmailSource(raw);
    if (!raw.trim()) { setParseNote(null); setAuth(EMPTY_AUTH); setTrackingReport(null); return; }
    // Shared analysis: unwraps a forwarded email to the original first, so the
    // fields autofill the scammer's From/Reply-To, not the forwarder's.
    const { headers: h, identityFlags, tracking } = analyseEmailSource(raw);
    if (h.fromAddress) setScamEmail(h.fromAddress);
    if (h.replyTo) setScamReplyTo(h.replyTo);
    setAuth({ spf: h.spf, dkim: h.dkim, dkimDomain: h.dkimDomain, dmarc: h.dmarc });
    setTrackingReport(tracking);
    if (!h.fromAddress && !h.replyTo) {
      setParseNote(t("report.parse.notFound"));
      return;
    }
    setParseNote(identityFlags.length > 0 ? `⚠ ${identityFlags[0]}` : t("report.parse.ok"));
  }

  async function handleEmlFile(file: File) {
    const text = await file.text();
    parseSource(text);
  }

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
          scamUrl,
          scamPhone,
          scamEmail,
          scamReplyTo,
          // Authentication verdicts only make sense for an email report; gating
          // on type means switching away from "email" never carries stale auth
          // onto a URL/phone/etc. report.
          ...(type === "email" ? auth : EMPTY_AUTH),
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
        reportFailure("report", "Report submission was rejected by the server");
      }
    } catch (err) {
      setStatus("error");
      reportFailure("report", err);
    }
  }

  function reset() {
    setContent("");
    setDescription("");
    setScamUrl("");
    setScamPhone("");
    setScamEmail("");
    setScamReplyTo("");
    setEmailSource("");
    setParseNote(null);
    setAuth(EMPTY_AUTH);
    setContact("");
    setTrackingReport(null);
    setReportId(null);
    setStatus("idle");
    loadedAt.current = Date.now();
  }

  if (status === "success") {
    return (
      <div className="space-y-5 text-center py-4">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/40 border border-emerald-700 text-2xl text-emerald-400"
          aria-hidden="true"
        >
          ✓
        </div>
        <div>
          <h3 className="font-bold text-green-400 text-lg mb-1">{t("report.success.title")}</h3>
          <p className="text-gray-300 text-sm">{t("report.success.body")}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 inline-block mx-auto">
          <div className="text-sm text-gray-400 mb-0.5">{t("report.success.reference")}</div>
          <div className="font-mono text-emerald-400 font-bold">{reportId}</div>
          {/* The reference is genuinely usable: the submissions search matches ids */}
          {reportId && (
            <Link
              href={`/submissions?q=${encodeURIComponent(reportId)}`}
              className="block mt-1 text-xs text-emerald-400/90 hover:text-emerald-300 underline underline-offset-2"
            >
              {t("report.success.findIt")}
            </Link>
          )}
        </div>
        {totalReports !== null && (
          <p className="text-sm text-gray-400">
            {t("report.success.total", { n: totalReports.toLocaleString() })}{" "}
            <Link href="/submissions" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
              {t("report.success.viewAll")}
            </Link>
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all"
          >
            {t("report.success.another")}
          </button>
          <Link
            href="/submissions"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-emerald-400 text-sm rounded-lg transition-all"
          >
            {t("report.success.community")}
          </Link>
        </div>
        <div className="text-sm text-gray-400 pt-2 border-t border-gray-800">
          {t("report.success.official.pre")}{" "}
          <a
            href="https://www.scamwatch.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            Scamwatch (scamwatch.gov.au)<span className="sr-only"> ({t("a11y.newTab")})</span><span aria-hidden="true"> ↗</span>
          </a>{" "}
          {t("report.success.official.or")}{" "}
          <a
            href="tel:1800595160"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            {t("report.success.idcare")}
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

      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 space-y-1.5">
        <p className="text-sm text-emerald-400 font-semibold text-center">{t("report.urgent")}</p>
        <p className="text-sm text-gray-400 text-center">{t("report.valuable")}</p>
      </div>

      {/* Required field note */}
      <p className="text-sm text-gray-400">
        {t("report.required.pre")} <span aria-hidden="true" className="text-red-400">*</span>
        <span className="sr-only">{t("report.required.srAsterisk")}</span> {t("report.required.post")}
      </p>

      {/* Type — native radios styled as cards, so arrow keys and grouping work
          without re-implementing the ARIA radio pattern by hand. */}
      <fieldset>
        <legend className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">
          {t("report.type.legend")}
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REPORT_TYPES.map((rt) => (
            <label
              key={rt.value}
              className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg border text-sm cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-300 ${
                type === rt.value
                  ? "bg-emerald-500 border-emerald-400 text-gray-900 font-semibold"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-gray-100"
              }`}
            >
              <input
                type="radio"
                name="report-type"
                value={rt.value}
                checked={type === rt.value}
                onChange={() => setType(rt.value)}
                className="sr-only"
              />
              <span aria-hidden="true">{rt.icon}</span>
              <span>{t(rt.labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* For email type: show a summary of what was already parsed from the headers */}
      {type === "email" && (scamEmail || scamReplyTo || authSummary) && (
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 space-y-1.5 text-xs">
          <p className="text-emerald-400 font-semibold">{t("report.extracted.heading")}</p>
          {scamEmail && (
            <p className="text-gray-300 font-mono">
              <span className="text-gray-500">{t("report.extracted.from")} </span>{scamEmail}
            </p>
          )}
          {scamReplyTo && (
            <p className="text-gray-300 font-mono">
              <span className="text-gray-500">{t("report.extracted.replyTo")} </span>{scamReplyTo}
            </p>
          )}
          {(auth.spf || auth.dkim || auth.dmarc) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-gray-500">{t("report.extracted.auth")}</span>
              <AuthChip label="SPF" verdict={auth.spf} />
              <AuthChip label="DKIM" verdict={auth.dkim} />
              <AuthChip label="DMARC" verdict={auth.dmarc} />
            </div>
          )}
          {trackingReport?.summary && (
            <p className="text-amber-300/90 font-mono">
              <span className="text-gray-500">{t("report.extracted.tracking")} </span>{trackingReport.summary}
            </p>
          )}
          <p className="text-gray-500">{t("report.extracted.review")}</p>
        </div>
      )}

      {/* Scam content */}
      <div>
        <label htmlFor="report-content" className="block text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">
          {t("report.content.label")}{" "}
          <span aria-hidden="true" className="text-red-400">*</span>
        </label>
        <textarea
          id="report-content"
          required
          aria-required="true"
          aria-describedby="content-count"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t(PLACEHOLDER_KEYS[type])}
          rows={type === "url" || type === "phone" ? 2 : 4}
          maxLength={2000}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-[16px] sm:text-sm font-mono"
        />
        {/* Deliberately not aria-live — announcing every keystroke is noise;
            the count is reachable via aria-describedby on the field. */}
        <div id="content-count" className="text-right text-sm text-gray-400 mt-0.5">
          {content.length}/2000
        </div>
      </div>

      {/* For custom reports, description comes first — it's the primary signal */}
      {type === "custom" && (
        <div>
          <label htmlFor="report-description-custom" className="block text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">
            {t("report.desc.label")}
          </label>
          <textarea
            id="report-description-custom"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("report.desc.placeholder.custom")}
            rows={4}
            maxLength={1000}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-[16px] sm:text-sm"
          />
        </div>
      )}

      {/* Scam identifiers — shown selectively based on report type */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          {t("report.ids.legend")}{" "}
          <span className="text-gray-400 normal-case font-normal">{t("report.optional")}</span>
        </legend>
        <p className="text-xs text-gray-500">{t("report.ids.hint")}</p>

        {/* URL — shown for url, sms, qr, email (links in phishing), custom */}
        {type !== "phone" && (
          <div>
            <label htmlFor="report-scam-url" className="block text-xs font-medium text-gray-400 mb-1">{t("report.ids.url")}</label>
            <input
              id="report-scam-url"
              type="url"
              value={scamUrl}
              onChange={(e) => setScamUrl(e.target.value)}
              placeholder="https://fake-ato-refund.xyz/verify"
              maxLength={2000}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-[16px] sm:text-sm font-mono"
            />
          </div>
        )}

        {/* Phone — shown for phone, sms, custom */}
        {(type === "phone" || type === "sms" || type === "custom") && (
          <div>
            <label htmlFor="report-scam-phone" className="block text-xs font-medium text-gray-400 mb-1">{t("report.ids.phone")}</label>
            <input
              id="report-scam-phone"
              type="tel"
              value={scamPhone}
              onChange={(e) => setScamPhone(e.target.value)}
              placeholder="+61 4xx xxx xxx"
              maxLength={50}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-[16px] sm:text-sm font-mono"
            />
          </div>
        )}

        {/* Email — shown for email, sms (sender addr), custom; hidden for url/phone/qr */}
        {(type === "email" || type === "sms" || type === "custom") && (
          <div>
            <label htmlFor="report-scam-email" className="block text-xs font-medium text-gray-400 mb-1">
              {type === "email" ? t("report.ids.emailFrom") : t("report.ids.email")}
            </label>
            <input
              id="report-scam-email"
              type="email"
              value={scamEmail}
              onChange={(e) => setScamEmail(e.target.value)}
              placeholder="scammer@dodgy-domain.com"
              maxLength={200}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-[16px] sm:text-sm font-mono"
            />
          </div>
        )}

        {type === "email" && (
          <>
            <div>
              <label htmlFor="report-scam-reply-to" className="block text-xs font-medium text-gray-400 mb-1">
                {t("report.ids.replyTo")}
              </label>
              <input
                id="report-scam-reply-to"
                type="email"
                value={scamReplyTo}
                onChange={(e) => setScamReplyTo(e.target.value)}
                placeholder="different-address@elsewhere.ru"
                maxLength={200}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-[16px] sm:text-sm font-mono"
              />
              {scamEmail && scamReplyTo &&
                scamEmail.split("@")[1]?.toLowerCase() !== scamReplyTo.split("@")[1]?.toLowerCase() && (
                <p className="mt-1 text-xs text-amber-400">
                  ⚠ {t("report.ids.replyMismatch")}
                </p>
              )}
            </div>

            {/* Raw-source paste / .eml drop. Collapsed by default once the email
                was already identified upstream (we have a From) — re-pasting
                wouldn't add anything. A toggle keeps it reachable to enrich a
                missing SPF/DKIM. When nothing was parsed yet it's shown open. */}
            {showSource ? (
              <div>
                <EmailExportGuide />
                <label htmlFor="report-email-source" className="block text-xs font-medium text-gray-400 mb-1 mt-3">
                  {t("report.email.source.label")}
                </label>
                <textarea
                  id="report-email-source"
                  value={emailSource}
                  onChange={(e) => parseSource(e.target.value)}
                  placeholder={t("report.email.source.placeholder")}
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-[16px] sm:text-xs font-mono resize-y"
                />
                <input
                  type="file"
                  accept=".eml,message/rfc822,text/plain"
                  aria-label={t("report.email.source.file")}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmlFile(f); }}
                  className="mt-1.5 block w-full text-xs text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-gray-300 hover:file:bg-gray-700"
                />
                {parseNote && (
                  <p className={`mt-1 text-xs ${parseNote.startsWith("⚠") ? "text-amber-400" : "text-gray-400"}`}>
                    {parseNote}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSource(true)}
                className="text-xs text-gray-400 hover:text-emerald-400 underline underline-offset-2"
              >
                {t("report.email.source.add")}
              </button>
            )}

            {/* Tracking findings are derived analysis — keep them visible even
                when the raw-source box is collapsed. */}
            {trackingReport?.hasTracking && (
              <div className="space-y-1">
                {trackingReport.findings.map((f) => (
                  <p key={f.kind} className="text-xs text-amber-400">
                    • {f.label}{f.count > 1 ? ` ×${f.count}` : ""} — {f.detail}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </fieldset>

      {/* Description — hidden for custom (rendered above identifiers instead) */}
      {type !== "custom" && (
        <div>
          <label htmlFor="report-description" className="block text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">
            {t("report.desc.label")}{" "}
            <span className="text-gray-400 normal-case font-normal">{t("report.desc.optional")}</span>
          </label>
          <textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("report.desc.placeholder")}
            rows={3}
            maxLength={1000}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-[16px] sm:text-sm"
          />
        </div>
      )}

      {/* Contact */}
      <div>
        <label htmlFor="report-contact" className="block text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
          {t("report.contact.label")}{" "}
          <span className="text-gray-400 normal-case font-normal">{t("report.contact.optional")}</span>
        </label>
        <input
          id="report-contact"
          type="email"
          autoComplete="email"
          aria-describedby="contact-hint"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com.au"
          maxLength={200}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 text-base"
        />
        <p id="contact-hint" className="mt-1 text-sm text-gray-400">
          {t("report.contact.hint")}{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-gray-300">
            {t("report.contact.aboutLink")}
          </Link>
        </p>
      </div>

      {/* Error */}
      {status === "error" && (
        <div role="alert" className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
          {t("report.error")}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!content.trim() || status === "submitting"}
        aria-busy={status === "submitting"}
        className="w-full py-3 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-800 disabled:text-gray-400 text-gray-900 font-bold rounded-lg transition-all text-sm uppercase tracking-wide"
      >
        {status === "submitting" ? t("report.submitting") : t("report.submit")}
      </button>

    </form>
  );
}
