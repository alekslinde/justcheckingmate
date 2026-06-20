"use client";

import { useLang } from "@/lib/lang";

export default function LangToggle() {
  const { mode, toggle } = useLang();

  // Label shows what you'll GET after clicking, not the current state.
  // Standard toggle convention: button describes the destination.
  const label = mode === "normal" ? "Aussie mode" : "Standard mode";
  // Short text affordance for small screens where the label is hidden.
  const shortLabel = mode === "normal" ? "AU" : "EN";
  const title = mode === "normal"
    ? "Switch to Aussie-friendly language"
    : "Switch to standard language";

  return (
    <button
      onClick={toggle}
      title={title}
      aria-label={title}
      className="min-h-[44px] flex items-center gap-1.5 px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
    >
      <span className="sm:hidden font-semibold">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
