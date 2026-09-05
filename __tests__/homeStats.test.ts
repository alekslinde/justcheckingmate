import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Invocation cost on the free tier, not correctness.
//
// The homepage is force-dynamic (region comes from request headers), so it runs
// a serverless function per visit regardless. StatsBar used to fetch
// /api/stats on mount, which made that TWO invocations per homepage view. The
// counters are now resolved during the render that was already happening.
//
// These assert the wiring stays in place, because the regression is silent: a
// future edit that drops the prop or makes the fetch unconditional restores the
// second invocation and nothing fails.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("homepage resolves stats server-side", () => {
  it("fetches the counters in the page render", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("getStats");
    expect(page).toContain("stats={stats}");
  });

  it("tolerates the counters being unavailable", () => {
    // A stats widget must never be able to take the check flow down with it.
    const page = read("app/page.tsx");
    expect(page).toMatch(/try\s*{[\s\S]*getStats[\s\S]*}\s*catch/);
  });

  it("skips the client fetch when the server supplied the data", () => {
    // The whole saving. An unconditional fetch here would keep the second
    // invocation and make the prop decorative.
    const bar = read("components/StatsBar.tsx");
    expect(bar).toMatch(/if \(initial\) return;/);
  });

  it("keeps the client fetch as a fallback", () => {
    // Callers that cannot resolve stats server-side still get working numbers
    // rather than a permanently empty bar.
    const bar = read("components/StatsBar.tsx");
    expect(bar).toContain('fetch("/api/stats")');
  });
});
