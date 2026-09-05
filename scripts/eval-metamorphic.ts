#!/usr/bin/env npx tsx
//
// Metamorphic eval entrypoint.  npm run eval:metamorphic [-- options]
//
//   --suspicious-as=flagged|clean|abstain   how to count a "suspicious"
//                                           verdict (default: flagged)
//   --corpus=<dir>                          corpus directory
//   --only=<id,id>                          run just these transforms
//   --list                                  print the transforms and exit
//   --json                                  machine-readable output only
//
// Runs two families in one pass:
//   · CONTENT relations (metamorphic.ts) — rewrite the message, hold the region.
//     Catches evasion.
//   · REGION relations (regionRelations.ts) — hold the message, vary the pack.
//     Catches pack leakage and suppressed base signals.
// Both are reported separately because they fail for different reasons and
// point at different files, but they gate together: either one violating is a
// failing run.
//
// Exits non-zero when any relation is violated. Unlike the corpus eval there
// is no threshold to tune and no baseline to ratchet: a violation is a
// self-inconsistency, which is a bug rather than a trade-off someone chose.

import { join } from "node:path";
import { loadCorpus } from "@/eval/corpus";
import { runMetamorphic, formatSummary, formatViolations } from "@/eval/metamorphicRunner";
import { TRANSFORMS } from "@/eval/metamorphic";
import {
  runRegionRelations,
  formatRegionSummary,
  formatRegionViolations,
} from "@/eval/regionRelations";
import type { SuspiciousPolicy } from "@/eval/schema";

/** Region-relation ids, selectable via --only alongside transform ids. */
const REGION_RELATION_IDS = ["region-invariance", "coverage-monotonicity"];

const ROOT = process.cwd();
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

const suspiciousAs = (flag("suspicious-as") ?? "flagged") as SuspiciousPolicy;
const corpusDir = flag("corpus") ?? join(ROOT, "eval/corpus");
const only = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const jsonOnly = args.includes("--json");

if (args.includes("--list")) {
  for (const t of TRANSFORMS) console.log(`${t.id.padEnd(25)} ${t.relation.padEnd(10)} ${t.intent}`);
  for (const id of REGION_RELATION_IDS) {
    console.log(`${id.padEnd(25)} ${"region".padEnd(10)} varies the region pack, holds content fixed`);
  }
  process.exit(0);
}

if (!["flagged", "clean", "abstain"].includes(suspiciousAs)) {
  console.error(`--suspicious-as must be flagged, clean or abstain (got "${suspiciousAs}")`);
  process.exit(2);
}

if (only?.length) {
  const known = [...TRANSFORMS.map((t) => t.id), ...REGION_RELATION_IDS];
  const unknown = only.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    console.error(`Unknown relation(s): ${unknown.join(", ")}`);
    console.error(`Available: ${known.join(", ")}`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const { cases, errors } = loadCorpus(corpusDir);
  if (errors.length > 0) {
    console.error(`Corpus validation failed (${errors.length}):`);
    errors.forEach((e) => console.error(`  ${e}`));
    process.exit(2);
  }

  const result = await runMetamorphic(cases, suspiciousAs, only);
  const regionResult = await runRegionRelations(cases, suspiciousAs, only);
  const totalViolations = result.violations.length + regionResult.violations.length;

  if (jsonOnly) {
    console.log(
      JSON.stringify(
        {
          checks:
            [...result.applied.values()].reduce((a, b) => a + b, 0) +
            [...regionResult.applied.values()].reduce((a, b) => a + b, 0),
          violations: result.violations,
          applied: Object.fromEntries(result.applied),
          regionViolations: regionResult.violations,
          regionApplied: Object.fromEntries(regionResult.applied),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nMetamorphic eval: ${cases.length} cases from ${corpusDir}`);
    console.log(`Suspicious counted as: ${suspiciousAs}`);
    console.log(formatSummary(result));
    console.log(formatViolations(result));
    console.log(formatRegionSummary(regionResult));
    console.log(formatRegionViolations(regionResult));
  }

  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Metamorphic eval failed:", err);
  process.exit(2);
});
