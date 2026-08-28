import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// The lint half of the privacy invariant.
//
// __tests__/privacyInvariant.test.ts enforces "a submitted URL is never
// visited" behaviourally, but it can only intercept global fetch — module
// mocking cannot reach a dynamic import inside already-loaded production code,
// so a leak through node:dns or node:net passes every test there. The route
// contract names "an outbound HTTP request, DNS lookup, or socket connection";
// the rules in eslint.config.mjs cover the two the test cannot.
//
// A lint rule protects nothing while it is misconfigured, so these tests run
// eslint for real against probe files and assert on the parsed ruleIds. Two
// details are deliberate, both learned from getting them wrong:
//
//   · Assert on parsed messages[].ruleId, never a substring of the raw JSON.
//     eslint's output echoes the probe's own source text, so a `toContain`
//     check passes when an unrelated rule fires and the privacy rule does not.
//
//   · Probe files go in a temp directory, not lib/. A probe written into lib/
//     sits inside the tsconfig include and the lint glob and is untracked, so
//     an interrupted run strands a rule-violating file that breaks the next
//     lint and is committable.

const PRIVACY_RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

interface LintMessage {
  ruleId: string | null;
  message: string;
}

/**
 * Lint `source` as a file under `dirName` and return the reported messages.
 *
 * The probe lives in a temp dir with a config that carries only the rules under
 * test, so the result cannot be polluted by unrelated project rules — and
 * nothing is ever written inside the repo.
 */
function lint(source: string, filename: string): LintMessage[] {
  const dir = mkdtempSync(path.join(tmpdir(), "jcm-eslint-"));
  try {
    const probe = path.join(dir, filename);
    writeFileSync(probe, source);

    // Re-declare the rules under test against this temp path. Importing the
    // project config directly would not apply: its `files` globs are relative
    // to the repo, and the point here is to assert the rule bodies behave.
    const projectConfig = path.join(process.cwd(), "eslint.config.mjs");
    writeFileSync(
      path.join(dir, "eslint.config.mjs"),
      `import project from ${JSON.stringify(projectConfig)};\n` +
        `const block = project.find((c) => c.rules && c.rules["no-restricted-syntax"]);\n` +
        `export default [{ files: ["**/*.{ts,tsx}"], rules: block.rules }];\n`,
    );

    let stdout = "";
    try {
      stdout = execFileSync(
        "npx",
        ["eslint", "--no-ignore", "--no-config-lookup", "-c", "eslint.config.mjs", "--format", "json", filename],
        // cwd is the temp dir and the paths are relative to it: eslint refuses
        // to lint a file outside its base path, so an absolute probe path
        // silently reports "File ignored" instead of running the rules.
        { cwd: dir, encoding: "utf8", stdio: "pipe", env: { ...process.env } },
      );
    } catch (err) {
      // eslint exits non-zero when it reports errors; the JSON is on stdout.
      stdout = (err as { stdout?: string }).stdout ?? "";
    }

    if (!stdout.trim()) throw new Error("eslint produced no output — the probe did not run");
    const results = JSON.parse(stdout) as Array<{ messages: LintMessage[] }>;
    return results.flatMap((r) => r.messages);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function privacyViolations(messages: LintMessage[]): LintMessage[] {
  return messages.filter((m) => m.ruleId !== null && PRIVACY_RULES.has(m.ruleId));
}

const MODULES = ["dns", "node:dns", "net", "node:net", "https", "node:https", "tls", "node:tls"];

describe("static imports of Node network modules are rejected", () => {
  for (const mod of MODULES) {
    it(`rejects: import * as x from "${mod}"`, () => {
      const found = privacyViolations(lint(`import * as x from "${mod}";\nexport const y = x;\n`, "probe.ts"));
      expect(found.length, `importing ${mod} was not flagged`).toBeGreaterThan(0);
    });
  }
});

describe("dynamic access is rejected too — the vector the behavioural test cannot see", () => {
  // This is the shape that motivated the whole rule. no-restricted-imports only
  // sees static import statements, so without a syntax selector these slip
  // past lint AND past privacyInvariant.test.ts — enforced by neither half.
  for (const mod of ["node:dns", "dns", "node:net"]) {
    it(`rejects: await import("${mod}")`, () => {
      const found = privacyViolations(
        lint(`export async function f() { return import("${mod}"); }\n`, "probe.ts"),
      );
      expect(found.length, `dynamic import of ${mod} was not flagged`).toBeGreaterThan(0);
    });

    it(`rejects: require("${mod}")`, () => {
      const found = privacyViolations(
        lint(`export function f() { return require("${mod}"); }\n`, "probe.ts"),
      );
      expect(found.length, `require of ${mod} was not flagged`).toBeGreaterThan(0);
    });
  }

  it("rejects a submodule path such as dns/promises", () => {
    const found = privacyViolations(
      lint(`export async function f() { return import("dns/promises"); }\n`, "probe.ts"),
    );
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("the project config applies the rule to every detector file", () => {
  // The tests above re-declare the rules under their own glob, so they verify
  // the rule BODIES. They cannot see a mistake in the project config's `files`
  // globs — which were once "lib/**/*.ts" and "components/**/*.tsx", leaving
  // lib/lang.tsx and lib/richText.tsx unprotected. That needs linting a real
  // path with the real config, which is what this does.
  function lintInRepo(relPath: string, source: string): LintMessage[] {
    const abs = path.join(process.cwd(), relPath);
    writeFileSync(abs, source);
    try {
      let stdout = "";
      try {
        stdout = execFileSync("npx", ["eslint", "--no-ignore", "--format", "json", relPath], {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (err) {
        stdout = (err as { stdout?: string }).stdout ?? "";
      }
      if (!stdout.trim()) throw new Error("eslint produced no output — the probe did not run");
      const results = JSON.parse(stdout) as Array<{ messages: LintMessage[] }>;
      return results.flatMap((r) => r.messages);
    } finally {
      rmSync(abs, { force: true });
    }
  }

  // Every directory/extension combination the detector actually contains.
  // lib/*.tsx exists today (lang.tsx, richText.tsx), so it is not hypothetical.
  const COVERED = [
    "lib/__privacy_probe__.ts",
    "lib/__privacy_probe__.tsx",
    "app/__privacy_probe__.ts",
    "app/__privacy_probe__.tsx",
    "components/__privacy_probe__.ts",
    "components/__privacy_probe__.tsx",
  ];

  for (const relPath of COVERED) {
    it(`covers ${relPath}`, () => {
      const found = privacyViolations(
        lintInRepo(relPath, `import * as x from "node:dns";\nexport const y = x;\n`),
      );
      expect(found.length, `${relPath} is not covered by the config's files globs`).toBeGreaterThan(0);
    });
  }
});

describe("the rule explains itself and does not over-reach", () => {
  it("says why, so silencing it requires a deliberate decision", () => {
    const found = privacyViolations(lint(`import * as x from "node:dns";\nexport const y = x;\n`, "probe.ts"));
    expect(found.some((m) => m.message.includes("never-visit-a-submitted-URL"))).toBe(true);
  });

  it("still allows the non-network builtins the app legitimately uses", () => {
    // crypto backs report IDs and the inbound webhook's timing-safe compare;
    // path resolves the OCR language data. Banning Node wholesale would break
    // real code and invite a blanket disable comment.
    //
    // The positive assertion first: this file must actually have been linted,
    // otherwise "no violations" is meaningless.
    const messages = lint(
      `import { randomBytes } from "crypto";\n` +
        `import path from "path";\n` +
        `import { readFileSync } from "node:fs";\n` +
        `export const y = [randomBytes, path, readFileSync];\n`,
      "probe.ts",
    );
    const control = privacyViolations(lint(`import * as x from "node:dns";\nexport const y = x;\n`, "probe.ts"));
    expect(control.length, "control probe did not fire — the harness is broken").toBeGreaterThan(0);

    expect(privacyViolations(messages)).toEqual([]);
  });
});
