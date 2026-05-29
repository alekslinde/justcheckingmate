"use client";

import { useState, useRef } from "react";
import { CheckResult, ScamType } from "@/lib/scamDetector";
import { defangText } from "@/lib/urlSanitizer";
import VerdictBadge from "./VerdictBadge";

const SCAM_TYPES: { value: ScamType; label: string; placeholder: string; icon: string }[] = [
  { value: "url",    label: "Dodgy Link",    icon: "🔗", placeholder: "Paste the sus URL in here, e.g. https://my-g0v-ato-login.tk/verify" },
  { value: "sms",    label: "Suss Text/SMS", icon: "📱", placeholder: "Paste the whole text message in here..." },
  { value: "email",  label: "Phishing Email",icon: "📧", placeholder: "Paste the email content (From: ..., Subject: ..., Body: ...)..." },
  { value: "phone",  label: "Scam Number",   icon: "📞", placeholder: "Enter the phone number, e.g. +61 412 345 678 or +1 202 555 0123" },
  { value: "qr",     label: "QR Code Link",  icon: "📷", placeholder: "Paste the URL your QR code points to..." },
  { value: "custom", label: "Something Else",icon: "🤔", placeholder: "Describe it or paste it in — we'll do our best, mate..." },
];


export default function ScamChecker() {
  const [scamType, setScamType] = useState<ScamType>("url");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDecodeError, setQrDecodeError] = useState<string | null>(null);
  const [qrDecoding, setQrDecoding] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);

  const selectedType = SCAM_TYPES.find((t) => t.value === scamType)!;

  async function handleQrUpload(file: File) {
    setQrDecodeError(null);
    setQrDecoding(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const jsQR = (await import("jsqr")).default;
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        setContent(code.data);
        setResult(null);
        setError(null);
      } else {
        setQrDecodeError("Couldn't find a QR code in that image — try a clearer screenshot, mate.");
      }
    } catch {
      setQrDecodeError("Couldn't read that file. Make sure it's a PNG, JPG, or WebP image.");
    } finally {
      setQrDecoding(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleOcrUpload(file: File) {
    setOcrError(null);
    setOcrProgress("Loading OCR engine…");
    setOcrLoading(true);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") {
            setOcrProgress(`Reading text… ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      const cleaned = text.trim();
      if (cleaned) {
        setContent(cleaned);
        setResult(null);
        setError(null);
      } else {
        setOcrError("Couldn't read any text from that image — try a clearer screenshot, mate.");
      }
    } catch {
      setOcrError("Couldn't process that file. Make sure it's a PNG, JPG, or WebP image.");
    } finally {
      setOcrLoading(false);
      setOcrProgress(null);
      if (ocrFileInputRef.current) ocrFileInputRef.current.value = "";
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
        body: JSON.stringify({ type: scamType, content }),
      });
      if (!res.ok) throw new Error("Server said nah");
      const data: CheckResult = await res.json();
      setResult(data);
    } catch {
      setError("Strewth, something went wrong on our end. Give it another crack.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Type selector — radio group */}
      <div>
        <p id="scam-type-label" className="text-sm font-semibold text-amber-400 mb-2 uppercase tracking-wider">
          What are you checking?
        </p>
        <div
          role="radiogroup"
          aria-labelledby="scam-type-label"
          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        >
          {SCAM_TYPES.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={scamType === t.value}
              onClick={() => {
                setScamType(t.value);
                setResult(null);
                setError(null);
                setQrDecodeError(null);
                setOcrError(null);
                setOcrProgress(null);
              }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                scamType === t.value
                  ? "bg-amber-500 border-amber-400 text-gray-900"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div>
        <label htmlFor="scam-content" className="block text-sm font-semibold text-amber-400 mb-2 uppercase tracking-wider">
          <span aria-hidden="true">{selectedType.icon}</span>{" "}{selectedType.label}
        </label>

        {/* Screenshot upload — OCR for all types except QR (which has its own decoder) */}
        {scamType !== "qr" && (
          <div className="mb-3">
            <input
              ref={ocrFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleOcrUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => ocrFileInputRef.current?.click()}
              disabled={ocrLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-600 rounded-lg text-sm text-gray-400 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span aria-hidden="true" className="text-lg">📂</span>
              <span>{ocrLoading ? (ocrProgress ?? "Reading…") : "Got a screenshot? Upload it and we'll read the text for ya"}</span>
            </button>
            <p aria-live="polite" className="mt-1.5 text-sm min-h-[1rem]">
              {ocrError
                ? <span className="text-red-400">{ocrError}</span>
                : content && !ocrLoading
                  ? <span className="text-green-400">Text extracted — have a squiz below and hit Check when ready.</span>
                  : null}
            </p>
          </div>
        )}

        {/* QR screenshot upload */}
        {scamType === "qr" && (
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleQrUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={qrDecoding}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-600 rounded-lg text-sm text-gray-400 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span aria-hidden="true" className="text-lg">📂</span>
              <span>{qrDecoding ? "Reading QR code…" : "Upload a screenshot — we'll read the QR for ya"}</span>
            </button>
            <p aria-live="polite" className="mt-1.5 text-sm min-h-[1rem]">
              {qrDecodeError
                ? <span className="text-red-400">{qrDecodeError}</span>
                : content && !qrDecoding
                  ? <span className="text-green-400">QR decoded — URL&apos;s ready to check below.</span>
                  : null}
            </p>
          </div>
        )}

        <textarea
          id="scam-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={selectedType.placeholder}
          rows={scamType === "url" || scamType === "phone" ? 2 : 5}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-y text-sm font-mono"
        />
        {scamType === "custom" && (
          <p className="mt-1 text-sm text-gray-400">
            No worries if it doesn&apos;t fit a category — just describe it or paste whatever you&apos;ve got.
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleCheck}
        disabled={loading || !content.trim()}
        aria-busy={loading}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-400 text-gray-900 font-bold rounded-lg transition-all text-base uppercase tracking-wide"
      >
        {loading ? "Checking it out..." : "Just Checking, Mate! 🔍"}
      </button>

      {/* Error */}
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

            {/* Flags */}
            {result.flags.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-3">
                  Red Flags Spotted
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
          </div>
        )}
      </div>
    </div>
  );
}
