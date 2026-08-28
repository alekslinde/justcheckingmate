import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { writeFileSync, rmSync } from "fs";
import path from "path";

// The eslint half of the privacy invariant.
//
// __tests__/privacyInvariant.test.ts enforces "a submitted URL is never
// visited" behaviourally, but it can only intercept global fetch — module
// mocking cannot reach a dynamic import inside already-loaded production code,
// so a leak through node:dns or node:net passes every test there. The route
// contract names "an outbound HTTP request, DNS lookup, or socket connection";
// the lint rule in eslint.config.mjs covers the two the test cannot.
//
// A lint rule only protects anything while it is configured, so this asserts it
// actually fires rather than trusting the config to stay put. Run against a
// throwaway file so the check is real rather than a read of the config object.

const PROBE = path.join(process.cwd(), "lib", "__eslint_probe__.ts");

function lintViolationsFor(source: string): string {
  writeFileSync(PROBE, source);
  try {
    execFileSync("npx", ["eslint", "--no-ignore", "--format", "json", PROBE], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    return "";
  } catch (err) {
    // eslint exits non-zero when it reports errors; the JSON is on stdout.
    const out = (err as { stdout?: string }).stdout ?? "";
    return out;
  } finally {
    rmSync(PROBE, { force: true });
  }
}

describe("the detector cannot import Node's network modules", () => {
  // Each of these is a way to reach the network that global-fetch interception
  // in privacyInvariant.test.ts would not see.
  for (const mod of ["dns", "node:dns", "net", "node:net", "https", "node:https", "tls", "node:tls"]) {
    it(`rejects importing ${mod} from lib/`, () => {
      const output = lintViolationsFor(`import * as x from "${mod}";\nexport const y = x;\n`);
      expect(output, `importing ${mod} was not flagged`).toContain("no-restricted-imports");
    });
  }

  it("explains why, so the rule is not silenced without a decision", () => {
    const output = lintViolationsFor(`import * as x from "node:dns";\nexport const y = x;\n`);
    expect(output).toContain("never-visit-a-submitted-URL");
  });

  it("still allows the non-network builtins the app legitimately uses", () => {
    // crypto backs report IDs and the inbound webhook's timing-safe compare;
    // path resolves the OCR language data. Banning Node wholesale would break
    // real code and invite a blanket disable comment.
    const output = lintViolationsFor(
      `import { randomBytes } from "crypto";\n` +
        `import path from "path";\n` +
        `import { readFileSync } from "node:fs";\n` +
        `export const y = [randomBytes, path, readFileSync];\n`,
    );
    expect(output).not.toContain("no-restricted-imports");
  });
});
