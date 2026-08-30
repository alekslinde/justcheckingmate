"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnalyzedIdentifier, ScamType } from "@justcheckingmate/engine/scamDetector";
import { detectType } from "@justcheckingmate/engine/detectType";
import { extractIdentifiers, defangEmail } from "@justcheckingmate/engine/urlSanitizer";
import { parseEmailHeaders, summariseAuth } from "@justcheckingmate/engine/emailHeaders";
import { analyseEmailSource, EmailSourceAnalysis } from "@/lib/emailSource";
import { distillEmailContent } from "@/lib/emailDistiller";
import { VERDICT_RANK, defangValue, defangFlag, composeVerdict, isClean, overallCoverage } from "@/lib/verdictSummary";
import { useLang, MessageKey } from "@/lib/lang";
// Capability probe only — the OCR engine itself is imported dynamically so the
// WASM core is never downloaded by someone who does not upload an image.
import { canRunClientOcr } from "@/lib/clientOcr";
import { useBugReport } from "./BugReportProvider";
import VerdictBadge from "./VerdictBadge";
import CoverageNotice from "./CoverageNotice";
import ReportForm from "./ReportForm";

type Step = "input" | "result" | "report";
type Verdict = AnalyzedIdentifier["result"]["verdict"];

// Inline stroke icons for the upload actions — kept local (no icon-library
// dependency for three glyphs). They inherit the button's text colour via
// currentColor, so hover/disabled states need no extra wiring.
const ICON = { className: "w-[15px] h-[15px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function CameraIcon() {
  return (
    <svg {...ICON}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-4.5-4.5L5 21" />
    </svg>
  );
}

function EmailFileIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg {...ICON} className="w-[15px] h-[15px] animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

const KIND_META: Record<AnalyzedIdentifier["kind"], { icon: string; labelKey: MessageKey }> = {
  url:     { icon: "🔗", labelKey: "kind.url" },
  email:   { icon: "📧", labelKey: "kind.email" },
  phone:   { icon: "📞", labelKey: "kind.phone" },
  message: { icon: "💬", labelKey: "kind.message" },
};

// Forward-to-us address, shown only once inbound mail is live end-to-end. The
// flag is read at build time (NEXT_PUBLIC_*), so an unconfigured deploy never
// advertises a dead inbox. Address is overridable for staging/other domains.

// Shared chrome for the four capture options (take photo / upload image /
// upload .eml / forward). One constant rather than the same 200-character class
// string repeated four times, so the row styling can only change in lockstep.
// Grid placement and the disabled states are per-option and stay at the call
// site — the forward option is an <a> and is never disabled.
// Icon beside the text on a phone (one full-width row per option, so there is
// plenty of horizontal room), and icon above centred text from sm up, where
// three columns leave each option only ~200px and a side-by-side layout would
// squeeze the description into a narrow ragged column.
// Chips in the card footer, on the paper surface — so these are light-surface
// colours, not the page palette. Secondary to the submit beside them.
const CAPTURE_OPTION =
  "inline-flex items-center gap-2 rounded-lg border border-[#D9D5CC] bg-white " +
  "px-3 py-2 min-h-[40px] text-[13px] font-medium text-[#3D4654] " +
  "hover:border-[#A8B0BC] transition-colors " +
  "disabled:opacity-45 disabled:cursor-not-allowed max-sm:w-full max-sm:justify-start";

// The camera is offered only where one exists. A desktop webcam is not how
// anyone photographs a scam text they were sent, and the picker it opens is a
// dead end. Feature-detecting the pointer beats sniffing the user agent.
const CAMERA_QUERY = "(hover: none) and (pointer: coarse)";

function subscribeCamera(cb: () => void) {
  const mq = window.matchMedia(CAMERA_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useHasCamera() {
  // useSyncExternalStore is the right primitive for a media query: it reads on
  // every render without a state-in-effect round trip, and its server snapshot
  // (false) means the camera button is absent from the SSR markup rather than
  // flashing in and out on hydration.
  return useSyncExternalStore(
    subscribeCamera,
    () => window.matchMedia(CAMERA_QUERY).matches,
    () => false,
  );
}

// The image pipeline's real stages, in the order the code runs them.
const STAGES = ["qr", "ocr-local", "ocr-server"] as const;
const STAGE_LABEL = {
  "qr": "check.stage.qr",
  "ocr-local": "check.stage.ocrLocal",
  "ocr-server": "check.stage.ocrServer",
} as const satisfies Record<(typeof STAGES)[number], MessageKey>;

// Status-dot colour per verdict for the neutral breakdown rows. VERDICT_RANK,
// defangValue and defangFlag now live in lib/verdictSummary so the email reply
// shares the exact same rules — see that module.
const STATUS_DOT: Record<Verdict, string> = {
  safe:        "bg-green-500",
  unknown:     "bg-gray-500",
  suspicious:  "bg-yellow-500",
  likely_scam: "bg-red-500",
};

// kind → ScamType for prefilling the report form.
function kindToType(kind: AnalyzedIdentifier["kind"], content: string): ScamType {
  if (kind === "url" || kind === "email" || kind === "phone") return kind;
  return detectType(content);
}

interface CheckFlowProps {
  /**
   * Pre-seeds the check box. Used by the share target (app/share/page.tsx) so
   * content arriving from the OS share sheet lands in the same box a person
   * would have pasted into — nothing about the check itself differs.
   *
   * Only an initial value: the box stays fully editable, and this is not a
   * controlled prop, so later renders do not clobber what the user has typed.
   */
  initialContent?: string;
  /**
   * Which product surface this flow is running on, recorded with the check so
   * share-sheet volume is distinguishable from ordinary web use. Analysis is
   * identical either way — this is attribution only, never behaviour.
   */
  surface?: "web" | "share";
}

export default function CheckFlow({ initialContent = "", surface = "web" }: CheckFlowProps = {}) {
  const { t } = useLang();
  const { reportFailure } = useBugReport();
  const [step, setStep] = useState<Step>("input");
  const [content, setContent] = useState(initialContent);
  const [results, setResults] = useState<AnalyzedIdentifier[]>([]);
  // Region the server used for the last check. Null until a check has run.
  const [region, setRegion] = useState<string | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  // Which stage the image pipeline is actually in. These map 1:1 onto the
  // branches in handleImageUpload — there is no stage here that the code does
  // not really pass through, and the paste path deliberately has none because
  // it is a single request.
  const [stage, setStage] = useState<null | "qr" | "ocr-local" | "ocr-server">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // Forward-address copy confirmation. Copying is the one part of forwarding the
  // web can actually do for someone — the forward itself happens in their mail
  // app, which no page can reach into.
  const [dragOver, setDragOver] = useState(false);
  // Full email-source analysis (unwrap → headers → identity flags → tracking),
  // populated in runCheck. null until a check runs. Everything the result page
  // needs (pixel report, tracking findings, sender headers/flags) is derived
  // from this single source of truth.
  const [emailAnalysis, setEmailAnalysis] = useState<EmailSourceAnalysis | null>(null);
  // The sender card shows only when the content actually parsed as email (a real
  // From address). The tracking section can show without one.
  const hasSender = !!emailAnalysis?.headers.fromAddress;
  const pixelReport =
    emailAnalysis?.tracking.pixelReport.hasTrackingPixels ? emailAnalysis.tracking.pixelReport : null;
  const trackingReport = emailAnalysis?.tracking ?? null;

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
      setStage("qr");
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

      // OCR on-device first: the image never leaves the machine, and it costs
      // us nothing. /api/ocr is the fallback for browsers that can't run the
      // WASM core, or when the local attempt fails outright.
      let cleaned: string | null = null;
      if (canRunClientOcr()) {
        setStage("ocr-local");
        try {
          const { recogniseImageText } = await import("@/lib/clientOcr");
          cleaned = await recogniseImageText(file);
        } catch (err) {
          // Local OCR unavailable or broken for this image — fall through to
          // the server rather than failing the upload.
          console.warn("[Upload] client OCR failed, falling back to server:", err);
          reportFailure("upload", err);
        }
      }

      if (cleaned === null) {
        setStage("ocr-server");
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
        cleaned = (data.text ?? "").trim();
      }

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
      setStage(null);
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

  // Drag-and-drop onto the textarea: an image goes through the QR/OCR pipeline,
  // anything else (a .eml, .txt, or raw source) is read as email text. Routing
  // by MIME type keeps a dropped screenshot from being read as garbled text.
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) handleImageUpload(file);
    else handleEmlUpload(file);
  }

  // `overrideRegion` re-runs the same content against a region the user picked,
  // correcting a wrong geo guess. Omitted on the first check so the server
  // resolves from geo headers.
  async function runCheck(overrideRegion?: string) {
    if (!content.trim()) return;
    setCheckLoading(true);
    setCheckError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(overrideRegion ? { region: overrideRegion } : {}),
          ...(surface !== "web" ? { surface } : {}),
        }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json() as { results: AnalyzedIdentifier[]; region?: string };
      setResults(data.results ?? []);
      // Remember which pack actually ran, so the coverage notice reflects the
      // server's decision rather than being re-derived on the client.
      setRegion(data.region ?? null);
      // Run the shared email-source analysis — unwraps a forwarded email to the
      // original first, so tracking and sender analysis cover the scammer's
      // message, not the forwarder's. Same path as ReportForm and /api/inbound.
      setEmailAnalysis(analyseEmailSource(content));
      setShareCopied(false);
      if (!overrideRegion) goForward("result");
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
  const hasCamera = useHasCamera();

  // ── Report step ─────────────────────────────────────────────────────────────
  if (step === "report") {
    const ids = extractIdentifiers(content);
    // Prefer the unwrapped headers from the shared analysis so a forwarded email
    // prefills the original scammer's From/Reply-To, not the forwarder's.
    const headers = emailAnalysis?.headers ?? parseEmailHeaders(content);
    // For email source, distil the raw forward down to the legible scam content
    // (meaningful headers + decoded body) before prefilling the form — the user
    // shouldn't see, or be asked to submit, the transport/auth header storm,
    // MIME boundaries, or their own mailbox/relay headers. Non-email content
    // (URL/QR/text) is shown as-is. The server distils/scrubs again on submit;
    // this keeps the displayed content honest and matches what gets stored.
    const reportContent = headers.fromAddress
      ? distillEmailContent(content)
      : content;
    const primary = results[0];
    return (
      <div className="bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl overflow-hidden">
        <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.report")}</h2>
        <button
          onClick={() => history.back()}
          className="flex items-center gap-1.5 w-full px-6 py-3.5 border-b border-[var(--rule)] text-sm font-semibold text-gray-300 hover:text-emerald-400 transition-colors"
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
            initialContent={reportContent}
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
      <div className="bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl overflow-hidden">
        <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.result")}</h2>
        <button
          onClick={() => history.back()}
          className="flex items-center gap-1.5 w-full px-6 py-3.5 border-b border-[var(--rule)] text-sm font-semibold text-gray-300 hover:text-emerald-400 transition-colors"
        >
          <span aria-hidden="true">‹</span> {t("check.back.edit")}
        </button>
        <div className="p-6 space-y-4">
          {results.length === 0 ? (
            // Email source can parse to a sender analysis even when there are no
            // URL/phone/email identifiers to score — in that case the analysis
            // card below carries the payoff, so don't claim there's nothing.
            !hasSender && !trackingReport?.hasTracking && <p className="text-sm text-gray-400">{t("check.nothing")}</p>
          ) : (() => {
            // One overall verdict drives the page — composeVerdict applies the
            // worst-identifier-wins + tracking-pixel-nudge rules, shared with
            // the forward-to-us email reply so the two can't drift.
            const composed = composeVerdict(results, pixelReport)!;
            const worst = results.reduce((acc, r) =>
              VERDICT_RANK[r.result.verdict] > VERDICT_RANK[acc.result.verdict] ? r : acc,
            );
            const overall = { ...worst.result, ...composed };

            return (
              <>
                {/* Coverage honesty — sits above the verdict so it frames how the
                    result should be read, rather than being a footnote to it. */}
                <CoverageNotice
                  coverage={overallCoverage(results)}
                  region={region}
                  onRegionChange={(code) => runCheck(code)}
                />

                {/* Single coloured verdict card — the only full-colour element. */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t("verdict.overall.heading")}
                  </div>
                  <VerdictBadge result={overall} />
                </div>

                {/* Neutral breakdown — every identifier as a quiet row with a
                    small status dot. No competing card colours. */}
                <div className="space-y-2 border-t border-[var(--rule)] pt-4">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t("verdict.breakdown.heading")}
                  </div>
                  <ul className="space-y-1.5">
                    {results.map((r, i) => {
                      const meta = KIND_META[r.kind];
                      return (
                        <li key={`${r.kind}-${i}`} className="flex items-center gap-2.5 text-sm">
                          <span className={`shrink-0 w-2 h-2 rounded-full ${STATUS_DOT[r.result.verdict]}`} aria-hidden="true" />
                          <span aria-hidden="true">{meta.icon}</span>
                          {r.value && r.kind !== "message" ? (
                            <span className="font-mono text-gray-400 break-all min-w-0 flex-1">{defangValue(r.kind, r.value)}</span>
                          ) : (
                            <span className="text-gray-400 flex-1">{t(meta.labelKey)}</span>
                          )}
                          <span className="shrink-0 text-gray-300 font-medium">{t(`verdict.${r.result.verdict}.status` as MessageKey)}</span>
                        </li>
                      );
                    })}
                    {pixelReport && (
                      <li className="flex items-center gap-2.5 text-sm">
                        <span className={`shrink-0 w-2 h-2 rounded-full ${STATUS_DOT.suspicious}`} aria-hidden="true" />
                        <span className="text-gray-400 flex-1">{t("verdict.breakdown.pixel")}</span>
                        <span className="shrink-0 text-gray-300 font-medium">{pixelReport.pixels.length}</span>
                      </li>
                    )}
                  </ul>
                  {pixelReport && (
                    <div className="text-xs text-gray-500 space-y-1 pl-[18px]">
                      {pixelReport.pixels.flatMap((p) => p.notes).map((note, i) => (
                        <p key={i}>• {note}</p>
                      ))}
                    </div>
                  )}
                  {/* Direct line to each identified platform's abuse channel —
                      reporting the sender here can shut the scammer's account down. */}
                  {pixelReport && pixelReport.espReports.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-[18px] pt-0.5">
                      {pixelReport.espReports.map((r) => (
                        <a
                          key={r.esp}
                          href={r.href}
                          {...(r.kind === "url" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-[var(--caution)] hover:bg-amber-900/40 hover:text-amber-200 transition-colors"
                        >
                          <span aria-hidden="true">🚩</span>
                          {t("verdict.breakdown.reportEsp", { esp: r.esp })}
                          {r.kind === "url" && (
                            <>
                              <span className="sr-only"> ({t("a11y.newTab")})</span>
                              <span aria-hidden="true">↗</span>
                            </>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Broader tracking surface — pixels plus click redirects, CSS
              beacons, read-receipt headers, meta refresh, etc. Sibling of the
              breakdown so it renders even for a header-only email with no scored
              identifiers. Shown when we found tracking, OR (as reassurance) when
              this was email source that came up clean. Findings carry their own
              copy; the values they surface are already non-clickable text. */}
          {trackingReport && (trackingReport.hasTracking || hasSender) && (
            <div className="space-y-2 border-t border-[var(--rule)] pt-4">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t("tracking.heading")}
              </div>
              {trackingReport.findings.length > 0 ? (
                <>
                  <ul className="space-y-1.5">
                    {trackingReport.findings.map((f) => (
                      <li key={f.kind} className="flex items-start gap-2.5 text-sm">
                        <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${STATUS_DOT.suspicious}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="text-gray-300 font-medium">{f.label}</span>
                          {f.count > 1 && <span className="text-gray-500"> ×{f.count}</span>}
                          <span className="block text-xs text-gray-500">{f.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-emerald-400/90 pl-[18px]">{t("tracking.safe")}</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">{t("tracking.none")}</p>
              )}
            </div>
          )}

          {/* Email sender analysis — only when the pasted content parsed as
              email source. Surfaces the display-name/Reply-To/auth picture that
              previously lived only inside the report form. All addresses and
              domains are defanged before display. */}
          {hasSender && emailAnalysis && (() => {
            const { headers, identityFlags: flags } = emailAnalysis;
            const authSummary = summariseAuth(headers);
            return (
              <div className="space-y-2 border-t border-[var(--rule)] pt-4">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {t("email.analysis.heading")}
                </div>
                <dl className="space-y-1 text-sm">
                  {headers.fromAddress && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-gray-500">{t("email.analysis.from")}</dt>
                      <dd className="font-mono text-gray-400 break-all min-w-0">{defangEmail(headers.fromAddress)}</dd>
                    </div>
                  )}
                  {headers.replyTo && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-gray-500">{t("email.analysis.replyTo")}</dt>
                      <dd className="font-mono text-gray-400 break-all min-w-0">{defangEmail(headers.replyTo)}</dd>
                    </div>
                  )}
                  {authSummary && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-gray-500">{t("email.analysis.auth")}</dt>
                      <dd className="font-mono text-gray-400 break-all min-w-0">{authSummary}</dd>
                    </div>
                  )}
                </dl>
                {flags.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {flags.map((flag, i) => (
                      <li key={i} className="flex gap-2 text-sm text-amber-300/90">
                        <span aria-hidden="true" className="shrink-0">⚠</span>
                        <span className="min-w-0">{defangFlag(flag)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 pt-1">{t("email.analysis.clean")}</p>
                )}
              </div>
            );
          })()}

          {(() => {
            // "Clean" means nothing flagged it — every identifier safe, no
            // tracking pixel, and no sender-spoofing flags. A pixel or a flag
            // pushes the verdict up, so the CTA matches that (the stronger
            // "report", not the softer "report anyway").
            const clean = isClean(results, pixelReport, emailAnalysis?.identityFlags ?? []);
            return (
              <button
                onClick={() => goForward("report")}
                className={`w-full py-3 px-6 font-bold rounded-lg transition-colors text-sm uppercase tracking-wide flex items-center justify-center gap-2 ${
                  clean
                    ? "bg-[var(--ink-3)] hover:bg-gray-700 text-gray-300 border border-[var(--rule)]"
                    : "bg-red-800 hover:bg-red-700 text-white"
                }`}
              >
                {clean ? t("check.reportAnyway") : t("check.report")}
              </button>
            );
          })()}

          {results.length > 0 && (
            <button
              onClick={shareResults}
              className="w-full py-2.5 px-6 font-semibold rounded-lg transition-colors text-sm text-gray-300 bg-[var(--ink-3)] hover:bg-gray-700 border border-[var(--rule)] flex items-center justify-center gap-2"
            >
              {shareCopied ? t("check.shareCopied") : t("check.share")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Input step ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.input")}</h2>

      {/* Hidden file inputs */}
      <input ref={imageRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={emlRef} type="file" accept=".eml,message/rfc822,text/plain" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmlUpload(f); }} />

      {/* The check card is deliberately light on a dark page: it reads as paper,
          the thing you put a message onto. Pasting is the primary action, so the
          textarea leads and the capture options sit in the footer beside the
          submit — the old arrangement put three bordered cards above the box and
          an "or paste below" divider under them, which made paste the fallback. */}
      <div
        className={`bg-[var(--paper)] text-[var(--ink)] rounded-2xl overflow-hidden relative shadow-[0_18px_44px_-20px_rgba(0,0,0,0.6)] transition-shadow ${
          dragOver ? "ring-2 ring-[var(--clear)]" : ""
        }`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={handleDrop}
      >
        {/* Names the surface and states the privacy claim at the point of input,
            which is where the question is actually being asked. */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--paper-dim)]">
          <span className="font-[family-name:var(--font-mono-ui)] text-[11px] font-medium tracking-[0.09em] uppercase text-[#5D6675]">
            {t("check.contentLabel")}
          </span>
          <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono-ui)] text-[11px] font-semibold tracking-[0.03em] text-[#00805B]">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--clear)] shrink-0" />
            {t("check.onDevice")}
          </span>
        </div>

        <label htmlFor="check-content" className="sr-only">{t("check.contentLabel")}</label>
        <textarea
          id="check-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("check.placeholder")}
          rows={4}
          className="w-full min-h-[118px] px-4 py-4 bg-transparent text-[var(--ink)] placeholder-[#8A93A1] border-0 resize-y text-base leading-relaxed focus:outline-none block"
        />

        {/* Capture options and the submit share one bar: they are all ways to
            start the same check, and the chips are secondary to pasting. */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--paper-dim)] bg-[#F5F3EE]">
          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            disabled={busy}
            aria-busy={uploadLoading}
            className={CAPTURE_OPTION}
          >
            <span className="shrink-0">{uploadLoading ? <SpinnerIcon /> : <ImageIcon />}</span>
            {t("check.uploadImage")}
          </button>

          {hasCamera && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className={CAPTURE_OPTION}
            >
              <span className="shrink-0"><CameraIcon /></span>
              {t("check.takePhoto")}
            </button>
          )}

          <button
            type="button"
            onClick={() => emlRef.current?.click()}
            disabled={busy}
            className={CAPTURE_OPTION}
          >
            <span className="shrink-0"><EmailFileIcon /></span>
            {t("check.uploadEml")}
          </button>

          <button
            onClick={() => runCheck()}
            disabled={checkLoading || !content.trim()}
            aria-busy={checkLoading}
            className={`ml-auto max-sm:w-full max-sm:ml-0 inline-flex items-center justify-center gap-2.5 rounded-[9px] px-5 py-2.5 font-semibold text-[15px] transition-colors ${
              checkLoading
                ? "bg-[#00825C] text-[#EAF7F2] cursor-progress"
                : "bg-[var(--ink)] text-white hover:bg-[#232F42] disabled:opacity-60 disabled:cursor-not-allowed"
            }`}
          >
            {checkLoading && (
              <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
            )}
            {checkLoading ? t("check.analysing") : t("check.submit")}
          </button>
        </div>

        {dragOver && (
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center bg-[rgba(0,166,118,0.13)] backdrop-blur-[2px] pointer-events-none font-[family-name:var(--font-mono-ui)] text-[13px] tracking-[0.06em] uppercase font-semibold text-[#00674A]"
          >
            {t("check.dropHere")}
          </div>
        )}
      </div>

      {/* Paste guidance for users who aren't sure how to copy on mobile */}
      {!content && (
        <p className="text-xs text-[var(--faint)] px-0.5">
          {t("check.pasteHint")}{" "}
          <span className="hidden sm:inline">{t("check.dropHint")}</span>
        </p>
      )}

      {/* Quiet pointer to the full capture guide on Learn — replaces the inline
          expandables that crowded this flow. */}
      <p className="text-xs text-gray-500 text-center">
        <Link href="/learn#using-this-tool" className="text-emerald-400/90 hover:text-emerald-300 underline underline-offset-2">
          {t("check.help.link")}
        </Link>
      </p>

      {/* What the image pipeline is actually doing, stage by stage. Each row
          maps onto a real branch in handleImageUpload — nothing here is a
          decorative step. OCR can take up to a minute on a cold start, so
          naming the current stage stops a long wait reading as a hang.

          The paste path deliberately has no stage list: it is a single request
          to /api/check, and inventing steps for it would misrepresent the work. */}
      {uploadLoading && stage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] overflow-hidden"
        >
          <ul className="py-1.5">
            {STAGES.map((sKey) => {
              const idx = STAGES.indexOf(sKey);
              const cur = STAGES.indexOf(stage);
              // The two OCR stages are alternatives, not a sequence: only the
              // one actually taken is shown.
              if (sKey === "ocr-local" && stage === "ocr-server") return null;
              if (sKey === "ocr-server" && stage !== "ocr-server") return null;
              const state = idx < cur ? "done" : idx === cur ? "active" : "wait";
              return (
                <li
                  key={sKey}
                  className={`grid grid-cols-[20px_1fr] gap-3 items-center px-4 py-2 text-sm ${
                    state === "active"
                      ? "text-[var(--foreground)] font-medium"
                      : state === "done"
                        ? "text-[var(--text-dim)]"
                        : "text-[var(--faint)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-full border-[1.5px] grid place-items-center ${
                      state === "active"
                        ? "border-[var(--clear)] border-t-transparent animate-spin"
                        : state === "done"
                          ? "border-[var(--clear)] bg-[var(--clear)]/20"
                          : "border-[var(--ink-3)]"
                    }`}
                  />
                  <span>{t(STAGE_LABEL[sKey])}</span>
                </li>
              );
            })}
          </ul>
          {/* Where the work is happening. The local and server paths make
              materially different privacy promises, so the line changes. */}
          <p className="px-4 py-2.5 border-t border-[var(--rule)] text-xs text-[var(--faint)] bg-black/15">
            {t(stage === "ocr-server" ? "check.stage.uploaded" : "check.stage.onDevice")}
          </p>
        </div>
      )}

      {uploadError && <p className="text-sm text-red-400" role="alert">{uploadError}</p>}

      {checkError && (
        <div role="alert" className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {checkError}
        </div>
      )}

      {/* Forward-to-us. Deliberately below the submit button and visually set
          apart, because it is not another way to fill in the box above — it is a
          different route entirely: you act in your MAIL APP, not on this page,
          and the verdict comes back by email rather than appearing here.
          Grouping it with the upload options implied an equivalence that misled.

          There is no mailto here on purpose. A mailto opens a blank compose
          window, but forwarding is an action taken on a message the user already
          has in their mailbox — no web API can reach in and do that. A button
          promising "Forward" that opens an empty email is worse than no button,
          so we do the one thing the page genuinely can (copy the address) and
          state plainly where the rest happens. */}
    </div>
  );
}
