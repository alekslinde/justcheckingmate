"use client";

import { useEffect, useRef, useState } from "react";
import { useLang, type LangMode } from "@/lib/lang";

const OPTIONS: { value: LangMode; label: string }[] = [
  { value: "normal", label: "English" },
  { value: "aussie", label: "Aussie" },
];

export default function LangToggle() {
  const { mode, select } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(next: LangMode) {
    select(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Choose language"
        aria-label="Choose language"
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-h-[44px] flex items-center justify-center px-3 text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
      >
        {/* Globe — inline stroke icon (no icon library, matches CheckFlow). */}
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Language"
          className="absolute right-0 mt-1 min-w-[10rem] py-1 rounded-lg border border-gray-700 bg-gray-900 shadow-lg z-50"
        >
          {OPTIONS.map((opt) => {
            const active = opt.value === mode;
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(opt.value)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  active ? "text-emerald-400" : "text-gray-300 hover:text-emerald-400 hover:bg-gray-800"
                }`}
              >
                <span>{opt.label}</span>
                {active && (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
