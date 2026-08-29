import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
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

// Every case here spawns `npx eslint`, which costs ~1.7s warm and noticeably
// more on a cold runner while npx resolves and eslint boots. Vitest's 5s
// default was enough locally but not in CI, where the first test timed out at
// 5208ms while every later one passed in ~1700ms — a flake, not a failure.
// Scoped to this file: a slow subprocess test should not license slow tests
// everywhere else.
vi.setConfig({ testTimeout: 30_000 });

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

// ── Scope, not just rule bodies ───────────────────────────────────────────────
//
// Everything above re-declares the rules against a temp path, which proves the
// rule *bodies* behave but says nothing about whether the project config still
// points them at the engine. Extracting the engine to packages/engine broke
// exactly that: the `files` globs listed lib/, app/ and components/, so the
// rules silently stopped covering the one module they exist for, and lint went
// on passing. A scope that no longer matches the code is indistinguishable from
// a scope that finds nothing.
//
// These run the *real* project config against a probe written into the engine's
// own directory, so the assertion is "the shipped configuration protects this
// path" rather than "the rule works somewhere".
describe("the project config covers the engine's real location", () => {
  // The probe goes in a scratch directory *beside* the package, never inside
  // packages/engine/src. That directory is walked by
  // engineDependencies.test.ts (readdirSync then readFileSync on each entry),
  // and vitest runs test files in parallel by default — a probe that exists at
  // listing time and is deleted before the read throws ENOENT there. The first
  // version of this block did exactly that, so the guard against one config
  // mistake introduced a flake in an unrelated suite.
  //
  // Placing it under packages/ still exercises what matters: the eslint `files`
  // glob is "packages/**/*.{ts,tsx}", so this path is covered if and only if
  // the engine's is. Any path the scope test could use that is *not* covered by
  // the same glob would prove nothing.
  const PROBE_DIR = path.join(process.cwd(), "packages", "__lint_scope_probe");

  function lintInPlace(source: string): LintMessage[] {
    mkdirSync(PROBE_DIR, { recursive: true });
    const probe = path.join(PROBE_DIR, "probe.ts");
    writeFileSync(probe, source);
    try {
      let stdout = "";
      try {
        stdout = execFileSync("npx", ["eslint", "--format", "json", probe], {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        // eslint exits non-zero when it reports errors; the JSON is still on stdout.
        stdout = (err as { stdout?: string }).stdout ?? "";
      }

      // Same guard the helpers above carry. Without it a harness failure — npx
      // unresolved, config error, eslint crash — surfaces as "Unexpected end of
      // JSON input" from the one test proving the privacy rules still reach the
      // engine, which is the worst place to have to guess at a cause.
      if (!stdout.trim()) throw new Error("eslint produced no output — the probe did not run");

      const results = JSON.parse(stdout) as Array<{ messages: LintMessage[] }>;
      return results.flatMap((r) => r.messages);
    } finally {
      // Remove the whole directory: an interrupted run must not strand a
      // rule-violating file that breaks the next lint and is committable.
      rmSync(PROBE_DIR, { recursive: true, force: true });
    }
  }

  it("covers the same glob that covers the engine", () => {
    // Asserts the premise the other two rest on. If the probe path stopped
    // matching the same `files` entry as packages/engine/src, those tests would
    // pass or fail for reasons unrelated to the engine's protection.
    const config = readFileSync(path.join(process.cwd(), "eslint.config.mjs"), "utf8");
    expect(config).toContain('"packages/**/*.{ts,tsx}"');
  });

  it("flags a network import inside packages/", () => {
    const found = privacyViolations(lintInPlace(`import dns from "node:dns";\nexport const x = dns;\n`));
    expect(
      found.length,
      "the privacy rules do not cover packages/ — check the `files` globs in eslint.config.mjs",
    ).toBeGreaterThan(0);
  });

  it("flags a dynamic network import inside packages/", () => {
    const found = privacyViolations(
      lintInPlace(`export async function f() { return import("node:net"); }\n`),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it("leaves legitimate imports alone", () => {
    expect(
      privacyViolations(
        lintInPlace(`import { parsePhoneNumber } from "libphonenumber-js/max";\nexport const x = parsePhoneNumber;\n`),
      ),
    ).toEqual([]);
  });
});
