// Pure i18n core: message dictionaries + lookup. No React, so it can be unit
// tested and imported anywhere. The React provider/hook live in lib/lang.tsx.
//
// Two independent axes, deliberately kept apart:
//   locale — the language ("en", later "fr", ...). Decides which words.
//   tone   — the register ("normal" | "regional"). Decides how they're said.
// "aussie" used to be modelled as a locale, which it never was: it is English
// in a regional register. Splitting the axes means a future non-English locale
// doesn't have to choose between being a language or being a voice.

import enNormalMessages from "@/messages/en.normal.json";
import enRegionalMessages from "@/messages/en.regional.json";

export type Locale = "en";
export type Tone = "normal" | "regional";

export interface LangMode {
  locale: Locale;
  tone: Tone;
}

export const BASE_LOCALE: Locale = "en";
export const BASE_TONE: Tone = "normal";
export const DEFAULT_MODE: LangMode = { locale: BASE_LOCALE, tone: BASE_TONE };

// en.normal.json is the base bundle; every key must exist there.
export type MessageKey = keyof typeof enNormalMessages;

type Dict = Partial<Record<MessageKey, string>>;

// Indexed locale-first, then tone. A locale that ships no regional register
// simply omits the entry and falls through to its own normal tone.
const DICTS: Record<Locale, Partial<Record<Tone, Dict>>> = {
  en: {
    normal: enNormalMessages,
    regional: enRegionalMessages,
  },
};

function lookup(mode: LangMode, key: MessageKey): string | undefined {
  const byLocale = DICTS[mode.locale];
  return (
    // exact locale + tone
    byLocale?.[mode.tone]?.[key] ??
    // same locale, base tone — a regional bundle only overrides some keys
    byLocale?.[BASE_TONE]?.[key] ??
    // base locale, base tone — the guaranteed-complete bundle
    DICTS[BASE_LOCALE][BASE_TONE]?.[key]
  );
}

// Active locale+tone → locale base tone → base locale → the raw key, then
// interpolate {placeholder} tokens from `vars`.
export function translate(
  mode: LangMode,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let str: string = lookup(mode, key) ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return str;
}

const LOCALES: readonly Locale[] = ["en"];
const TONES: readonly Tone[] = ["normal", "regional"];

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

function isTone(v: unknown): v is Tone {
  return typeof v === "string" && (TONES as readonly string[]).includes(v);
}

// Serialised as "locale:tone" for storage. Kept here (not in lang.tsx) so the
// round-trip is unit-testable without React.
export function serialiseMode(mode: LangMode): string {
  return `${mode.locale}:${mode.tone}`;
}

// Tolerant of anything: unknown values, and the pre-split "normal"/"aussie"
// strings still sitting in returning users' localStorage. An unreadable value
// degrades to the default rather than throwing.
export function parseMode(raw: string | null | undefined): LangMode {
  if (!raw) return DEFAULT_MODE;

  // Legacy single-axis values written before the locale/tone split.
  if (raw === "aussie") return { locale: "en", tone: "regional" };
  if (raw === "normal") return DEFAULT_MODE;

  const [locale, tone] = raw.split(":");
  return {
    locale: isLocale(locale) ? locale : BASE_LOCALE,
    tone: isTone(tone) ? tone : BASE_TONE,
  };
}
