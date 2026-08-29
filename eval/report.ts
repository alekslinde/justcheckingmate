// Threshold gating and terminal formatting.

import type { Metrics, Outcome } from "./metrics";

export interface Thresholds {
  recall: number | null;
  fpr: number | null;
  coverage: number | null;
}

export interface Breach {
  slice: string;
  metric: "recall" | "fpr" | "coverage";
  actual: number;
  limit: number;
}

/**
 * Check one slice against its gate.
 *
 * A null metric (no committed cases of that class) is never a breach — there
 * is nothing to judge. A null threshold is explicitly ungated. CA carries
 * both: recall is ungated pending a reviewer, while FPR stays gated, because
 * flagging a benign message is measurable harm regardless of whether we have
 * the language expertise to judge recall.
 */
export function checkThresholds(slice: string, m: Metrics, t: Thresholds | undefined): Breach[] {
  if (!t) return [];
  const breaches: Breach[] = [];
  if (t.recall !== null && m.recall !== null && m.recall < t.recall) {
    breaches.push({ slice, metric: "recall", actual: m.recall, limit: t.recall });
  }
  if (t.fpr !== null && m.fpr !== null && m.fpr > t.fpr) {
    breaches.push({ slice, metric: "fpr", actual: m.fpr, limit: t.fpr });
  }
  if (t.coverage !== null && m.coverageRate < t.coverage) {
    breaches.push({ slice, metric: "coverage", actual: m.coverageRate, limit: t.coverage });
  }
  return breaches;
}

const pct = (v: number | null): string => (v === null ? "  -  " : `${(v * 100).toFixed(1)}%`.padStart(6));
const num = (v: number | null): string => (v === null ? " -" : String(v).padStart(3));

export function formatSliceTable(title: string, rows: Map<string, Metrics>): string {
  const lines: string[] = [
    "",
    title,
    "  slice            n   scam  benign  recall     FPR   prec   cov    p50 s/b",
    "  " + "-".repeat(72),
  ];
  for (const [slice, m] of rows) {
    lines.push(
      "  " +
        slice.padEnd(16) +
        String(m.total).padStart(3) +
        "   " +
        String(m.scam).padStart(4) +
        "  " +
        String(m.benign).padStart(6) +
        "  " +
        pct(m.recall) +
        "  " +
        pct(m.fpr) +
        "  " +
        pct(m.precision) +
        " " +
        pct(m.coverageRate) +
        "   " +
        num(m.scoreP50.scam) +
        "/" +
        num(m.scoreP50.benign),
    );
  }
  return lines.join("\n");
}

/** Cases where the engine committed to the wrong answer. Abstentions excluded. */
export function formatMisses(outcomes: Outcome[]): string {
  const wrong = outcomes.filter(
    (o) =>
      (o.case.label === "scam" && o.prediction === "clean") ||
      (o.case.label === "benign" && o.prediction === "flagged"),
  );
  if (wrong.length === 0) return "\nNo incorrect commitments.";

  const lines = ["", `Incorrect commitments (${wrong.length}):`];
  for (const o of wrong) {
    const kind = o.case.label === "scam" ? "MISS" : "FALSE POSITIVE";
    lines.push(
      `  ${kind}  ${o.case.id}  [${o.case.region}/${o.case.type}${o.case.category ? "/" + o.case.category : ""}]  score=${o.score} verdict=${o.verdict}`,
    );
    lines.push(`         ${o.case.content.slice(0, 88).replace(/\s+/g, " ")}`);
  }
  return lines.join("\n");
}

/** Abstentions on scam cases — coverage gaps, reported apart from misses. */
export function formatAbstentions(outcomes: Outcome[]): string {
  const abstained = outcomes.filter((o) => o.prediction === "abstain");
  if (abstained.length === 0) return "";
  const byRegion = new Map<string, number>();
  for (const o of abstained) {
    byRegion.set(o.case.region, (byRegion.get(o.case.region) ?? 0) + 1);
  }
  const parts = [...byRegion.entries()].sort().map(([r, n]) => `${r}=${n}`);
  return `\nAbstained (coverage gate): ${abstained.length} — ${parts.join(" ")}`;
}
