import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Guards the import structure that makes the detection engine extractable into
// its own package (roadmap Phase 0). Both invariants held by construction once
// and regressed silently, so they are asserted rather than assumed.

const LIB = path.join(process.cwd(), "lib");

function importsOf(file: string): string[] {
  const src = readFileSync(path.join(LIB, file), "utf8");
  return [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("engine import structure", () => {
  it("keeps detectType off scamDetector, so the two do not form a cycle", () => {
    // detectType classifies input for the scorer; the scorer calls detectType.
    // If detectType imports the scorer back, the cycle returns.
    expect(importsOf("detectType.ts").some((i) => i.includes("scamDetector"))).toBe(false);
  });

  it("keeps the shared types module free of engine imports", () => {
    // engineTypes.ts is the cycle-breaker. It may reference sibling types, but
    // importing the scorer would defeat the point.
    expect(importsOf("engineTypes.ts").some((i) => i.includes("scamDetector"))).toBe(false);
  });

  it("keeps Next.js out of the engine's module closure", () => {
    // The engine must stay portable — a Next import anywhere in this closure is
    // what would block bundling it into an extension or a worker.
    const closure = [
      "scamDetector.ts", "detectType.ts", "engineTypes.ts", "urlSanitizer.ts",
      "emailHeaders.ts", "phoneIntel.ts", "urlExpander.ts",
      "regions/index.ts", "regions/base.ts", "regions/types.ts",
    ];
    for (const file of closure) {
      const offenders = importsOf(file).filter((i) => i === "next" || i.startsWith("next/"));
      expect(offenders, `${file} imports Next.js`).toEqual([]);
    }
  });
});
