"use client";

import { useLang } from "@/lib/lang";
import type { CheckFeedback } from "@/lib/checkFeedback";
import { REGION_OPTIONS } from "@justcheckingmate/engine/regions";

/**
 * Explicit region choice for a scam check.
 *
 * Rendered on both the input step (decides the first check) and the result
 * step (re-runs the same content elsewhere). Null = auto: nothing is sent and
 * the server resolves from the geo header, falling back to the default.
 *
 * The recheck status lives here rather than on the coverage warning because
 * the picker is now always visible — the warning only renders under partial
 * coverage, so a re-check driven from this control used to run, and fail,
 * with nothing on screen when coverage was full.
 */
export type RecheckState = CheckFeedback["recheck"];

export default function CheckRegionPicker({
  id,
  value,
  onChange,
  disabled,
  recheck,
}: {
  id: string;
  /** Explicit choice, or null for auto. */
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  recheck?: RecheckState;
}) {
  const { t } = useLang();
  const busy = disabled || recheck?.state === "loading";
  const regionName = (code: string) =>
    REGION_OPTIONS.find((o) => o.code === code)?.name ?? code;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]"
        >
          {t("check.region.label")}
        </label>
        <select
          id={id}
          value={value ?? ""}
          disabled={busy}
          onChange={(e) => onChange(e.target.value ? e.target.value : null)}
          className="rounded-lg border border-[var(--ink-3)] bg-[var(--ink)] px-2.5 py-2 text-[13.5px] text-[var(--foreground)] cursor-pointer disabled:opacity-60 disabled:cursor-progress"
        >
          <option value="">{t("check.region.auto")}</option>
          {REGION_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-[var(--faint)]">{t("check.region.hint")}</p>
      {recheck && (
        <div role="status" aria-live="polite">
          {recheck.state === "loading" && (
            <p className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
              <span
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0 rounded-full border-[1.5px] border-[var(--caution)] border-t-transparent motion-safe:animate-spin"
              />
              {t("verdict.coverage.rechecking", { region: regionName(recheck.region) })}
            </p>
          )}
          {recheck.state === "done" && (
            <p className="text-[13px] text-[var(--text-dim)]">
              {t("verdict.coverage.recheckDone", { region: regionName(recheck.region) })}
            </p>
          )}
          {recheck.state === "error" && (
            <p role="alert" className="text-[13px] leading-relaxed text-[var(--scam-text)]">
              {t(
                recheck.kind === "rate_limited"
                  ? "verdict.coverage.recheckRateLimited"
                  : "verdict.coverage.recheckError",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
