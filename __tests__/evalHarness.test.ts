import { describe, it, expect } from "vitest";
import { toPrediction, validateCase } from "@/eval/schema";
import { computeMetrics, type Outcome } from "@/eval/metrics";
import { checkThresholds } from "@/eval/report";
import { loadCorpus } from "@/eval/corpus";
import { join } from "node:path";
import type { CheckResult } from "@/lib/engineTypes";

// The harness gates detection changes, so it needs its own coverage: a bug that
// silently scores every case as correct would make the gate useless while
// looking green. These are unit tests of the harness, not of detection — the
// corpus eval itself runs via `npm run eval`, deliberately outside vitest.

const result = (over: Partial<CheckResult>): CheckResult => ({
  verdict: "safe", score: 0, flags: [], details: "", coverage: "full", ...over,
});

describe("toPrediction", () => {
  it("abstains whenever coverage is short, whatever the verdict", () => {
    for (const coverage of ["none", "partial"] as const) {
      expect(toPrediction(result({ verdict: "likely_scam", coverage }))).toBe("abstain");
      expect(toPrediction(result({ verdict: "safe", coverage }))).toBe("abstain");
    }
  });

  it("maps committed verdicts under full coverage", () => {
    expect(toPrediction(result({ verdict: "likely_scam" }))).toBe("flagged");
    expect(toPrediction(result({ verdict: "safe" }))).toBe("clean");
    expect(toPrediction(result({ verdict: "unknown" }))).toBe("abstain");
  });

  it("honours the suspicious policy", () => {
    const r = result({ verdict: "suspicious" });
    expect(toPrediction(r, "flagged")).toBe("flagged");
    expect(toPrediction(r, "clean")).toBe("clean");
    expect(toPrediction(r, "abstain")).toBe("abstain");
  });
});

const outcome = (label: "scam" | "benign", prediction: Outcome["prediction"], score = 0): Outcome => ({
  case: { id: `${label}-${Math.random()}`, type: "sms", region: "AU", content: "x", label, source: "t", addedAt: "2026-08-29" },
  prediction, score, verdict: "safe", coverage: "full",
});

describe("computeMetrics", () => {
  it("excludes abstentions from recall and FPR", () => {
    const m = computeMetrics([
      outcome("scam", "flagged"), outcome("scam", "clean"), outcome("scam", "abstain"),
      outcome("benign", "clean"), outcome("benign", "abstain"),
    ]);
    // 2 committed scam, 1 caught → 0.5, not 1/3.
    expect(m.recall).toBe(0.5);
    expect(m.fpr).toBe(0);
    expect(m.coverageRate).toBeCloseTo(3 / 5);
  });

  it("returns null rather than zero when a class has no committed cases", () => {
    const m = computeMetrics([outcome("scam", "abstain")]);
    expect(m.recall).toBeNull();
    expect(m.fpr).toBeNull();
    expect(m.precision).toBeNull();
  });
});

describe("checkThresholds", () => {
  const t = { recall: 0.9, fpr: 0.02, coverage: 0.98 };

  it("breaches on low recall, high FPR and low coverage", () => {
    const m = computeMetrics([outcome("scam", "clean"), outcome("benign", "flagged")]);
    expect(checkThresholds("AU", m, t).map((b) => b.metric).sort()).toEqual(["fpr", "recall"]);
  });

  it("never breaches on a null metric — nothing to judge", () => {
    expect(checkThresholds("CA", computeMetrics([outcome("scam", "abstain")]), { ...t, coverage: null })).toEqual([]);
  });

  it("treats a null threshold as ungated", () => {
    const m = computeMetrics([outcome("scam", "clean")]);
    expect(checkThresholds("CA", m, { recall: null, fpr: 0.02, coverage: null })).toEqual([]);
  });
});

describe("validateCase", () => {
  const valid = { id: "a", type: "sms", region: "AU", content: "x", label: "scam", source: "t", addedAt: "2026-08-29" };

  it("accepts a well-formed case", () => {
    expect(validateCase(valid, new Set())).toEqual([]);
  });

  it("rejects duplicate ids", () => {
    expect(validateCase(valid, new Set(["a"])).join()).toContain("duplicate");
  });

  it.each([
    ["type", { type: "carrier-pigeon" }],
    ["label", { label: "probably" }],
    ["addedAt", { addedAt: "29/08/2026" }],
    ["region", { region: "" }],
  ])("rejects a bad %s", (field, over) => {
    expect(validateCase({ ...valid, ...over }, new Set()).join()).toContain(field);
  });
});

describe("the committed corpus", () => {
  it("loads clean — no schema, duplicate or PII failures", () => {
    const { cases, errors } = loadCorpus(join(process.cwd(), "eval/corpus"));
    expect(errors).toEqual([]);
    expect(cases.length).toBeGreaterThan(0);
  });

  it("rejects content carrying reporter headers", () => {
    // Guards the privacy invariant itself: a case with the recipient's mailbox
    // in a Delivered-To header must never load, however well-formed otherwise.
    const { errors } = loadCorpus(join(process.cwd(), "eval/fixtures/bad-corpus"));
    expect(errors.join(" ")).toContain("reporter/delivery headers");
  });

  it("rejects undeclared PII-shaped content", () => {
    const { errors } = loadCorpus(join(process.cwd(), "eval/fixtures/bad-corpus"));
    expect(errors.join(" ")).toContain("undeclared PII-shaped content");
  });
});
