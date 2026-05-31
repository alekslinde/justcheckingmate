"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { translate, type LangMode, type MessageKey } from "@/lib/i18n";

export type { LangMode, MessageKey } from "@/lib/i18n";

const STORAGE_KEY = "jcm_lang";

interface LangCtx { mode: LangMode; toggle: () => void; }
const LangContext = createContext<LangCtx>({ mode: "normal", toggle: () => {} });

// Back the language preference with localStorage exposed as an external store.
// useSyncExternalStore renders the server snapshot ("normal") on the server and
// during the client's first (hydration) render, then switches to the real
// stored value — so there's no hydration mismatch and no setState-in-effect.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb); // keep tabs in sync
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): LangMode {
  return localStorage.getItem(STORAGE_KEY) === "aussie" ? "aussie" : "normal";
}

function getServerSnapshot(): LangMode {
  return "normal";
}

function setMode(next: LangMode): void {
  localStorage.setItem(STORAGE_KEY, next);
  listeners.forEach((l) => l());
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    setMode(getSnapshot() === "normal" ? "aussie" : "normal");
  }, []);

  return <LangContext.Provider value={{ mode, toggle }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { mode, toggle } = useContext(LangContext);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(mode, key, vars),
    [mode],
  );
  return { mode, toggle, t };
}
