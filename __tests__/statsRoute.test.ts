import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/reportStore", () => ({
  getStats: vi.fn(),
  getCheckEvents: vi.fn(),
}));

import { GET } from "@/app/api/stats/route";
import { getStats, getCheckEvents } from "@/lib/reportStore";

const req = (url: string) => new Request(url);

beforeEach(() => {
  // Mock call history accumulates across tests otherwise, so assertions on
  // `mock.calls[0]` would read an earlier test's call.
  vi.clearAllMocks();
  vi.mocked(getStats).mockResolvedValue({ checks: 42, reports: 17 });
  vi.mocked(getCheckEvents).mockResolvedValue([]);
});

describe("GET /api/stats", () => {
  it("returns only the public totals by default", async () => {
    const body = await (await GET(req("https://x/api/stats"))).json();

    // StatsBar reads exactly this shape; adding keys here would leak
    // operational detail onto a public page.
    expect(body).toEqual({ checks: 42, reports: 17 });
    expect(getCheckEvents).not.toHaveBeenCalled();
  });

  it("ignores a breakdown value other than 1", async () => {
    const body = await (await GET(req("https://x/api/stats?breakdown=true"))).json();
    expect(body).toEqual({ checks: 42, reports: 17 });
  });

  it("adds the per-surface breakdown when asked, keeping the totals", async () => {
    vi.mocked(getCheckEvents).mockResolvedValue([
      { surface: "email", outcome: "analysed", day: "2026-08-29", value: 10 },
      { surface: "email", outcome: "delivered", day: "2026-08-29", value: 8 },
      { surface: "web", outcome: "delivered", day: "2026-08-29", value: 25 },
    ]);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();

    expect(body.checks).toBe(42);
    expect(body.reports).toBe(17);
    expect(body.breakdown.surfaces).toEqual([
      { surface: "web", delivered: 25, analysed: 0, deliveredRate: null },
      { surface: "email", delivered: 8, analysed: 10, deliveredRate: 0.8 },
    ]);
  });

  it("reports deliveredRate as null, not 0, when nothing was analysed", async () => {
    vi.mocked(getCheckEvents).mockResolvedValue([
      { surface: "web", outcome: "delivered", day: "2026-08-29", value: 5 },
    ]);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.surfaces[0].deliveredRate).toBeNull();
  });

  it("defaults to a 28-day window", async () => {
    await GET(req("https://x/api/stats?breakdown=1"));

    expect(getCheckEvents).toHaveBeenCalledTimes(1);
    const since = vi.mocked(getCheckEvents).mock.calls[0][0] as string;
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const spanDays = Math.round((Date.now() - Date.parse(since)) / 86_400_000);
    expect(spanDays).toBe(27); // inclusive bound: 28 days counted
  });

  it("honours ?days= and clamps it to a year", async () => {
    await GET(req("https://x/api/stats?breakdown=1&days=9999"));

    const since = vi.mocked(getCheckEvents).mock.calls[0][0] as string;
    const spanDays = Math.round((Date.now() - Date.parse(since)) / 86_400_000);
    expect(spanDays).toBe(364);
  });

  it("falls back to the default window for a nonsense ?days=", async () => {
    await GET(req("https://x/api/stats?breakdown=1&days=-3"));

    const since = vi.mocked(getCheckEvents).mock.calls[0][0] as string;
    const spanDays = Math.round((Date.now() - Date.parse(since)) / 86_400_000);
    expect(spanDays).toBe(27);
  });

  it("passes the raw daily rows through for callers doing their own bucketing", async () => {
    const rows = [
      { surface: "email" as const, outcome: "delivered" as const, day: "2026-08-29", value: 3 },
    ];
    vi.mocked(getCheckEvents).mockResolvedValue(rows);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.daily).toEqual(rows);
    expect(body.breakdown.days).toBe(28);
  });
});
