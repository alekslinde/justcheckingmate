import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer before importing anything that uses it
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import {
  checkAndRecordRateLimit,
  isRecentDuplicate,
  generateReportId,
  storeReport,
  incrementCheckCount,
  getStats,
  getPublicReports,
} from "@/lib/reportStore";
import { getDb } from "@/lib/db";

// ── checkAndRecordRateLimit ───────────────────────────────────────────────────

describe("checkAndRecordRateLimit", () => {
  it("allows the first request for a new IP", () => {
    expect(checkAndRecordRateLimit("ip-allow-1")).toBe(true);
  });

  it("allows up to 4 requests within the window", () => {
    const ip = "ip-allow-4";
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
  });

  it("blocks the 5th request from the same IP within the window", () => {
    const ip = "ip-block-5th";
    for (let i = 0; i < 4; i++) checkAndRecordRateLimit(ip);
    expect(checkAndRecordRateLimit(ip)).toBe(false);
  });

  it("allows requests again after the rate window expires", () => {
    const ip = "ip-expiry";
    const realNow = Date.now();

    // Fill up 4 slots
    for (let i = 0; i < 4; i++) checkAndRecordRateLimit(ip);
    expect(checkAndRecordRateLimit(ip)).toBe(false);

    // Advance time past the 10-minute window
    vi.spyOn(Date, "now").mockReturnValue(realNow + 601_000);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    vi.restoreAllMocks();
  });

  it("treats different IPs independently", () => {
    for (let i = 0; i < 4; i++) checkAndRecordRateLimit("ip-indep-a");
    expect(checkAndRecordRateLimit("ip-indep-a")).toBe(false);
    expect(checkAndRecordRateLimit("ip-indep-b")).toBe(true);
  });
});

// ── isRecentDuplicate ─────────────────────────────────────────────────────────

describe("isRecentDuplicate", () => {
  it("returns false for a new submission", () => {
    expect(isRecentDuplicate("url", "https://unique-url-abc123.com")).toBe(false);
  });

  it("returns true when the same type+content is submitted again", () => {
    const content = "duplicate-content-xyz789";
    isRecentDuplicate("sms", content); // first: registers it
    expect(isRecentDuplicate("sms", content)).toBe(true);
  });

  it("normalises whitespace before comparing", () => {
    const base = "some   sms   content";
    const normalised = "some sms content";
    isRecentDuplicate("sms", normalised);
    expect(isRecentDuplicate("sms", base)).toBe(true);
  });

  it("treats the same content under different types as distinct", () => {
    const content = "shared-content-type-test";
    isRecentDuplicate("url", content);
    expect(isRecentDuplicate("sms", content)).toBe(false);
  });

  it("is case-insensitive", () => {
    isRecentDuplicate("email", "UPPER CASE CONTENT");
    expect(isRecentDuplicate("email", "upper case content")).toBe(true);
  });

  it("only uses the first 200 chars of content for the key", () => {
    const base = "x".repeat(200);
    isRecentDuplicate("custom", base + "ignored-suffix");
    expect(isRecentDuplicate("custom", base + "different-suffix")).toBe(true);
  });
});

// ── generateReportId ──────────────────────────────────────────────────────────

describe("generateReportId", () => {
  it("returns a string matching RPT-XXXXXXXX (8 uppercase hex chars)", () => {
    const id = generateReportId();
    expect(id).toMatch(/^RPT-[0-9A-F]{8}$/);
  });

  it("returns a different ID on each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateReportId()));
    expect(ids.size).toBe(20);
  });
});

// ── storeReport ───────────────────────────────────────────────────────────────

describe("storeReport", () => {
  const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

  beforeEach(() => {
    mockExecute.mockClear();
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);
  });

  it("inserts the report row", async () => {
    const report = {
      id: "RPT-TESTID",
      type: "url",
      content: "https://evil.com",
      description: "Looks dodgy",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
    };
    await storeReport(report, false);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining("INSERT INTO reports") })
    );
  });

  it("increments the reports counter for legitimate (non-suspect) reports", async () => {
    const report = {
      id: "RPT-LEGIT01",
      type: "sms",
      content: "scam text",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
    };
    await storeReport(report, false);
    const calls = mockExecute.mock.calls.map((c) => c[0]);
    expect(calls.some((c: { sql?: string }) => c?.sql?.includes("UPDATE counters"))).toBe(true);
  });

  it("does NOT increment the counter for suspect reports", async () => {
    const report = {
      id: "RPT-SUSPECT",
      type: "url",
      content: "https://maybe-scam.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
    };
    await storeReport(report, true);
    const calls = mockExecute.mock.calls.map((c) => c[0]);
    expect(calls.some((c: { sql?: string }) => c?.sql?.includes("UPDATE counters"))).toBe(false);
  });
});

// ── incrementCheckCount ───────────────────────────────────────────────────────

describe("incrementCheckCount", () => {
  it("executes an UPDATE on the checks counter", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await incrementCheckCount();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE counters"),
      })
    );
    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("checks");
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe("getStats", () => {
  it("returns checks and reports from the database", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        { name: "checks", value: 42 },
        { name: "reports", value: 17 },
      ],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const stats = await getStats();
    expect(stats).toEqual({ checks: 42, reports: 17 });
  });

  it("defaults missing counters to 0", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const stats = await getStats();
    expect(stats).toEqual({ checks: 0, reports: 0 });
  });
});

// ── getPublicReports ──────────────────────────────────────────────────────────

describe("getPublicReports", () => {
  it("returns mapped public report objects", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "RPT-ABCD1234",
          type: "url",
          content: "https://scam.com",
          description: "Very dodgy",
          submitted_at: 1700000000000,
        },
      ],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      id: "RPT-ABCD1234",
      type: "url",
      content: "https://scam.com",
      submittedAt: 1700000000000,
    });
  });

  it("applies PII scrubbing to the description", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "RPT-PII0001",
          type: "sms",
          content: "scam sms",
          description: "Called from 0412 345 678 asking for my TFN",
          submitted_at: 1700000000000,
        },
      ],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].description).not.toContain("0412 345 678");
    expect(reports[0].description).toContain("[phone removed]");
  });

  it("passes the limit argument to the query", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports(5);
    const call = mockExecute.mock.calls[0][0] as { args: unknown[] };
    expect(call.args).toContain(5);
  });
});
