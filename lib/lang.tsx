"use client";

import { createContext, useContext, useState } from "react";

export type LangMode = "normal" | "aussie";
const STORAGE_KEY = "jcm_lang";

interface LangCtx { mode: LangMode; toggle: () => void; }
const LangContext = createContext<LangCtx>({ mode: "normal", toggle: () => {} });

function savedMode(): LangMode {
  if (typeof window === "undefined") return "normal";
  return localStorage.getItem(STORAGE_KEY) === "aussie" ? "aussie" : "normal";
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<LangMode>(savedMode);

  function toggle() {
    setMode((m) => {
      const next = m === "normal" ? "aussie" : "normal";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return <LangContext.Provider value={{ mode, toggle }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { mode, toggle } = useContext(LangContext);
  function t(normal: string, aussie: string) { return mode === "aussie" ? aussie : normal; }
  return { mode, toggle, t };
}
