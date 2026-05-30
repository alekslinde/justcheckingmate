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
  getPublicReportsCount,
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
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
    };
    await storeReport(report, false);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining("INSERT INTO reports") })
    );
  });

  it("includes scam identifier fields in the INSERT args", async () => {
    // First call is the COUNT query; second is the INSERT
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT → 0 existing

    const report = {
      id: "RPT-IDS001",
      type: "sms",
      content: "Your parcel is ready",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
      scamUrl:   "https://au-post.fake/track",
      scamPhone: "+61412345678",
      scamEmail: "noreply@fake-ato.com",
    };
    await storeReport(report, false);

    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].args).toContain("https://au-post.fake/track");
    expect(insertCall[0].args).toContain("+61412345678");
    expect(insertCall[0].args).toContain("noreply@fake-ato.com");
  });

  it("sets report_count to 1 for the first report with a given identifier", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT → no existing match

    const report = {
      id: "RPT-FIRST",
      type: "url",
      content: "https://evil.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
      scamUrl: "https://evil.com",
      scamPhone: "",
      scamEmail: "",
    };
    await storeReport(report, false);

    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].args).toContain(1); // report_count = 1
  });

  it("increments count and updates existing rows when the identifier matches", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 2 }] }); // COUNT → 2 existing

    const report = {
      id: "RPT-MATCH",
      type: "url",
      content: "https://evil.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
      scamUrl: "https://evil.com",
      scamPhone: "",
      scamEmail: "",
    };
    await storeReport(report, false);

    // Should have UPDATEd existing reports with count = 3
    const updateCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("UPDATE reports SET report_count")
    )!;
    expect(updateCall[0].args).toContain(3);

    // INSERT should carry the same count
    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].args).toContain(3);
  });

  it("skips count logic entirely for suspect reports", async () => {
    const report = {
      id: "RPT-SUSP2",
      type: "url",
      content: "https://evil.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
      scamUrl: "https://evil.com",
      scamPhone: "",
      scamEmail: "",
    };
    await storeReport(report, true); // suspect

    const countCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("SELECT COUNT(*)")
    );
    expect(countCall).toBeUndefined();
  });

  it("uses scam_phone as identifier when scam_url is empty", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT for phone

    const report = {
      id: "RPT-PHONE",
      type: "phone",
      content: "+61412345678",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      ip: "1.2.3.4",
      scamUrl: "",
      scamPhone: "+61412345678",
      scamEmail: "",
    };
    await storeReport(report, false);

    const countCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("SELECT COUNT(*)")
    )!;
    expect(countCall[0].sql).toContain("scam_phone");
    expect(countCall[0].args).toContain("+61412345678");
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
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
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
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
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
  const baseRow = {
    id: "RPT-ABCD1234",
    type: "url",
    content: "https://scam.com",
    description: "Very dodgy",
    submitted_at: 1700000000000,
    scam_url: "",
    scam_phone: "",
    scam_email: "",
    report_count: 1,
  };

  it("returns mapped public report objects", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [baseRow] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      id: "RPT-ABCD1234",
      type: "url",
      // content is passed through defangText — URLs are defanged; stripTrackingParams
      // normalises bare domains to include a trailing slash
      content: "hxtps://scam[.]com/",
      submittedAt: 1700000000000,
    });
  });

  it("applies defangText to content", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, content: "Click: https://evil.com/phish and also http://bad.tk" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].content).not.toContain("https://");
    expect(reports[0].content).toContain("hxtps://evil[.]com/phish");
    expect(reports[0].content).toContain("hxtp://bad[.]tk");
  });

  it("applies PII scrubbing to the description", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{
        ...baseRow,
        id: "RPT-PII0001",
        type: "sms",
        content: "scam sms",
        description: "Called from 0412 345 678 asking for my TFN",
      }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].description).not.toContain("0412 345 678");
    expect(reports[0].description).toContain("[phone removed]");
  });

  it("defangs scam_url in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_url: "https://fake-ato.xyz/verify" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamUrl).toBe("hxtps://fake-ato[.]xyz/verify");
  });

  it("defangs scam_email in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_email: "phish@fake-ato.com" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamEmail).toBe("phish[@]fake-ato[.]com");
  });

  it("applies defangPhone to scam_phone in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_phone: "+61412345678" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    // Strip invisible characters; the visible digits must be intact
    const visible = reports[0].scamPhone.replace(/[^\x20-\x7E]/g, "");
    expect(visible).toBe("+61412345678");
    // Invisible joiners were inserted
    expect(reports[0].scamPhone.length).toBeGreaterThan("+61412345678".length);
  });

  it("returns empty strings for missing identifier columns", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [baseRow] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamUrl).toBe("");
    expect(reports[0].scamPhone).toBe("");
    expect(reports[0].scamEmail).toBe("");
  });

  it("passes the limit option to the query", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ limit: 5 });
    const call = mockExecute.mock.calls[0][0] as { args: unknown[] };
    expect(call.args).toContain(5);
  });

  it("maps report_count to matchCount", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, report_count: 7 }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].matchCount).toBe(7);
  });

  it("defaults matchCount to 1 when report_count column is absent", async () => {
    const { report_count: _, ...rowWithoutCount } = baseRow;
    const mockExecute = vi.fn().mockResolvedValue({ rows: [rowWithoutCount] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].matchCount).toBe(1);
  });

  it("orders by report_count DESC for sort='most'", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ sort: "most" });
    const { sql } = mockExecute.mock.calls[0][0] as { sql: string };
    expect(sql).toContain("report_count DESC");
  });

  it("orders by report_count ASC for sort='least'", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ sort: "least" });
    const { sql } = mockExecute.mock.calls[0][0] as { sql: string };
    expect(sql).toContain("report_count ASC");
  });

  it("includes search term as LIKE parameters when provided", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ search: "fake-ato" });
    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("LIKE ?");
    expect(call.args).toContain("%fake-ato%");
  });

  it("searches across content, scam_url, scam_phone, and scam_email", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ search: "evil" });
    const { sql, args } = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(sql).toContain("content LIKE ?");
    expect(sql).toContain("scam_url LIKE ?");
    expect(sql).toContain("scam_phone LIKE ?");
    expect(sql).toContain("scam_email LIKE ?");
    // Same search term passed for each column
    expect(args.filter((a) => a === "%evil%")).toHaveLength(4);
  });

  it("omits the search clause when search is empty or whitespace", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ search: "   " });
    const { sql } = mockExecute.mock.calls[0][0] as { sql: string };
    expect(sql).not.toContain("LIKE");
  });
});

// ── getPublicReportsCount with search ─────────────────────────────────────────

describe("getPublicReportsCount", () => {
  it("includes search term in the WHERE clause", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [{ n: 3 }] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const count = await getPublicReportsCount({ search: "scam" });
    expect(count).toBe(3);
    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("LIKE ?");
    expect(call.args).toContain("%scam%");
  });

  it("returns the total without search when search is absent", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [{ n: 42 }] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const count = await getPublicReportsCount();
    expect(count).toBe(42);
    const call = mockExecute.mock.calls[0][0] as { sql: string };
    expect(call.sql).not.toContain("LIKE");
  });
});
