"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  translate,
  parseMode,
  serialiseMode,
  DEFAULT_MODE,
  type LangMode,
  type Locale,
  type Tone,
  type MessageKey,
} from "@/lib/i18n";

export type { LangMode, Locale, Tone, MessageKey } from "@/lib/i18n";

const STORAGE_KEY = "jcm_lang";

interface LangCtx {
  mode: LangMode;
  toggle: () => void;
  select: (mode: LangMode) => void;
  setLocale: (locale: Locale) => void;
  setTone: (tone: Tone) => void;
}

const NOOP_CTX: LangCtx = {
  mode: DEFAULT_MODE,
  toggle: () => {},
  select: () => {},
  setLocale: () => {},
  setTone: () => {},
};

const LangContext = createContext<LangCtx>(NOOP_CTX);

// Back the language preference with localStorage exposed as an external store.
// useSyncExternalStore renders the server snapshot (the default mode) on the
// server and during the client's first (hydration) render, then switches to the
// real stored value — so there's no hydration mismatch and no setState-in-effect.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb); // keep tabs in sync
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// useSyncExternalStore compares snapshots by identity, so parsing on every call
// would return a fresh object each time and spin. Cache against the raw string
// and only rebuild when storage actually changes.
let cachedRaw: string | null = null;
let cachedMode: LangMode = DEFAULT_MODE;

function getSnapshot(): LangMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedMode = parseMode(raw);
  }
  return cachedMode;
}

function getServerSnapshot(): LangMode {
  return DEFAULT_MODE;
}

function setMode(next: LangMode): void {
  localStorage.setItem(STORAGE_KEY, serialiseMode(next));
  listeners.forEach((l) => l());
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const select = useCallback((next: LangMode) => setMode(next), []);

  // Flips tone only — the historical toggle behaviour, now honestly named as
  // the tone axis rather than a language switch.
  const toggle = useCallback(() => {
    const current = getSnapshot();
    setMode({ ...current, tone: current.tone === "normal" ? "regional" : "normal" });
  }, []);

  const setLocale = useCallback((locale: Locale) => {
    setMode({ ...getSnapshot(), locale });
  }, []);

  const setTone = useCallback((tone: Tone) => {
    setMode({ ...getSnapshot(), tone });
  }, []);

  const value = useMemo(
    () => ({ mode, toggle, select, setLocale, setTone }),
    [mode, toggle, select, setLocale, setTone],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { mode, toggle, select, setLocale, setTone } = useContext(LangContext);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(mode, key, vars),
    [mode],
  );
  return { mode, toggle, select, setLocale, setTone, t };
}
