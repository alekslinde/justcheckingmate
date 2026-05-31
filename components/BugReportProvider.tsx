"use client";

// Bug-reporting context + UI.
//
// Two entry points:
//   • openManual()  — user taps the floating "Report a bug" button.
//   • reportFailure(action, error) — a common action (upload/check/report) threw,
//     so we surface a prompt offering to send diagnostics.
//
// Consent model: a failure NEVER auto-sends anything. We collect the diagnostics
// locally and show them in a dialog; nothing leaves the device until the user
// reviews them and taps "Send report". The scam content and any uploaded files
// are deliberately excluded from what we collect.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/lang";
import type { BugAction } from "@/lib/bugStore";

interface BugReportCtx {
  reportFailure: (action: BugAction, error?: unknown) => void;
  openManual: () => void;
}

const noop = () => {};
const Ctx = createContext<BugReportCtx>({ reportFailure: noop, openManual: noop });

export function useBugReport(): BugReportCtx {
  return useContext(Ctx);
}

function errorToText(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || e.name;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

const ACTION_LABEL: Record<BugAction, string> = {
  upload: "Uploading an image or .eml",
  check: "Checking for scams",
  report: "Submitting a report",
  manual: "General feedback",
};

interface Diagnostics {
  action: BugAction;
  error: string;
}

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const [diag, setDiag] = useState<Diagnostics>({ action: "manual", error: "" });
  // Bumped each time a report is opened. Used as the modal's key so a new
  // report (e.g. a failure firing while the modal is already open, even on its
  // "sent" screen) remounts the modal with fresh inputs rather than stranding
  // the user on stale state.
  const [session, setSession] = useState(0);

  const reportFailure = useCallback((action: BugAction, error?: unknown) => {
    setDiag({ action, error: errorToText(error) });
    setAuto(true);
    setOpen(true);
    setSession((n) => n + 1);
  }, []);

  const openManual = useCallback(() => {
    setDiag({ action: "manual", error: "" });
    setAuto(false);
    setOpen(true);
    setSession((n) => n + 1);
  }, []);

  // reportFailure/openManual are stable, so this value never changes identity —
  // consumers don't re-render when the modal opens/closes.
  const ctx = useMemo(() => ({ reportFailure, openManual }), [reportFailure, openManual]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <button
        type="button"
        onClick={openManual}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900/90 px-3 py-2 text-xs text-gray-300 shadow-lg backdrop-blur hover:border-emerald-500 hover:text-emerald-400 transition-colors"
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">🐞</span>
        <span className="hidden sm:inline">Report a bug</span>
      </button>
      {open && (
        <BugModal key={session} diag={diag} auto={auto} onClose={() => setOpen(false)} />
      )}
    </Ctx.Provider>
  );
}

type Status = "idle" | "sending" | "sent" | "error";

function collectEnv() {
  if (typeof window === "undefined") {
    return { path: "", userAgent: "", viewport: "", language: "" };
  }
  return {
    // pathname only — query strings are never used to carry user content here,
    // but we exclude them anyway to be safe.
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    language: navigator.language,
  };
}

function BugModal({
  diag,
  auto,
  onClose,
}: {
  diag: Diagnostics;
  auto: boolean;
  onClose: () => void;
}) {
  const { mode } = useLang();
  const [env] = useState(collectEnv);
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [bugId, setBugId] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "sending") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  async function send() {
    setStatus("sending");
    try {
      const res = await fetch("/api/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: diag.action,
          error: diag.error,
          description,
          contact,
          path: env.path,
          userAgent: env.userAgent,
          viewport: env.viewport,
          language: mode === "aussie" ? `${env.language} (aussie)` : env.language,
          hp,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBugId(data.bugId ?? null);
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={() => status !== "sending" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4"
      >
        {status === "sent" ? (
          <div className="space-y-4 text-center py-2">
            <div className="text-4xl" aria-hidden="true">🙏</div>
            <h2 id="bug-modal-title" className="text-lg font-bold text-emerald-400">
              Thanks — that helps us improve
            </h2>
            <p className="text-sm text-gray-300">
              Your report has been logged. Every one helps us make Just Checking, Mate more reliable.
            </p>
            {bugId && (
              <div className="inline-block rounded-lg border border-gray-800 bg-gray-950 px-4 py-2">
                <div className="text-xs text-gray-400">Reference</div>
                <div className="font-mono font-bold text-emerald-400">{bugId}</div>
              </div>
            )}
            <div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="bug-modal-title" className="text-lg font-bold text-gray-100">
                  {auto ? "Something went wrong" : "Report a bug"}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {auto
                    ? "We hit a problem. With your permission we'll send the details below so we can fix it."
                    : "Tell us what's not working. We'll include the details below to help us track it down."}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={status === "sending"}
                aria-label="Close"
                className="shrink-0 text-gray-500 hover:text-gray-300 text-xl leading-none disabled:opacity-40"
              >
                ×
              </button>
            </div>

            {/* Honeypot */}
            <div className="absolute -left-[9999px] top-0" aria-hidden="true">
              <label htmlFor="bug-website">Website (leave blank)</label>
              <input
                id="bug-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="bug-description" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                What happened? <span className="normal-case font-normal text-gray-500">(optional)</span>
              </label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g. I tried to upload a screenshot and it just spun forever."
                rows={3}
                maxLength={1000}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 resize-y"
              />
            </div>

            <div>
              <label htmlFor="bug-contact" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Your email <span className="normal-case font-normal text-gray-500">(optional — only if you want a reply)</span>
              </label>
              <input
                id="bug-contact"
                type="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="you@example.com.au"
                maxLength={200}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* The exact diagnostics that will be sent — shown in full so consent
                is informed. */}
            <details className="rounded-lg border border-gray-800 bg-gray-950" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Details we&apos;ll include
              </summary>
              <dl className="px-3 pb-3 space-y-1.5 text-xs">
                <Row label="Action" value={ACTION_LABEL[diag.action]} />
                {diag.error && <Row label="Error" value={diag.error} mono />}
                <Row label="Page" value={env.path} mono />
                <Row label="Screen" value={env.viewport} mono />
                <Row label="Browser" value={env.userAgent} mono />
              </dl>
            </details>

            <p className="text-xs text-gray-500">
              🔒 We never include the scam content you pasted or uploaded, or any files — only the details shown above.
            </p>

            {status === "error" && (
              <div role="alert" className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
                Couldn&apos;t send that just now. Give it another crack in a moment.
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={status === "sending"}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-40"
              >
                Not now
              </button>
              <button
                onClick={send}
                disabled={status === "sending"}
                aria-busy={status === "sending"}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:bg-gray-700 disabled:text-gray-400"
              >
                {status === "sending" ? "Sending…" : "Send report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 w-16 text-gray-500">{label}</dt>
      <dd className={`min-w-0 break-words text-gray-300 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
