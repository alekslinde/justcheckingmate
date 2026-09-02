// Runs the metamorphic relations and reports violations.

import { scoreContent, type Scored } from "./runner";
import { TRANSFORMS, type Relation, type Transform } from "./metamorphic";
import type { EvalCase, SuspiciousPolicy } from "./schema";

/**
 * Verdict severity. Shared with the runner's card reduction in spirit but kept
 * separate on purpose: that one ranks cards inside a single result, this one
 * compares two whole results, and collapsing them would tie the relation
 * semantics to a detail of how cards are picked.
 */
const RANK: Record<string, number> = { safe: 0, unknown: 1, suspicious: 2, likely_scam: 3 };

export interface Violation {
  caseId: string;
  transform: string;
  intent: string;
  relation: Relation;
  region: string;
  before: Scored;
  after: Scored;
  transformed: string;
  original: string;
}

/**
 * Whether a transformation broke its relation.
 *
 * Both relations are judged on the verdict, not the score. The score is an
 * internal quantity a user never sees, and it moves for legitimate reasons —
 * an obfuscation penalty, a signal that fires twice on padded text. Gating on
 * it would bury the failures that matter under churn. The verdict is what the
 * product asserts, so it is what must hold.
 */
function violates(relation: Relation, before: Scored, after: Scored): boolean {
  if (relation === "equal") return before.verdict !== after.verdict;
  return (RANK[after.verdict] ?? 0) < (RANK[before.verdict] ?? 0);
}

export interface MetamorphicResult {
  violations: Violation[];
  /** Checks actually run, per transform — the denominator for a rate. */
  applied: Map<string, number>;
  /** Cases a transform declined, so a silent no-op is visible as coverage. */
  skipped: Map<string, number>;
}

export async function runMetamorphic(
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
  only?: string[],
): Promise<MetamorphicResult> {
  const active: Transform[] = only?.length
    ? TRANSFORMS.filter((t) => only.includes(t.id))
    : TRANSFORMS;

  const violations: Violation[] = [];
  const applied = new Map<string, number>();
  const skipped = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const c of cases) {
    // Scored once per case rather than once per transform: the engine is a pure
    // function of (content, region) here, so the original's verdict cannot
    // differ between transforms.
    const before = await scoreContent(c.content, c.region, suspiciousAs);

    for (const t of active) {
      if (!t.applies(c)) {
        bump(skipped, t.id);
        continue;
      }
      const transformed = t.apply(c.content);
      if (transformed === null || transformed === c.content) {
        bump(skipped, t.id);
        continue;
      }

      bump(applied, t.id);
      const after = await scoreContent(transformed, c.region, suspiciousAs);
      if (violates(t.relation, before, after)) {
        violations.push({
          caseId: c.id,
          transform: t.id,
          intent: t.intent,
          relation: t.relation,
          region: c.region,
          before,
          after,
          transformed,
          original: c.content,
        });
      }
    }
  }

  return { violations, applied, skipped };
}

// ── Reporting ────────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d === 0 ? "  n/a" : `${((n / d) * 100).toFixed(1).padStart(5)}%`);

/** One row per transform: how many checks ran and how many broke. */
export function formatSummary(r: MetamorphicResult): string {
  const byTransform = new Map<string, number>();
  for (const v of r.violations) byTransform.set(v.transform, (byTransform.get(v.transform) ?? 0) + 1);

  const lines = [
    "",
    "Transform                 Relation    Checks  Violations   Rate",
    "─".repeat(66),
  ];

  for (const t of TRANSFORMS) {
    const ran = r.applied.get(t.id) ?? 0;
    // A transform that never applied is not passing — it is untested, and
    // printing it as a clean 0/0 would read as evidence it holds.
    if (ran === 0 && !r.skipped.has(t.id)) continue;
    const bad = byTransform.get(t.id) ?? 0;
    const mark = ran === 0 ? "  (never applied)" : bad > 0 ? "  ←" : "";
    lines.push(
      `${t.id.padEnd(25)} ${t.relation.padEnd(10)} ${String(ran).padStart(6)}  ${String(bad).padStart(10)}  ${pct(bad, ran)}${mark}`,
    );
  }

  const totalChecks = [...r.applied.values()].reduce((a, b) => a + b, 0);
  lines.push("─".repeat(66));
  lines.push(
    `${"TOTAL".padEnd(25)} ${"".padEnd(10)} ${String(totalChecks).padStart(6)}  ${String(r.violations.length).padStart(10)}  ${pct(r.violations.length, totalChecks)}`,
  );
  return lines.join("\n");
}

/** Truncate for terminal display, marking the cut so nothing looks complete. */
const clip = (s: string, n = 88) => {
  const flat = s.replace(/\n/g, "\\n");
  return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
};

/**
 * Every violation in full.
 *
 * Printed rather than summarised because each one is a reproducible bug report:
 * the transformed string is the failing input, and a reader needs to see it to
 * judge whether the relation or the engine is wrong.
 */
export function formatViolations(r: MetamorphicResult): string {
  if (r.violations.length === 0) return "\nNo violations.\n";

  const lines = [`\nViolations (${r.violations.length}):`];
  for (const v of r.violations) {
    const arrow = v.relation === "equal" ? "must match" : "must not weaken";
    lines.push("");
    lines.push(`  ${v.caseId}  [${v.region}]  ${v.transform} — ${arrow}`);
    lines.push(`    ${v.intent}`);
    lines.push(`    ${v.before.verdict} (${v.before.score}) → ${v.after.verdict} (${v.after.score})`);
    lines.push(`    before: ${clip(v.original)}`);
    lines.push(`    after:  ${clip(v.transformed)}`);
  }
  return lines.join("\n");
}
