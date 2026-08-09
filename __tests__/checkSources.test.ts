// Tests for the threat-intel source registry and its checker.
//
// Two things are worth protecting here:
//   1. The hand-rolled parser. It is dependency-free, so nothing else catches a
//      shape it silently misreads — and a parser that drops half the registry
//      still "passes" a reachability run.
//   2. The indicator quarantine. Scam domains recorded as evidence must never be
//      promoted into a source tier, because the checker fetches source tiers.
//
// Network reachability is deliberately NOT tested — that is what the weekly
// workflow does, and asserting on live sites would make this suite flaky.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error — plain .mjs script, no type declarations
import { parseRegistry, validate } from "../scripts/check-sources.mjs";

const REGISTRY_PATH = resolve(__dirname, "../docs/threat-intel/sources.yml");
const registryText = readFileSync(REGISTRY_PATH, "utf8");

type Entry = {
  domain?: string;
  url?: string;
  name?: string;
  note?: string;
  trust?: string;
  feed?: string;
  check?: string;
  retired?: string;
  expect?: string;
};
type Registry = {
  version: string;
  updated: string;
  tiers: Record<string, Entry[]>;
  brands: Entry[];
  indicators: string[];
};

const reg: Registry = parseRegistry(registryText);
const allSources = [...Object.values(reg.tiers).flat(), ...reg.brands];

describe("registry parsing", () => {
  it("reads the header scalars", () => {
    expect(reg.version).toBe("1");
    expect(reg.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("finds all three tiers plus brands and indicators", () => {
    expect(Object.keys(reg.tiers).sort()).toEqual(["1", "2", "3"]);
    expect(reg.brands.length).toBeGreaterThan(0);
    expect(reg.indicators.length).toBeGreaterThan(0);
  });

  it("parses a plausible number of sources", () => {
    // Guards the failure mode where a parser change silently drops entries and
    // the run still reports "all OK".
    expect(allSources.length).toBeGreaterThan(90);
  });

  it("gives every source a domain and an https url", () => {
    for (const s of allSources) {
      expect(s.domain, `entry missing domain: ${JSON.stringify(s)}`).toBeTruthy();
      expect(s.url, `${s.domain} missing url`).toBeTruthy();
      expect(s.url!.startsWith("https://"), `${s.domain} is not https`).toBe(true);
    }
  });

  it("folds multi-line >- notes into a single line", () => {
    const scamwatch = reg.tiers["1"].find((s) => s.domain === "scamwatch.gov.au");
    expect(scamwatch?.note).toContain("Highest-value source");
    expect(scamwatch?.note).toContain("27 citations");
    expect(scamwatch?.note).not.toContain("\n");
  });

  it("does not leak the next key into a folded note", () => {
    // The folded-scalar terminator is indentation-based; a bug there swallows
    // the following `region:`/`- domain:` line into the note text.
    for (const s of allSources) {
      if (!s.note) continue;
      expect(s.note, `${s.domain} note absorbed a key`).not.toMatch(/\b(domain|url|feed|region):\s/);
    }
  });

  it("treats indicators as bare strings, not entries", () => {
    for (const i of reg.indicators) {
      expect(typeof i).toBe("string");
      expect(i).not.toContain(":");
    }
  });
});

describe("registry validity", () => {
  it("passes its own validator", () => {
    expect(validate(reg)).toEqual([]);
  });

  it("has no domain in two tiers at once", () => {
    const seen = new Set<string>();
    for (const s of allSources) {
      expect(seen.has(s.domain!), `${s.domain} listed twice`).toBe(false);
      seen.add(s.domain!);
    }
  });

  it("marks every tier 3 source as low trust", () => {
    for (const s of reg.tiers["3"]) {
      expect(s.trust, `${s.domain} in tier 3 without trust: low`).toBe("low");
    }
  });

  it("gives each source either a feed or an explicit manual check", () => {
    for (const s of allSources) {
      // Brands are reference pages, checked for reachability only.
      if (reg.brands.includes(s)) continue;
      expect(
        Boolean(s.feed) || s.check === "manual",
        `${s.domain} has neither feed: nor check: manual`,
      ).toBe(true);
    }
  });
});

describe("indicator quarantine", () => {
  it("keeps known scam domains out of every source tier", () => {
    const indicators = new Set(reg.indicators.map((d) => d.toLowerCase()));
    for (const s of allSources) {
      const host = new URL(s.url!).hostname.toLowerCase().replace(/^www\./, "");
      expect(indicators.has(host), `${host} is an indicator but appears as a source`).toBe(false);
      expect(indicators.has(s.domain!.toLowerCase()), `${s.domain} is an indicator`).toBe(false);
    }
  });

  it("still records the indicators seen in the roadmaps", () => {
    // These are quoted as evidence in the archive; losing them would let one be
    // re-added as a source later.
    expect(reg.indicators).toContain("swyftx-account.xyz");
    expect(reg.indicators).toContain("coinspot-verify.top");
    expect(reg.indicators).toContain("ato-gov-au.github.io");
  });

  it("fails validation when an indicator is promoted to a source", () => {
    const poisoned: Registry = {
      ...reg,
      tiers: {
        ...reg.tiers,
        1: [
          ...reg.tiers["1"],
          { domain: "coinspot-verify.top", url: "https://coinspot-verify.top", name: "oops" },
        ],
      },
    };
    const errors = validate(poisoned);
    expect(errors.some((e: string) => e.startsWith("SAFETY:"))).toBe(true);
  });

  it("rejects a source with a non-https url", () => {
    const bad: Registry = {
      ...reg,
      brands: [...reg.brands, { domain: "example.test", url: "http://example.test" }],
    };
    expect(validate(bad).some((e: string) => e.includes("must be https"))).toBe(true);
  });
});

describe("lookalike discipline", () => {
  it("keeps the Scamwatch impersonator flagged and untrusted", () => {
    // scamwatchhq.com is NOT the ACCC. It is kept on purpose so the name
    // collision stays documented — but it must never drift up a tier.
    const hq = reg.tiers["3"].find((s) => s.domain === "scamwatchhq.com");
    expect(hq, "scamwatchhq.com should stay in tier 3 as a documented lookalike").toBeTruthy();
    expect(hq!.trust).toBe("low");
    expect(hq!.note).toMatch(/NOT Scamwatch/i);
    expect(hq!.note).toMatch(/do not cite/i);
  });

  it("keeps the real Scamwatch in tier 1", () => {
    expect(reg.tiers["1"].some((s) => s.domain === "scamwatch.gov.au")).toBe(true);
  });

  it("explains every expect: blocked source", () => {
    // `expect: blocked` suppresses the DEAD verdict for a source, so it can hide
    // real rot. It must always carry a reason.
    for (const s of allSources) {
      if (s.expect !== "blocked") continue;
      expect(s.note, `${s.domain} is expect: blocked without a note`).toBeTruthy();
      expect(s.note).toMatch(/block|bot|403|protection/i);
    }
  });

  it("does not let expect: blocked spread widely", () => {
    // A handful is bot protection; many would mean the checker has stopped
    // actually checking anything.
    const blocked = allSources.filter((s) => s.expect === "blocked");
    expect(blocked.length).toBeLessThanOrEqual(5);
  });

  it("keeps retired sources marked and explained", () => {
    for (const s of allSources) {
      if (s.retired !== "true") continue;
      expect(s.note, `${s.domain} is retired without a note explaining why`).toBeTruthy();
      expect(s.name).toMatch(/DEFUNCT|RETIRED/i);
    }
  });
});
