"use client";

import { useLang } from "@/lib/lang";
import { REGION_OPTIONS, type RegionCoverage } from "@justcheckingmate/engine/regions";

/**
 * What this check could and couldn't see, when the region pack that ran has
 * less than full detection coverage.
 *
 * The point is honesty about what we did and didn't check: a low score under
 * partial coverage can mean "no rule matched because no rule exists". The
 * checkers already downgrade "safe" to "unknown" in that case; this explains
 * why, and — per the project's teach-don't-just-block value — hands the user
 * the patterns to judge it themselves.
 *
 * Amber, not sky-blue, and no emoji. The colour system has one rule about this
 * exact case (see VerdictBadge): red is the verdict's, and amber is reserved
 * for statements about our own coverage. This is that statement, so it takes
 * that colour instead of a third hue used nowhere else — and the emoji went for
 * the reason VerdictBadge gives for having none, that it renders differently on
 * every platform and carries a tone the notice has to set in words.
 *
 * Deliberately still not styled as an alarm: this is a statement about our
 * coverage, not a finding about their message.
 */
export default function CoverageNotice({
  coverage,
  region,
  onRegionChange,
  recheck,
}: {
  coverage: RegionCoverage;
  region?: string | null;
  // When provided, the user can correct a wrong geo guess — geo-IP misfires for
  // roaming users and VPNs, and without this there is no way to say so.
  onRegionChange?: (code: string) => void;
  /**
   * Progress of a re-check started from the picker below.
   *
   * It lives here because it is the only part of the result step that can
   * report it: the pipeline panel and the error block both render on the input
   * step, so a re-check driven from this notice used to run, and fail, with
   * nothing on screen either way. An error has to stay next to the control that
   * caused it, and has to say the verdict below is still the old one.
   */
  recheck?:
    | { state: "idle" }
    | { state: "loading"; region: string }
    | { state: "error"; message: string };
}) {
  const { t } = useLang();
  if (coverage === "full") return null;

  const tips = [
    t("verdict.coverage.tip1"),
    t("verdict.coverage.tip2"),
    t("verdict.coverage.tip3"),
    t("verdict.coverage.tip4"),
  ];

  const busy = recheck?.state === "loading";
  const regionName = (code: string) =>
    REGION_OPTIONS.find((o) => o.code === code)?.name ?? code;

  return (
    <div className="rounded-lg border border-[var(--caution)]/40 bg-[var(--caution)]/[0.07] p-4 space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-bold text-[var(--caution)]">{t("verdict.coverage.title")}</p>
        <p className="text-sm text-[var(--text-dim)]">{t("verdict.coverage.body")}</p>
        <p className="text-sm font-medium text-[var(--foreground)]">{t("verdict.coverage.advice")}</p>
      </div>

      {onRegionChange && (
        <div className="border-t border-[var(--caution)]/25 pt-3 space-y-1.5">
          <label htmlFor="region-select" className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wide">
            {t("verdict.coverage.regionLabel")}
          </label>
          <select
            id="region-select"
            value={region ?? ""}
            // Disabled while a re-check is in flight: the request that is
            // running is the one whose result the reader is about to be shown,
            // and letting a second start would race it.
            disabled={busy}
            onChange={(e) => onRegionChange(e.target.value)}
            className="w-full bg-[var(--ink-3)] border border-[var(--rule)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-60 disabled:cursor-progress"
          >
            {REGION_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.name}</option>
            ))}
          </select>

          {/* Both states are announced: the verdict below changes underneath
              the reader on success, and on failure it conspicuously does not. */}
          <div role="status" aria-live="polite">
            {busy && (
              <p className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
                <span
                  aria-hidden="true"
                  className="w-3.5 h-3.5 shrink-0 rounded-full border-[1.5px] border-[var(--caution)] border-t-transparent motion-safe:animate-spin"
                />
                {t("verdict.coverage.rechecking", { region: regionName(recheck.region) })}
              </p>
            )}
          </div>
          {recheck?.state === "error" && (
            <p role="alert" className="text-[13px] leading-relaxed text-[var(--scam-text)]">
              {recheck.message}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-[var(--caution)]/25 pt-3 space-y-1.5">
        <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wide">
          {t("verdict.coverage.learn")}
        </p>
        <ul className="space-y-1">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-dim)]">
              <span className="shrink-0 text-[var(--caution)] mt-0.5" aria-hidden="true">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
