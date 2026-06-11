"use client";

import { useEffect, useRef, useState } from "react";
import { AnalyzedIdentifier, ScamType } from "@/lib/scamDetector";
import { detectType } from "@/lib/detectType";
import { extractIdentifiers, defang, defangEmail, defangPhone, defangText } from "@/lib/urlSanitizer";
import { parseEmailHeaders } from "@/lib/emailHeaders";
import { useLang, MessageKey } from "@/lib/lang";
import { useBugReport } from "./BugReportProvider";
import VerdictBadge from "./VerdictBadge";
import ReportForm from "./ReportForm";

type Step = "input" | "result" | "report";

const KIND_META: Record<AnalyzedIdentifier["kind"], { icon: string; labelKey: MessageKey }> = {
  url:     { icon: "🔗", labelKey: "kind.url" },
  email:   { icon: "📧", labelKey: "kind.email" },
  phone:   { icon: "📞", labelKey: "kind.phone" },
  message: { icon: "💬", labelKey: "kind.message" },
};

function defangValue(kind: AnalyzedIdentifier["kind"], value: string): string {
  if (kind === "url")   return defang(value);
  if (kind === "email") return defangEmail(value);
  if (kind === "phone") return defangPhone(value);
  return defangText(value);
}

// kind → ScamType for prefilling the report form.
function kindToType(kind: AnalyzedIdentifier["kind"], content: string): ScamType {
  if (kind === "url" || kind === "email" || kind === "phone") return kind;
  return detectType(content);
}

export default function CheckFlow() {
  const { t } = useLang();
  const { reportFailure } = useBugReport();
  const [step, setStep] = useState<Step>("input");
  const [content, setContent] = useState("");
  const [results, setResults] = useState<AnalyzedIdentifier[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const emlRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // History contract: every step transition is mirrored in history state, and
  // history is the single source of truth for backwards movement. Forward
  // transitions push an entry; the in-app back buttons call history.back() so
  // browser Back/Forward and the UI never diverge.
  useEffect(() => {
    if (!history.state?.step) history.replaceState({ step: "input" }, "");
    function onPopState(e: PopStateEvent) {
      setStep((e.state?.step as Step) ?? "input");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function goForward(next: Step) {
    setStep(next);
    history.pushState({ step: next }, "");
  }

  // Move focus to the step heading on transitions so screen readers announce
  // the new step (the steps replace each other in place, with no navigation).
  const prevStep = useRef<Step>("input");
  useEffect(() => {
    if (prevStep.current !== step) stepHeadingRef.current?.focus();
    prevStep.current = step;
  }, [step]);

  // Image → QR decode (client-side) first, OCR fallback via /api/ocr.
  async function handleImageUpload(file: File) {
    setUploadError(null);
    setUploadLoading(true);
    try {
      let qrData: string | null = null;
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const jsQR = (await import("jsqr")).default;
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (code) qrData = code.data;
      } catch {
        // Not a QR or unreadable — fall through to OCR
      }

      if (qrData) { setContent(qrData); return; }

      const formData = new FormData();
      formData.append("image", file);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch("/api/ocr", { method: "POST", body: formData, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? "OCR request failed");
      }
      const data = await res.json() as { text?: string };
      const cleaned = (data.text ?? "").trim();
      if (cleaned) setContent(cleaned);
      else setUploadError(t("check.ocr.noText"));
    } catch (err) {
      console.error("[Upload] failed:", err);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      setUploadError(
        isTimeout
          ? t("check.ocr.timeout")
          : err instanceof Error && err.message
            ? err.message
            : t("check.ocr.failed"),
      );
      reportFailure("upload", err);
    } finally {
      setUploadLoading(false);
      if (imageRef.current) imageRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  // .eml is just RFC822 text — read it on-device and drop the raw source into
  // the textarea so the headers (From/Reply-To) feed the check.
  async function handleEmlUpload(file: File) {
    setUploadError(null);
    try {
      const text = await file.text();
      setContent(text);
    } catch (err) {
      setUploadError(t("check.file.error"));
      reportFailure("upload", err);
    } finally {
      if (emlRef.current) emlRef.current.value = "";
    }
  }

  async function runCheck() {
    if (!content.trim()) return;
    setCheckLoading(true);
    setCheckError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json() as { results: AnalyzedIdentifier[] };
      setResults(data.results ?? []);
      setShareCopied(false);
      goForward("result");
    } catch (err) {
      setCheckError(t("check.serverError"));
      reportFailure("check", err);
    } finally {
      setCheckLoading(false);
    }
  }

  // Share the verdicts (defanged) via the native share sheet, falling back to
  // the clipboard. The shared text never contains a live link to the scam.
  async function shareResults() {
    const lines = results.map((r) => {
      const label = t(KIND_META[r.kind].labelKey);
      const value = r.kind !== "message" && r.value ? ` ${defangValue(r.kind, r.value)}` : "";
      return `${label}${value}: ${t(`verdict.${r.result.verdict}.label` as MessageKey)}`;
    });
    const text = `${t("check.share.summary")}\n${lines.join("\n")}\n${window.location.origin}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User dismissed the sheet, or share failed — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Clipboard unavailable (rare) — nothing sensible to do.
    }
  }

  const busy = uploadLoading || checkLoading;

  // ── Report step ─────────────────────────────────────────────────────────────
  if (step === "report") {
    const ids = extractIdentifiers(content);
    const headers = parseEmailHeaders(content);
    const primary = results[0];
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.report")}</h2>
        <button
          onClick={() => history.back()}
          className="flex items-center gap-1.5 w-full px-6 py-3.5 border-b border-gray-800 text-sm font-semibold text-gray-300 hover:text-emerald-400 transition-colors"
        >
          <span aria-hidden="true">‹</span> {t("check.back.results")}
        </button>
        <div className="p-6">
          <ReportForm
            initialType={
              // A parsed From address means this is email source — report it as
              // such so the sender/reply-to/authentication fields all show.
              headers.fromAddress
                ? "email"
                : primary ? kindToType(primary.kind, content) : detectType(content)
            }
            initialContent={content}
            initialScamUrl={ids.scamUrl}
            initialScamPhone={ids.scamPhone}
            initialScamEmail={headers.fromAddress || ids.scamEmail}
            initialScamReplyTo={headers.replyTo}
            initialAuth={{ spf: headers.spf, dkim: headers.dkim, dkimDomain: headers.dkimDomain, dmarc: headers.dmarc }}
          />
        </div>
      </div>
    );
  }

  // ── Result step ───────────────────────────────────────────────────────────────
  if (step === "result") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.result")}</h2>
        <button
          onClick={() => history.back()}
          className="flex items-center gap-1.5 w-full px-6 py-3.5 border-b border-gray-800 text-sm font-semibold text-gray-300 hover:text-emerald-400 transition-colors"
        >
          <span aria-hidden="true">‹</span> {t("check.back.edit")}
        </button>
        <div className="p-6 space-y-4">
          {results.length === 0 ? (
            <p className="text-sm text-gray-400">{t("check.nothing")}</p>
          ) : (
            results.map((r, i) => {
              const meta = KIND_META[r.kind];
              return (
                <div key={`${r.kind}-${i}`} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <span aria-hidden="true">{meta.icon}</span>
                    <span className="uppercase tracking-wider">{t(meta.labelKey)}</span>
                    {r.value && r.kind !== "message" && (
                      <span className="font-mono text-amber-400/90 break-all">· {defangValue(r.kind, r.value)}</span>
                    )}
                  </div>
                  <VerdictBadge result={r.result} />
                </div>
              );
            })
          )}

          {(() => {
            const isClean = results.length > 0 && results.every((r) => r.result.verdict === "safe");
            return (
              <button
                onClick={() => goForward("report")}
                className={`w-full py-3 px-6 font-bold rounded-lg transition-colors text-sm uppercase tracking-wide flex items-center justify-center gap-2 ${
                  isClean
                    ? "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                    : "bg-red-800 hover:bg-red-700 text-white"
                }`}
              >
                <span aria-hidden="true">🚨</span>
                {isClean ? t("check.reportAnyway") : t("check.report")}
              </button>
            );
          })()}

          {results.length > 0 && (
            <button
              onClick={shareResults}
              className="w-full py-2.5 px-6 font-semibold rounded-lg transition-colors text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center gap-2"
            >
              <span aria-hidden="true">📤</span>
              {shareCopied ? t("check.shareCopied") : t("check.share")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Input step ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.input")}</h2>
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-500 leading-snug">
        <span aria-hidden="true">🔒</span>
        {t("check.privacy")}
      </p>

      {/* Hidden file inputs */}
      <input ref={imageRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={emlRef} type="file" accept=".eml,message/rfc822,text/plain" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmlUpload(f); }} />

      {/* On mobile: camera is full-width (primary action), image+eml share the row.
          On sm+: equal three columns. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center gap-2 px-3 py-5 min-h-[80px] border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span aria-hidden="true" className="text-2xl">📷</span>
          <span className="font-medium text-sm text-center">{t("check.takePhoto")}</span>
          <span className="text-xs text-gray-500 text-center leading-tight">{t("check.takePhotoDesc")}</span>
        </button>
        <button
          type="button"
          onClick={() => imageRef.current?.click()}
          disabled={busy}
          aria-busy={uploadLoading}
          className="flex flex-col items-center justify-center gap-2 px-3 py-5 min-h-[80px] border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span aria-hidden="true" className="text-2xl">{uploadLoading ? "⏳" : "🖼️"}</span>
          <span className="font-medium text-sm text-center">{t("check.uploadImage")}</span>
          <span className="text-xs text-gray-500 text-center leading-tight">{t("check.uploadImageDesc")}</span>
        </button>
        {/* .eml upload — labelled for clarity; described as advanced to de-prioritise for most users */}
        <button
          type="button"
          onClick={() => emlRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 px-3 py-5 min-h-[80px] border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span aria-hidden="true" className="text-2xl">📨</span>
          <span className="font-medium text-sm text-center">{t("check.uploadEml")}</span>
          <span className="text-xs text-gray-500 text-center leading-tight">{t("check.uploadEmlDesc")}</span>
        </button>
      </div>

      {/* OCR can legitimately take up to a minute on a cold start — say so,
          and announce it to screen readers, so a long wait doesn't read as a hang. */}
      {uploadLoading && (
        <p role="status" className="text-sm text-gray-400 text-center">
          {t("check.ocr.working")}
        </p>
      )}

      {uploadError && <p className="text-sm text-red-400" role="alert">{uploadError}</p>}

      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-xs text-gray-500">{t("check.orPaste")}</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      <div>
        <label htmlFor="check-content" className="sr-only">{t("check.contentLabel")}</label>
        <textarea
          id="check-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("check.placeholder")}
          rows={5}
          className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-base font-mono"
        />
        {/* Paste guidance for users who aren't sure how to copy on mobile */}
        {!content && (
          <p className="mt-1.5 text-xs text-gray-500">{t("check.pasteHint")}</p>
        )}
      </div>

      <button
        onClick={runCheck}
        disabled={checkLoading || !content.trim()}
        aria-busy={checkLoading}
        className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white font-bold rounded-lg transition-colors text-base uppercase tracking-wide"
      >
        {checkLoading ? t("check.analysing") : t("check.submit")}
      </button>

      {checkError && (
        <div role="alert" className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {checkError}
        </div>
      )}
    </div>
  );
}
