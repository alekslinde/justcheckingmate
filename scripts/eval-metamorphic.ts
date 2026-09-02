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
// Exits non-zero when any relation is violated. Unlike the corpus eval there
// is no threshold to tune and no baseline to ratchet: a violation is a
// self-inconsistency, which is a bug rather than a trade-off someone chose.

import { join } from "node:path";
import { loadCorpus } from "@/eval/corpus";
import { runMetamorphic, formatSummary, formatViolations } from "@/eval/metamorphicRunner";
import { TRANSFORMS } from "@/eval/metamorphic";
import type { SuspiciousPolicy } from "@/eval/schema";

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
  process.exit(0);
}

if (!["flagged", "clean", "abstain"].includes(suspiciousAs)) {
  console.error(`--suspicious-as must be flagged, clean or abstain (got "${suspiciousAs}")`);
  process.exit(2);
}

if (only?.length) {
  const unknown = only.filter((id) => !TRANSFORMS.some((t) => t.id === id));
  if (unknown.length > 0) {
    console.error(`Unknown transform(s): ${unknown.join(", ")}`);
    console.error(`Available: ${TRANSFORMS.map((t) => t.id).join(", ")}`);
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

  if (jsonOnly) {
    console.log(
      JSON.stringify(
        {
          checks: [...result.applied.values()].reduce((a, b) => a + b, 0),
          violations: result.violations,
          applied: Object.fromEntries(result.applied),
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
  }

  process.exit(result.violations.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Metamorphic eval failed:", err);
  process.exit(2);
});
