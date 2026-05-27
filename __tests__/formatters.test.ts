import { describe, it, expect, vi, afterEach } from "vitest";
import { timeAgo, truncate, fmt } from "@/lib/formatters";

// ── timeAgo ───────────────────────────────────────────────────────────────────

describe("timeAgo", () => {
  afterEach(() => vi.restoreAllMocks());

  function now() {
    return Date.now();
  }

  it("returns 'just now' for a timestamp less than 1 minute ago", () => {
    expect(timeAgo(now() - 30_000)).toBe("just now");
  });

  it("returns 'just now' for a timestamp 59 seconds ago", () => {
    expect(timeAgo(now() - 59_000)).toBe("just now");
  });

  it("returns '1m ago' for a timestamp 1 minute ago", () => {
    expect(timeAgo(now() - 60_000)).toBe("1m ago");
  });

  it("returns '5m ago' for a timestamp 5 minutes ago", () => {
    expect(timeAgo(now() - 300_000)).toBe("5m ago");
  });

  it("returns '59m ago' for 59 minutes ago", () => {
    expect(timeAgo(now() - 59 * 60_000)).toBe("59m ago");
  });

  it("returns '1h ago' for exactly 1 hour ago", () => {
    expect(timeAgo(now() - 3_600_000)).toBe("1h ago");
  });

  it("returns '2h ago' for 2 hours ago", () => {
    expect(timeAgo(now() - 2 * 3_600_000)).toBe("2h ago");
  });

  it("returns '23h ago' for 23 hours ago", () => {
    expect(timeAgo(now() - 23 * 3_600_000)).toBe("23h ago");
  });

  it("returns '1d ago' for exactly 24 hours ago", () => {
    expect(timeAgo(now() - 24 * 3_600_000)).toBe("1d ago");
  });

  it("returns '3d ago' for 3 days ago", () => {
    expect(timeAgo(now() - 3 * 24 * 3_600_000)).toBe("3d ago");
  });
});

// ── truncate ──────────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the string unchanged when shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when exactly at max", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when longer than max", () => {
    const result = truncate("hello world", 5);
    expect(result).toMatch(/…$/);
    expect(result.length).toBeLessThanOrEqual(6); // 5 chars + ellipsis char
  });

  it("trims trailing whitespace before the ellipsis", () => {
    expect(truncate("hello   ", 7)).not.toMatch(/\s…$/);
  });

  it("handles max = 0 by returning only the ellipsis", () => {
    expect(truncate("anything", 0)).toBe("…");
  });

  it("handles an empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles a long real-world description", () => {
    const long = "Suspicious SMS received claiming to be from Medicare asking for my details.";
    const result = truncate(long, 30);
    expect(result.endsWith("…")).toBe(true);
    // Length in characters: ≤ 31 (30 chars + ellipsis)
    expect([...result].length).toBeLessThanOrEqual(31);
  });
});

// ── fmt ───────────────────────────────────────────────────────────────────────

describe("fmt", () => {
  it("formats 0 as '0'", () => {
    expect(fmt(0)).toBe("0");
  });

  it("formats single-digit numbers without separator", () => {
    expect(fmt(9)).toBe("9");
  });

  it("formats 999 without separator", () => {
    expect(fmt(999)).toBe("999");
  });

  it("formats 1000 with a comma separator", () => {
    expect(fmt(1000)).toBe("1,000");
  });

  it("formats 10000 with a comma separator", () => {
    expect(fmt(10_000)).toBe("10,000");
  });

  it("formats 1000000 with two comma separators", () => {
    expect(fmt(1_000_000)).toBe("1,000,000");
  });

  it("formats large numbers consistently with en-AU locale", () => {
    // Verify consistency — not just a string match
    expect(fmt(1_234_567)).toBe((1_234_567).toLocaleString("en-AU"));
  });
});
