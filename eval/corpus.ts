// Corpus loading, with the privacy check enforced at the point of load.
//
// The corpus is real user submissions living in a git repository: checked in,
// cloned, permanent, greppable. That is a materially different exposure from a
// database row, so the check runs on every load rather than being trusted to
// have happened at authoring time.
//
// The check is NOT plain scrubPii equality, and the difference matters.
// scrubPii redacts every email address and phone number it sees, which is right
// for a reporter's free-text description but wrong for a corpus: the scammer's
// own "From: noreply@evil.tk" and callback number are the evidence, and
// emailHeaders.ts scores on exactly those. Deleting them would leave nothing to
// evaluate.
//
// So the invariant is narrower and the case must earn it:
//
//   1. stripReporterHeaders() must be a no-op — a case still carrying
//      Delivered-To / Received / X-Original-To has the *recipient's* mailbox and
//      relay path in it, which is never evidence and never belongs here.
//   2. Every remaining PII hit must be declared in the case's `identifiers`
//      list, which the author writes by hand. Declaring is cheap; forgetting is
//      caught. An undeclared address or number fails the run.
//
// The effect is that scam identifiers survive because someone consciously
// listed them, while a victim's phone number pasted in by accident does not.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scrubPii, stripReporterHeaders } from "@/lib/piiScrubber";
import { validateCase, type EvalCase } from "./schema";

/**
 * Find the substrings scrubPii would redact.
 *
 * Works line by line rather than token by token: several PII patterns span
 * whitespace ("0412 345 678", "123 456 789", "4532 1234 5678 9012"), so a
 * word-split check would miss exactly the identifiers that matter most. Each
 * line is scrubbed, then the original and scrubbed forms are walked together to
 * recover the literal text that each redaction replaced.
 */
function piiHits(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const scrubbed = scrubPii(line);
    if (scrubbed === line) continue;

    // Walk both strings, matching the common prefix and suffix around each
    // "[... removed]" marker to recover what was replaced.
    let oi = 0;
    let si = 0;
    while (si < scrubbed.length) {
      if (scrubbed[si] === "[" && /^\[[a-zA-Z]+ removed\]/.test(scrubbed.slice(si))) {
        const marker = scrubbed.slice(si).match(/^\[[a-zA-Z]+ removed\]/)![0];
        const after = scrubbed.slice(si + marker.length);
        // The redacted span runs from oi to wherever the following literal text
        // resumes in the original. Anchor on the next 8 chars of context, or the
        // end of the line when the redaction is trailing.
        const anchor = after.slice(0, 8);
        const resume = anchor ? line.indexOf(anchor, oi) : line.length;
        const end = resume === -1 ? line.length : resume;
        const hit = line.slice(oi, end).trim();
        if (hit) hits.push(hit);
        oi = end;
        si += marker.length;
        continue;
      }
      oi += 1;
      si += 1;
    }
  }
  // Strip surrounding punctuation that is not part of an identifier, so
  // "<noreply@evil.tk>" and "noreply@evil.tk" compare equal against the
  // declared list.
  return hits.map((h) => h.replace(/^[<("']+|[>)"',.;:]+$/g, "")).filter(Boolean);
}

export interface LoadResult {
  cases: EvalCase[];
  errors: string[];
}

/**
 * Load every .jsonl file in a corpus directory.
 *
 * Blank lines and #-prefixed lines are skipped so a file can carry section
 * comments without a separate metadata channel.
 */
export function loadCorpus(dir: string): LoadResult {
  const errors: string[] = [];
  const cases: EvalCase[] = [];
  const seenIds = new Set<string>();

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return { cases, errors: [`corpus directory not readable: ${dir}`] };
  }
  if (files.length === 0) errors.push(`no .jsonl files in ${dir}`);

  for (const file of files) {
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const where = `${file}:${i + 1}`;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        errors.push(`${where}: invalid JSON`);
        return;
      }

      const problems = validateCase(parsed, seenIds);
      if (problems.length > 0) {
        problems.forEach((p) => errors.push(`${where}: ${p}`));
        return;
      }

      const c = parsed as EvalCase;

      // 1. No recipient-side headers.
      if (stripReporterHeaders(c.content) !== c.content) {
        errors.push(
          `${where}: content carries reporter/delivery headers (id "${c.id}") — ` +
            `run it through stripReporterHeaders before committing`,
        );
        return;
      }

      // 2. Every PII-shaped token must be a declared scam identifier.
      const declared = new Set(c.identifiers ?? []);
      const undeclared = piiHits(c.content).filter((h) => !declared.has(h));
      if (undeclared.length > 0) {
        errors.push(
          `${where}: undeclared PII-shaped content in case "${c.id}": ` +
            `${[...new Set(undeclared)].join(", ")} — if these are the scammer's own ` +
            `identifiers, list them in "identifiers"; if they belong to a real person, remove them`,
        );
        return;
      }

      seenIds.add(c.id);
      cases.push(c);
    });
  }

  return { cases, errors };
}
