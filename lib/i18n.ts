// Pure i18n core: message dictionaries + lookup. No React, so it can be unit
// tested and imported anywhere. The React provider/hook live in lib/lang.tsx.

import normalMessages from "@/messages/normal.json";
import aussieMessages from "@/messages/aussie.json";

export type LangMode = "normal" | "aussie";

// normal.json is the base/fallback locale; every key must exist there.
export type MessageKey = keyof typeof normalMessages;

const DICTS: Record<LangMode, Partial<Record<MessageKey, string>>> = {
  normal: normalMessages,
  aussie: aussieMessages,
};

// Active locale → base locale → the raw key, then interpolate {placeholder}
// tokens from `vars`.
export function translate(
  mode: LangMode,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let str: string = DICTS[mode][key] ?? DICTS.normal[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return str;
}
