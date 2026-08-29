// Metric computation. Pure functions over scored outcomes — no I/O, no engine.

import type { EvalCase, Label, Prediction } from "./schema";

export interface Outcome {
  case: EvalCase;
  prediction: Prediction;
  score: number;
  verdict: string;
  coverage: string;
}

export interface Metrics {
  /** Cases in this slice, including abstentions. */
  total: number;
  scam: number;
  benign: number;
  /** Share of cases where the engine committed to an answer. */
  coverageRate: number;
  /**
   * Computed over committed predictions only. Null when the slice has no
   * committed case of the relevant class — an undefined ratio, which must not
   * be reported as 0 (that reads as total failure rather than no data).
   */
  recall: number | null;
  fpr: number | null;
  precision: number | null;
  /** Scam:benign among committed cases. Precision is meaningless without it. */
  committedScam: number;
  committedBenign: number;
  /**
   * Score medians and 90th percentiles per label. Verdicts are thresholded, so
   * a rule change can erode margin substantially with no metric movement and
   * then flip many cases at once. Watching the distribution gives warning.
   */
  scoreP50: { scam: number | null; benign: number | null };
  scoreP90: { scam: number | null; benign: number | null };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function scoresFor(outcomes: Outcome[], label: Label): number[] {
  return outcomes
    .filter((o) => o.case.label === label)
    .map((o) => o.score)
    .sort((a, b) => a - b);
}

export function computeMetrics(outcomes: Outcome[]): Metrics {
  const scam = outcomes.filter((o) => o.case.label === "scam");
  const benign = outcomes.filter((o) => o.case.label === "benign");
  const committed = outcomes.filter((o) => o.prediction !== "abstain");

  const cScam = committed.filter((o) => o.case.label === "scam");
  const cBenign = committed.filter((o) => o.case.label === "benign");

  const tp = cScam.filter((o) => o.prediction === "flagged").length;
  const fp = cBenign.filter((o) => o.prediction === "flagged").length;

  const recall = cScam.length > 0 ? tp / cScam.length : null;
  const fpr = cBenign.length > 0 ? fp / cBenign.length : null;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;

  const scamScores = scoresFor(outcomes, "scam");
  const benignScores = scoresFor(outcomes, "benign");

  return {
    total: outcomes.length,
    scam: scam.length,
    benign: benign.length,
    coverageRate: outcomes.length > 0 ? committed.length / outcomes.length : 0,
    recall,
    fpr,
    precision,
    committedScam: cScam.length,
    committedBenign: cBenign.length,
    scoreP50: { scam: percentile(scamScores, 0.5), benign: percentile(benignScores, 0.5) },
    scoreP90: { scam: percentile(scamScores, 0.9), benign: percentile(benignScores, 0.9) },
  };
}

/** Group outcomes by an arbitrary key, preserving a stable key order. */
export function sliceBy(outcomes: Outcome[], key: (o: Outcome) => string): Map<string, Outcome[]> {
  const out = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const k = key(o);
    const bucket = out.get(k);
    if (bucket) bucket.push(o);
    else out.set(k, [o]);
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
