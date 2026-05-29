"use client";

import { useLang } from "@/lib/lang";

export default function LangToggle() {
  const { mode, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      title={mode === "normal" ? "Switch to Aussie mode" : "Switch to standard mode"}
      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-emerald-400 transition-colors"
    >
      <span aria-hidden="true">{mode === "aussie" ? "🦘" : "🌐"}</span>
      <span>{mode === "aussie" ? "Aussie" : "Normal"}</span>
    </button>
  );
}
