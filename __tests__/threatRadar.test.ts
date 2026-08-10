import { describe, it, expect } from "vitest";
import {
  radarForRegion,
  hasRadar,
  threatsByStatus,
  activeThreats,
  lastUpdated,
  isWellFormedDate,
  formatRadarDate,
  type ThreatEntry,
} from "@/lib/threatRadar";
import { supportedRegions } from "@/lib/regions";
import enNormal from "@/messages/en.normal.json";

const AU = radarForRegion("AU");

describe("radarForRegion", () => {
  it("returns authored entries for AU", () => {
    expect(AU.length).toBeGreaterThan(0);
    expect(hasRadar("AU")).toBe(true);
  });

  it("returns an empty list for regions with no authored radar", () => {
    // Deliberate: an unauthored region renders nothing rather than inheriting
    // Australian campaigns. Same contract as calendarForRegion.
    for (const code of supportedRegions().filter((c) => c !== "AU")) {
      expect(radarForRegion(code)).toEqual([]);
      expect(hasRadar(code)).toBe(false);
      expect(lastUpdated(code)).toBeNull();
    }
  });
});

describe("authoring invariants", () => {
  it("has unique ids", () => {
    const ids = AU.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has well-formed firstSeen and lastSeen dates", () => {
    // lastUpdated() orders these by string comparison, which is only valid for
    // zero-padded fixed-width dates — "2026-8-9" would sort before "2026-08-02"
    // and report the wrong "as at" date on the page.
    for (const threat of AU) {
      expect(isWellFormedDate(threat.firstSeen), `${threat.id} firstSeen`).toBe(true);
      expect(isWellFormedDate(threat.lastSeen), `${threat.id} lastSeen`).toBe(true);
    }
  });

  it("never records a lastSeen before its firstSeen", () => {
    for (const threat of AU) {
      expect(threat.lastSeen >= threat.firstSeen, `${threat.id}`).toBe(true);
    }
  });

  it("cites a roadmap that exists in docs/threat-intel", async () => {
    // The roadmap link is the whole provenance claim — an entry citing a sweep
    // that doesn't exist is an unsourced assertion presented as a sourced one.
    const { existsSync } = await import("node:fs");
    for (const threat of AU) {
      const path = `docs/threat-intel/${threat.roadmap}-threat-roadmap.md`;
      expect(existsSync(path), `${threat.id} cites missing ${path}`).toBe(true);
    }
  });

  it("carries non-empty copy on every entry", () => {
    for (const threat of AU) {
      expect(threat.title.length, threat.id).toBeGreaterThan(0);
      expect(threat.summary.length, threat.id).toBeGreaterThan(0);
      expect(threat.advice.length, threat.id).toBeGreaterThan(0);
      expect(threat.lures.length, threat.id).toBeGreaterThan(0);
    }
  });

  it("describes detection exactly when there is detection to describe", () => {
    // The pairing the UI depends on: `covered`/`partial` render `detection`,
    // while `none`/`n/a` fall back to a fixed line. A covered entry with no
    // sentence would render an empty claim; an uncovered one carrying a
    // sentence would contradict its own badge.
    for (const threat of AU) {
      const shouldDescribe = threat.coverage === "covered" || threat.coverage === "partial";
      expect(Boolean(threat.detection), `${threat.id} (${threat.coverage})`).toBe(shouldDescribe);
    }
  });

  it("has a message key for every channel and coverage value used", () => {
    // These are interpolated into MessageKey lookups at render, so an unmapped
    // value renders the raw key to the user rather than failing loudly.
    const keys = new Set(Object.keys(enNormal));
    for (const threat of AU) {
      expect(keys.has(`radar.channel.${threat.channel}`), threat.channel).toBe(true);
      const coverageKey =
        threat.coverage === "n/a" ? "radar.coverage.na" : `radar.coverage.${threat.coverage}`;
      expect(keys.has(coverageKey), threat.coverage).toBe(true);
    }
  });
});

describe("threatsByStatus", () => {
  it("partitions the region's entries with nothing lost or duplicated", () => {
    const active = threatsByStatus("AU", "active");
    const watchlist = threatsByStatus("AU", "watchlist");
    const subsided = threatsByStatus("AU", "subsided");

    // The UI renders exactly these three groups, so an entry with a status
    // outside the union would silently vanish from the page.
    expect(active.length + watchlist.length + subsided.length).toBe(AU.length);
  });

  it("only marks recently-confirmed entries as active", () => {
    // Guards the authoring rule on RadarStatus. "Circulating now" stops meaning
    // anything once it covers everything we have ever recorded — the first draft
    // marked 21 of 24 entries active, which taught the reader nothing.
    //
    // The two exceptions are standing tactics rather than campaigns: they run
    // continuously and so stop being re-reported, which is a fact about the
    // reporting cadence and not about the risk.
    const PERSISTENT = new Set(["hi-mum", "voice-clone-family"]);

    const sweeps = [...new Set(AU.map((t) => t.lastSeen))].sort().slice(-2);
    for (const threat of threatsByStatus("AU", "active")) {
      if (PERSISTENT.has(threat.id)) continue;
      expect(sweeps.includes(threat.lastSeen), `${threat.id} last seen ${threat.lastSeen}`).toBe(true);
    }
  });

  it("keeps active a minority of the board", () => {
    // The distribution is the signal. If most of the radar is "circulating now",
    // the grouping has collapsed back into one undifferentiated list.
    const active = threatsByStatus("AU", "active").length;
    expect(active).toBeLessThan(AU.length * 0.75);
  });

  it("returns entries in authored order", () => {
    const active = threatsByStatus("AU", "active");
    const expected = AU.filter((t) => t.status === "active");
    expect(active.map((t) => t.id)).toEqual(expected.map((t) => t.id));
  });

  it("activeThreats matches the active partition", () => {
    expect(activeThreats("AU")).toEqual(threatsByStatus("AU", "active"));
  });

  it("returns an empty list for an unauthored region", () => {
    expect(threatsByStatus("GB", "active")).toEqual([]);
    expect(activeThreats("GB")).toEqual([]);
  });
});

describe("lastUpdated", () => {
  it("returns the latest lastSeen across the region's entries", () => {
    const expected = AU.map((t) => t.lastSeen).sort().at(-1);
    expect(lastUpdated("AU")).toBe(expected);
  });

  it("is derived rather than pinned, so it moves with the entries", () => {
    // Guards the reason this is a function and not a constant: a hand-maintained
    // date drifts the moment an entry is added without touching it, and a stale
    // date on a page about what's current is worse than no date at all.
    const latest = lastUpdated("AU")!;
    expect(AU.some((t) => t.lastSeen === latest)).toBe(true);
    expect(AU.every((t) => t.lastSeen <= latest)).toBe(true);
  });
});

describe("isWellFormedDate", () => {
  it("accepts real zero-padded dates", () => {
    expect(isWellFormedDate("2026-08-09")).toBe(true);
    expect(isWellFormedDate("2024-02-29")).toBe(true);
  });

  it("rejects unpadded, malformed and impossible dates", () => {
    for (const bad of [
      "2026-8-9",
      "2026-08-9",
      "26-08-09",
      "2026/08/09",
      "2026-13-01",
      "2026-02-30",
      "2025-02-29",
      "",
      "not a date",
    ]) {
      expect(isWellFormedDate(bad), bad).toBe(false);
    }
  });
});

describe("formatRadarDate", () => {
  it("formats an ISO date without timezone drift", () => {
    // Parsed from the string parts rather than through Date, so a runner behind
    // UTC can't render 9 August as the 8th.
    expect(formatRadarDate("2026-08-09")).toBe("9 August 2026");
    expect(formatRadarDate("2026-01-01")).toBe("1 January 2026");
    expect(formatRadarDate("2026-12-31")).toBe("31 December 2026");
  });

  it("returns a malformed value unchanged rather than rendering NaN", () => {
    expect(formatRadarDate("not a date")).toBe("not a date");
    expect(formatRadarDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("scoring independence", () => {
  it("is not imported by the detector", async () => {
    // The radar is educational data. If scamDetector ever imported it, a verdict
    // could move because a campaign was listed — exactly the coupling the module
    // header rules out, and the same guarantee scamCalendar makes.
    const { readFileSync } = await import("node:fs");
    const detector = readFileSync("lib/scamDetector.ts", "utf8");
    expect(detector).not.toContain("threatRadar");
  });
});

describe("ThreatEntry type", () => {
  it("accepts a minimal entry without a detection sentence", () => {
    // Type-level guard: `detection` is optional precisely so `none` and `n/a`
    // entries can omit it.
    const entry: ThreatEntry = {
      id: "test",
      title: "Test",
      channel: "sms",
      status: "active",
      coverage: "none",
      firstSeen: "2026-08-09",
      lastSeen: "2026-08-09",
      summary: "summary",
      lures: ["lure"],
      advice: "advice",
      roadmap: "2026-08-09",
    };
    expect(entry.detection).toBeUndefined();
  });
});
