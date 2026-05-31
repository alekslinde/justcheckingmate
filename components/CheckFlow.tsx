"use client";

import { useRef, useState } from "react";
import { AnalyzedIdentifier, ScamType } from "@/lib/scamDetector";
import { detectType } from "@/lib/detectType";
import { extractIdentifiers, defang, defangEmail, defangPhone, defangText } from "@/lib/urlSanitizer";
import { parseEmailHeaders } from "@/lib/emailHeaders";
import { useLang } from "@/lib/lang";
import VerdictBadge from "./VerdictBadge";
import ReportForm from "./ReportForm";

type Step = "input" | "result" | "report";

const KIND_META: Record<AnalyzedIdentifier["kind"], { icon: string; label: string }> = {
  url:     { icon: "🔗", label: "Link" },
  email:   { icon: "📧", label: "Sender" },
  phone:   { icon: "📞", label: "Phone number" },
  message: { icon: "💬", label: "Message" },
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
  const [step, setStep] = useState<Step>("input");
  const [content, setContent] = useState("");
  const [results, setResults] = useState<AnalyzedIdentifier[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const emlRef = useRef<HTMLInputElement>(null);

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
    } catch {
      setUploadError(t("check.file.error"));
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
      setStep("result");
    } catch {
      setCheckError(t("check.serverError"));
    } finally {
      setCheckLoading(false);
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
        <button
          onClick={() => setStep("result")}
          className="flex items-center gap-1.5 w-full px-6 py-3.5 border-b border-gray-800 text-sm font-semibold text-gray-300 hover:text-emerald-400 transition-colors"
        >
          <span aria-hidden="true">‹</span> {t("check.back.results")}
        </button>
        <div className="p-6">
          <ReportForm
            initialType={primary ? kindToType(primary.kind, content) : detectType(content)}
            initialContent={content}
            initialScamUrl={ids.scamUrl}
            initialScamPhone={ids.scamPhone}
            initialScamEmail={headers.fromAddress || ids.scamEmail}
            initialScamReplyTo={headers.replyTo}
          />
        </div>
      </div>
    );
  }

  // ── Result step ───────────────────────────────────────────────────────────────
  if (step === "result") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setStep("input")}
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
                    <span className="uppercase tracking-wider">{meta.label}</span>
                    {r.value && r.kind !== "message" && (
                      <span className="font-mono text-amber-400/90 break-all">· {defangValue(r.kind, r.value)}</span>
                    )}
                  </div>
                  <VerdictBadge result={r.result} />
                </div>
              );
            })
          )}

          <button
            onClick={() => setStep("report")}
            className="w-full py-3 px-6 bg-red-800 hover:bg-red-700 text-white font-bold rounded-lg transition-all text-sm uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <span aria-hidden="true">🚨</span>
            {t("check.report")}
          </button>
        </div>
      </div>
    );
  }

  // ── Input step ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-500 leading-snug">
        <span aria-hidden="true">🔒</span>
        We don&apos;t store your uploads or share them with anyone — and we never open the links in your scam.
      </p>
      
      {/* Hidden file inputs */}
      <input ref={imageRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={emlRef} type="file" accept=".eml,message/rfc822,text/plain" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmlUpload(f); }} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => imageRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 px-3 py-5 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span aria-hidden="true" className="text-2xl">{uploadLoading ? "⏳" : "🖼️"}</span>
          <span className="font-medium text-xs text-center">{t("check.uploadImage")}</span>
          <span className="text-[10px] text-gray-500 text-center leading-tight">{t("check.uploadImageDesc")}</span>
        </button>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 px-3 py-5 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span aria-hidden="true" className="text-2xl">📷</span>
          <span className="font-medium text-xs text-center">{t("check.takePhoto")}</span>
          <span className="text-[10px] text-gray-500 text-center leading-tight">{t("check.takePhotoDesc")}</span>
        </button>
        <button
          type="button"
          onClick={() => emlRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 px-3 py-5 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span aria-hidden="true" className="text-2xl">📨</span>
          <span className="font-medium text-xs text-center">{t("check.uploadEml")}</span>
          <span className="text-[10px] text-gray-500 text-center leading-tight">{t("check.uploadEmlDesc")}</span>
        </button>
      </div>

      

      {uploadError && <p className="text-sm text-red-400" role="alert">{uploadError}</p>}

      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-xs text-gray-500">{t("check.orPaste")}</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      <div>
        <label htmlFor="check-content" className="sr-only">Suspicious content</label>
        <textarea
          id="check-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("check.placeholder")}
          rows={5}
          className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-sm font-mono"
        />
      </div>

      <button
        onClick={runCheck}
        disabled={checkLoading || !content.trim()}
        aria-busy={checkLoading}
        className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white font-bold rounded-lg transition-all text-base uppercase tracking-wide"
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
