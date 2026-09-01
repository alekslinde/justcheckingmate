"use client";

import { CheckResult, PhoneIntel } from "@justcheckingmate/engine/scamDetector";
import type { Signal } from "@justcheckingmate/engine/engineTypes";
import { matchedTactics, TACTIC_IDS } from "@/lib/signalTactics";
import { defangText } from "@justcheckingmate/engine/urlSanitizer";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";

// Verdict colour comes from the tokens, and only from them: red is the verdict
// colour, amber is reserved for statements about our own coverage. "unknown"
// means we could not reach a view — that is a limit of ours, not a finding
// about the message — so it takes the neutral rule rather than a warning hue.
const VERDICTS: Record<
  CheckResult["verdict"],
  { dot: string; text: string; bar: string; edge: string }
> = {
  safe:        { dot: "bg-[var(--clear)]",   text: "text-[var(--clear)]",     bar: "bg-[var(--clear)]",   edge: "border-[var(--clear)]/35" },
  suspicious:  { dot: "bg-[var(--caution)]", text: "text-[var(--caution)]",   bar: "bg-[var(--caution)]", edge: "border-[var(--caution)]/35" },
  likely_scam: { dot: "bg-[var(--scam)]",    text: "text-[var(--scam-text)]", bar: "bg-[var(--scam)]",    edge: "border-[var(--scam)]/35" },
  unknown:     { dot: "bg-[var(--faint)]",   text: "text-[var(--text-dim)]",  bar: "bg-[var(--faint)]",   edge: "border-[var(--rule)]" },
};

const EYEBROW =
  "font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.11em] text-[var(--faint)]";

const SOURCE_KEY: Record<Signal["source"], MessageKey> = {
  link:       "verdict.evidence.source.link",
  message:    "verdict.evidence.source.message",
  sender:     "verdict.evidence.source.sender",
  phone:      "verdict.evidence.source.phone",
  attachment: "verdict.evidence.source.attachment",
  score:      "verdict.evidence.source.score",
};

// ── Evidence ──────────────────────────────────────────────────────────────────

// One row per signal, each showing what it contributed. Publishing the weights
// is the point: detection is open source precisely so people can check our
// reasoning, and a score with no breakdown asks to be taken on faith.
function Evidence({ signals }: { signals: Signal[] }) {
  const { t } = useLang();
  if (!signals.length) return null;

  return (
    <div>
      <p className="mb-2 text-[13px] leading-relaxed text-[var(--text-dim)]">
        {t("verdict.evidence.caption")}
      </p>
      <ul className="grid gap-px bg-[var(--rule)] rounded-lg overflow-hidden border border-[var(--rule)]">
        {signals.map((s, i) => (
          <li key={i} className="bg-[var(--ink-2)] px-3.5 py-2.5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className={`${EYEBROW} mb-0.5`}>{t(SOURCE_KEY[s.source])}</div>
              <p className="text-[13.5px] leading-relaxed text-[var(--foreground)]">{defangText(s.text)}</p>
            </div>
            {/* Tabular figures so the column of weights lines up as a column. */}
            <span
              className={`shrink-0 font-[family-name:var(--font-mono-ui)] text-[12.5px] tabular-nums ${
                s.points > 0 ? "text-[var(--caution)]" : s.points < 0 ? "text-[var(--clear)]" : "text-[var(--faint)]"
              }`}
            >
              {s.points > 0 ? `+${s.points}` : s.points < 0 ? `${s.points}` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Action steps shown for actionable verdicts ────────────────────────────────

function ActionSteps({ verdict }: { verdict: "suspicious" | "likely_scam" }) {
  const { t } = useLang();
  const heading = t(`verdict.${verdict}.nextSteps` as MessageKey);
  const steps =
    verdict === "likely_scam"
      ? [
          t("verdict.likely_scam.step1"),
          t("verdict.likely_scam.step2"),
          t("verdict.likely_scam.step3"),
          t("verdict.likely_scam.step4"),
        ]
      : [
          t("verdict.suspicious.step1"),
          t("verdict.suspicious.step2"),
          t("verdict.suspicious.step3"),
        ];

  const accentCls = verdict === "likely_scam" ? "text-[var(--scam-text)]" : "text-[var(--caution)]";
  const edgeCls   = verdict === "likely_scam" ? "border-[var(--scam)]/30" : "border-[var(--caution)]/30";

  return (
    <div className={`rounded-lg border ${edgeCls} bg-[var(--ink)] p-4 space-y-2.5`}>
      <p className={`${EYEBROW} ${accentCls}`}>{heading}</p>
      <ol className="space-y-2 list-none">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-[var(--foreground)]">
            <span
              className={`shrink-0 font-[family-name:var(--font-mono-ui)] tabular-nums ${accentCls}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Phone intelligence panel ──────────────────────────────────────────────────

const LINE_TYPE_META: Record<PhoneIntel["lineType"], { labelKey: MessageKey }> = {
  mobile:       { labelKey: "phone.lineType.mobile" },
  fixed:        { labelKey: "phone.lineType.fixed" },
  voip_likely:  { labelKey: "phone.lineType.voip" },
  premium:      { labelKey: "phone.lineType.premium" },
  freecall:     { labelKey: "phone.lineType.freecall" },
  shared_cost:  { labelKey: "phone.lineType.shared" },
  emergency:    { labelKey: "phone.lineType.emergency" },
  unknown:      { labelKey: "phone.lineType.unknown" },
};

const SPOOFING_RISK_STYLE: Record<PhoneIntel["spoofingRisk"], { labelKey: MessageKey; cls: string }> = {
  low:       { labelKey: "phone.risk.low",      cls: "text-[var(--clear)]" },
  medium:    { labelKey: "phone.risk.medium",   cls: "text-[var(--caution)]" },
  high:      { labelKey: "phone.risk.high",     cls: "text-[var(--caution)]" },
  very_high: { labelKey: "phone.risk.veryHigh", cls: "text-[var(--scam-text)]" },
};

function PhoneIntelPanel({ intel }: { intel: PhoneIntel }) {
  const { t } = useLang();
  const lt   = LINE_TYPE_META[intel.lineType];
  const risk = SPOOFING_RISK_STYLE[intel.spoofingRisk];

  return (
    <div className="border-t border-[var(--rule)] pt-4 space-y-3">
      <div className={EYEBROW}>
        {t("phone.heading")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
          <div className={EYEBROW}>{t("phone.type")}</div>
          <div className="text-[13.5px] text-[var(--foreground)]">{t(lt.labelKey)}</div>
        </div>
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
          <div className={EYEBROW}>{t("phone.country")}</div>
          <div className="text-[13.5px] text-[var(--foreground)]">{intel.country}</div>
        </div>
        {intel.region && (
          <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
            <div className={EYEBROW}>{t("phone.area")}</div>
            <div className="text-[13.5px] text-[var(--foreground)]">{intel.region}</div>
          </div>
        )}
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
          <div className={EYEBROW}>{t("phone.fakeRisk")}</div>
          <div className={`text-[13.5px] font-medium ${risk.cls}`}>{t(risk.labelKey)}</div>
        </div>
        {intel.normalised && (
          <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5 col-span-2">
            <div className={EYEBROW}>{t("phone.formatted")}</div>
            <div className="text-[13.5px] text-[var(--foreground)] font-[family-name:var(--font-mono-ui)]">{intel.normalised}</div>
          </div>
        )}
      </div>

      {intel.wangiriRisk && (
        <div className="rounded-lg border border-[var(--scam)]/30 bg-[var(--ink)] p-3 text-[13.5px] text-[var(--foreground)] space-y-1">
          <div className="font-bold">{t("phone.wangiri.title")}</div>
          <p>{bold(t("phone.wangiri.body"))}</p>
        </div>
      )}

      <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 text-[13.5px] text-[var(--text-dim)] space-y-1.5">
        <div className="font-medium text-[var(--foreground)]">{t("phone.spoof.title")}</div>
        <p>{t("phone.spoof.body")}</p>
        <p>
          {t("phone.spoof.report.pre")}{" "}
          <a
            href="https://www.scamwatch.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--clear)] underline underline-offset-2 hover:opacity-80"
          >
            Scamwatch (scamwatch.gov.au)<span className="sr-only"> ({t("a11y.newTab")})</span><span aria-hidden="true"> ↗</span>
          </a>{" "}
          {t("phone.spoof.report.post")}
        </p>
      </div>
    </div>
  );
}

// Trim a signal down to something quotable inside another sentence.
//
// Signal text is written to stand alone in an evidence row, so it often carries
// a colon and the matched terms in their own quotes — "Asks for sensitive info:
// \"bitcoin\", \"gift card\"". Quoting that whole string nests quotes inside
// quotes and reads as a mistake. The clause before the colon is the finding;
// the list after it is already visible in the row above.
function citeSignal(text: string): string {
  const full = defangText(text);
  const head = full.split(/[:—]/)[0].trim();
  // Inner straight quotes become single quotes so they can't close the curly
  // pair wrapping them — "impersonating \"mygov\"" would otherwise render as
  // a quote inside a quote and read as a typo.
  return (head.length >= 12 ? head : full).replace(/"/g, "'");
}

// ── Risk score ────────────────────────────────────────────────────────────────

// The thresholds are drawn on the track rather than described underneath it, so
// "why is this a scam and not merely suspicious" is answerable by looking.
function RiskScore({ score, bar, signals }: { score: number; bar: string; signals: Signal[] }) {
  const { t } = useLang();

  // Which band the score landed in, in the engine's own terms — the boundaries
  // here are scoreToResult's, and the ticks drawn on the track below are the
  // same two numbers. A score with no account of why it means what it means
  // asks to be taken on faith, which is the opposite of publishing weights.
  // Real findings only — the clamp row is arithmetic about the total, not an
  // observation, so it must not count towards "how many rules did this trip".
  const findings = signals.filter((x) => x.source !== "score");

  // The pile-up argument ("tripping this many isn't bad luck") only holds when
  // the score came from several independent findings. A 45 built from two rows
  // is still a scam, but claiming a pile-up there is an overclaim the evidence
  // directly above it disproves.
  const bandKey =
    score >= 45
      ? findings.length >= 4 ? "verdict.score.band.scamMany" : "verdict.score.band.scam"
      : score >= 20 ? "verdict.score.band.suspicious"
      : "verdict.score.band.safe";

  // The clamp row records the raw total when the ceiling bit. Explaining the
  // gap matters most at 100, where the headline number is the ceiling rather
  // than the sum and the evidence visibly adds up to more.
  const clamp = signals.find((x) => x.source === "score");
  const raw = clamp ? score - clamp.points : null;

  // A single signal heavy enough to clear the scam line on its own. Named only
  // when that is literally true, and only in the scam band — "X alone clears
  // it" about a score that needed three signals to get there would be a
  // sentence the evidence above it contradicts.
  const heaviest = findings
    .reduce<Signal | null>((a, x) => (a === null || x.points > a.points ? x : a), null);
  const clincher = score >= 45 && heaviest && heaviest.points >= 45 ? heaviest : null;

  // Both clauses can be true at once, and at the ceiling both matter: the cap
  // explains why the headline is 100 when the evidence adds to more, and the
  // clincher explains why it was a scam regardless of the cap.
  const band =
    t(bandKey) +
    (clincher
      ? t("verdict.score.band.clincher", { signal: citeSignal(clincher.text), points: clincher.points })
      : "") +
    (raw !== null ? t("verdict.score.band.capped", { raw }) : "");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={EYEBROW}>{t("verdict.score.label")}</h3>
        <div className="font-[family-name:var(--font-mono-ui)] tabular-nums">
          <span className="text-[26px] font-semibold text-[var(--foreground)]">{score}</span>
          <span className="text-[12px] text-[var(--faint)]">/100</span>
        </div>
      </div>
      <div
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("verdict.riskScore", { n: score })}
        className="relative mt-1.5 h-1.5 w-full rounded-full bg-[var(--ink-3)]"
      >
        <div className={`h-1.5 rounded-full transition-[width] duration-500 ${bar}`} style={{ width: `${score}%` }} />
        {/* 20 and 45 are the verdict boundaries in scoreToResult. */}
        {[20, 45].map((at) => (
          <span key={at} className="absolute top-0 h-1.5 w-px bg-[var(--ink)]" style={{ left: `${at}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="relative mt-1 h-3" aria-hidden="true">
        {([[20, "verdict.score.caution"], [45, "verdict.score.scam"]] as const).map(([at, key]) => (
          <span
            key={at}
            className="absolute font-[family-name:var(--font-mono-ui)] text-[10px] text-[var(--faint)] -translate-x-1/2"
            style={{ left: `${at}%` }}
          >
            {at} · {t(key)}
          </span>
        ))}
      </div>
      <p className="mt-3 border-t border-[var(--rule)] pt-3 text-[13.5px] leading-relaxed text-[var(--text-dim)]">
        {bold(band)}
      </p>
    </div>
  );
}

// ── Tactics ───────────────────────────────────────────────────────────────────

// The same six names the Learn page teaches, so a reader who has been there
// recognises them here. Unmatched tactics stay visible rather than being
// filtered out: "we looked for six things and found four" says more than a list
// of four, and it teaches the other two exist.
export function Tactics({ signals }: { signals: Signal[] }) {
  const { t } = useLang();
  const found = matchedTactics(signals);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className={EYEBROW}>{t("verdict.tactics.heading")}</h3>
        <span className={`${EYEBROW} text-[var(--caution)]`}>
          {t("verdict.tactics.count", { n: found.size, total: TACTIC_IDS.length })}
        </span>
      </div>
      <p className="mb-3 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--text-dim)]">
        {t("verdict.tactics.lede")}
      </p>
      <ul className="grid gap-px bg-[var(--rule)] rounded-lg overflow-hidden border border-[var(--rule)]">
        {TACTIC_IDS.map((id) => {
          const on = found.has(id);
          return (
            <li
              key={id}
              className={`flex items-center gap-2.5 px-3.5 py-2 text-[13.5px] ${
                on ? "bg-[var(--ink-3)] text-[var(--foreground)]" : "bg-[var(--ink-2)] text-[var(--faint)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border text-[10px] ${
                  on
                    ? "border-[var(--caution)] bg-[var(--caution)]/15 text-[var(--caution)]"
                    : "border-[var(--rule)]"
                }`}
              >
                {on ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">{t(`learn.tactics.${id}.title` as MessageKey)}</span>
              {on && <span className={`${EYEBROW} text-[var(--caution)]`}>{t("verdict.tactics.matched")}</span>}
            </li>
          );
        })}
      </ul>
      {found.size === 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-dim)]">
          {t("verdict.tactics.none")}
        </p>
      )}
      <a
        href="/learn#tactics"
        className="mt-2.5 inline-block text-[13px] text-[var(--clear)] hover:underline underline-offset-2"
      >
        {t("verdict.tactics.learnMore")}
      </a>
    </div>
  );
}

// ── Main badge ────────────────────────────────────────────────────────────────

export default function VerdictBadge({ result }: { result: CheckResult }) {
  const { t } = useLang();
  const v     = VERDICTS[result.verdict];
  const label = t(`verdict.${result.verdict}.label` as MessageKey);
  const sub   = t(`verdict.${result.verdict}.sub`   as MessageKey);

  const signals = result.signals ?? [];
  // The details sentence and verdict.*.sub restate one another for a clean
  // result, so it is dropped where the sub already covers it.
  const details = defangText(result.details);
  const showDetails = details && !details.startsWith("Looks pretty right");

  return (
    // No border of its own: this renders as the top of the results sheet, which
    // already carries one. Nesting a second bordered card inside it drew a box
    // around the verdict and another around the box, and the reader has to work
    // out which of the two frames means something.
    <div className="overflow-hidden">

      {/* Header. A dot rather than an emoji: emoji render differently on every
          platform and carry a tone the verdict has to set itself. */}
      <div className="pb-5">
        <div className="flex items-start gap-2.5">
          <span className={`mt-[9px] h-2 w-2 shrink-0 rounded-full ${v.dot}`} aria-hidden="true" />
          <div className="min-w-0">
            <h2 className={`font-[family-name:var(--font-display)] text-[23px] leading-tight tracking-[-0.01em] ${v.text}`}>
              {label}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-dim)]">{sub}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--rule)] pt-5 space-y-5">
        {signals.length > 0 ? <Evidence signals={signals} /> : null}

        <RiskScore score={result.score} bar={v.bar} signals={signals} />

        {showDetails && (
          <p className="text-[13.5px] leading-relaxed text-[var(--text-dim)]">
            {details}
          </p>
        )}

        {(result.verdict === "likely_scam" || result.verdict === "suspicious") && (
          <ActionSteps verdict={result.verdict} />
        )}

        {result.phoneIntel && <PhoneIntelPanel intel={result.phoneIntel} />}
      </div>
    </div>
  );
}
