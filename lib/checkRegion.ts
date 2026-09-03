// Explicit check-region choice, persisted on this device.
//
// The server resolves a region per request (explicit body field wins over the
// geo header, which wins over the default). This module owns the client side
// of the explicit choice: what "auto" means (null = send nothing, let the
// server decide), how it survives a reload, and what counts as valid.
//
// Stored as the bare region code ("AU", "GB", …) or absent for auto. A stored
// value from a region we no longer support degrades to auto rather than
// pinning the user to a dead option.

import { supportedRegions } from "@justcheckingmate/engine/regions";

export const CHECK_REGION_STORAGE_KEY = "jcm_region";

/** Null = auto (no explicit choice). Anything else must be a supported code. */
export function normaliseCheckRegion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  return (supportedRegions() as string[]).includes(code) ? code : null;
}

export function readStoredCheckRegion(): string | null {
  if (typeof window === "undefined" || !("localStorage" in window)) return null;
  try {
    return normaliseCheckRegion(window.localStorage.getItem(CHECK_REGION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredCheckRegion(code: string | null): void {
  if (typeof window === "undefined" || !("localStorage" in window)) return;
  try {
    const next = normaliseCheckRegion(code);
    if (next) window.localStorage.setItem(CHECK_REGION_STORAGE_KEY, next);
    else window.localStorage.removeItem(CHECK_REGION_STORAGE_KEY);
  } catch {
    // Storage full or blocked — the check still runs, just without persistence.
  }
}
