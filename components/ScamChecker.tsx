"use client";

import { useState, useRef } from "react";
import { CheckResult, ScamType } from "@/lib/scamDetector";
import { defangText, extractIdentifiers } from "@/lib/urlSanitizer";
import VerdictBadge from "./VerdictBadge";
import { useLang } from "@/lib/lang";

const SCAM_CATEGORIES = [
  { icon: "🔗", label: "Links & URLs",   aussieLabel: "Links & URLs",    desc: "Fake sites & phishing URLs",         aussieDesc: "Dodgy sites & phishing URLs" },
  { icon: "📱", label: "SMS & texts",    aussieLabel: "Texts & SMS",     desc: "Impersonation & delivery scams",     aussieDesc: "Impersonation & delivery scams" },
  { icon: "📧", label: "Emails",         aussieLabel: "Emails",          desc: "Phishing & fake invoices",           aussieDesc: "Phishing & dodgy invoices" },
  { icon: "📞", label: "Phone numbers",  aussieLabel: "Phone numbers",   desc: "Robocalls & scam callers",           aussieDesc: "Robocalls & dodgy callers" },
  { icon: "📷", label: "QR codes",       aussieLabel: "QR codes",        desc: "Malicious codes in emails & flyers", aussieDesc: "Dodgy codes in emails & flyers" },
  { icon: "🤔", label: "Anything else",  aussieLabel: "Something sus?",  desc: "If it feels off — check it",        aussieDesc: "If it smells dodgy — chuck it in" },
];


function detectType(text: string): ScamType {
  const t = text.trim();
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return "url";
  if (/^\+?[\d][\d\s\-().]{6,}[\d]$/.test(t)) return "phone";
  if (/^(from|to|subject|date)\s*:/im.test(t)) return "email";
  return "sms";
}

type Identifiers = { scamUrl: string; scamPhone: string; scamEmail: string };

export default function ScamChecker({ onReport }: { onReport?: (type: ScamType, content: string, ids: Identifiers) => void }) {
  const { t } = useLang();
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(file: File) {
    setUploadError(null);
    setUploadLoading(true);
    try {
      // Try QR decode first — client-side, no upload needed
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

      if (qrData) {
        setContent(qrData);
        setResult(null);
        setError(null);
        return;
      }

      // OCR fallback via server
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
      if (cleaned) {
        setContent(cleaned);
        setResult(null);
        setError(null);
      } else {
        setUploadError(t(
          "Couldn't read any text from that image — try a clearer screenshot.",
          "Couldn't read any text from that image — try a clearer screenshot, mate."
        ));
      }
    } catch (err) {
      console.error("[Upload] failed:", err);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const serverMsg = !isTimeout && err instanceof Error && err.message ? err.message : null;
      setUploadError(
        isTimeout
          ? t("OCR is taking too long — try again or paste the text manually.",
              "OCR is taking too long — try again or paste the text in yourself.")
          : serverMsg ?? t(
              "Couldn't process that image — try a clearer screenshot or paste the text manually.",
              "Couldn't process that image — try a clearer screenshot or paste the text in yourself."
            )
      );
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCheck() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: detectType(content), content }),
      });
      if (!res.ok) throw new Error("Server error");
      setResult(await res.json());
    } catch {
      setError(t(
        "Something went wrong on our end — please try again.",
        "Strewth, something went wrong on our end. Give it another crack."
      ));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* Informational category grid */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {t("Common scam types we check", "Common scam types, mate")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCAM_CATEGORIES.map(({ icon, label, aussieLabel, desc, aussieDesc }) => (
            <div key={label} className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span aria-hidden="true">{icon}</span>
                <span className="text-sm font-medium text-gray-200">{t(label, aussieLabel)}</span>
              </div>
              <p className="text-xs text-gray-500">{t(desc, aussieDesc)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }}
        />
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLoading}
            className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span aria-hidden="true" className="text-3xl">{uploadLoading ? "⏳" : "🖼️"}</span>
            <span className="font-medium text-sm">
              {uploadLoading ? t("Reading…", "Hang on…") : t("Upload screenshot", "Upload a screenshot")}
            </span>
            <span className="text-xs text-gray-500">PNG, JPG, HEIC</span>
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploadLoading}
            className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span aria-hidden="true" className="text-3xl">{uploadLoading ? "⏳" : "📷"}</span>
            <span className="font-medium text-sm">
              {uploadLoading ? t("Reading…", "Hang on…") : t("Take a photo", "Take a photo")}
            </span>
            <span className="text-xs text-gray-500">{t("QR codes auto-decoded", "QR codes auto-decoded, mate")}</span>
          </button>
        </div>
        <p aria-live="polite" className="mt-1.5 text-sm min-h-[1rem]">
          {uploadError
            ? <span className="text-red-400">{uploadError}</span>
            : content && !uploadLoading
              ? <span className="text-emerald-400">{t("Got it — review below and hit Check.", "Got it — have a squiz below and hit Check.")}</span>
              : null}
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-xs text-gray-500">{t("or paste below", "or paste it below")}</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      {/* Text input */}
      <div>
        <label htmlFor="scam-content" className="sr-only">Suspicious content</label>
        <textarea
          id="scam-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t(
            "Paste a URL, phone number, SMS, or email content here…",
            "Paste the sus stuff here — URL, text, email, whatever you've got…"
          )}
          rows={5}
          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-sm font-mono"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleCheck}
        disabled={loading || !content.trim()}
        aria-busy={loading}
        className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white font-bold rounded-lg transition-all text-base uppercase tracking-wide"
      >
        {loading
          ? t("Analysing…", "Checking it out…")
          : t("Check This Now 🔍", "Just Checking, Mate! 🔍")}
      </button>

      {error && (
        <div role="alert" className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      <div aria-live="polite" aria-atomic="true">
        {result && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <VerdictBadge result={result} />
            {result.flags.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-3">
                  {t("Warning Signs Detected", "Red Flags Spotted")}
                </h3>
                <ul className="space-y-2">
                  {result.flags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-red-400 mt-0.5 shrink-0" aria-hidden="true">⚠</span>
                      <span>{defangText(flag)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(result.verdict === "likely_scam" || result.verdict === "suspicious") && onReport && (
              <button
                onClick={() => onReport(detectType(content), content, extractIdentifiers(content))}
                className="w-full py-3 px-6 bg-red-800 hover:bg-red-700 text-white font-bold rounded-lg transition-all text-sm uppercase tracking-wide flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">🚨</span>
                {t("Report This Scam", "Report This Mongrel")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
