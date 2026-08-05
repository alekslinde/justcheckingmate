import { describe, it, expect, vi } from "vitest";

// Avoid any real network: the blocklist fetch and the aggregate counter are
// stubbed so the route runs purely in memory.
vi.mock("@/lib/urlhausBlocklist", () => ({
  getUrlhausBlocklist: async () => new Set<string>(),
}));
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return { ...actual, incrementCheckCount: async () => {} };
});

import { POST } from "@/app/api/check/route";
import { NextRequest } from "next/server";
import { DEFAULT_REGION } from "@/lib/regions";

function check(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/check", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const SCAM = "ATO: your tax refund is waiting, verify now at http://ato-refund.xyz";

describe("POST /api/check region resolution", () => {
  it("reports the region it actually used", async () => {
    const res = await POST(check({ content: SCAM }));
    const json = await res.json();
    expect(json.region).toBe(DEFAULT_REGION);
    expect(json.results.length).toBeGreaterThan(0);
  });

  it("honours an explicit supported region over the geo header", async () => {
    const res = await POST(check({ content: SCAM, region: "AU" }, { "x-vercel-ip-country": "AU" }));
    expect((await res.json()).region).toBe("AU");
  });

  it("resolves from the geo header when no region is supplied", async () => {
    const res = await POST(check({ content: SCAM }, { "x-vercel-ip-country": "AU" }));
    expect((await res.json()).region).toBe("AU");
  });

  it("degrades to the default for an unsupported region rather than erroring", async () => {
    const res = await POST(check({ content: SCAM, region: "ZZ" }));
    expect(res.status).toBe(200);
    expect((await res.json()).region).toBe(DEFAULT_REGION);
  });

  it("ignores a non-string region without erroring", async () => {
    const res = await POST(check({ content: SCAM, region: { evil: true } }));
    expect(res.status).toBe(200);
    expect((await res.json()).region).toBe(DEFAULT_REGION);
  });

  it("still rejects missing content", async () => {
    const res = await POST(check({ region: "AU" }));
    expect(res.status).toBe(400);
  });

  it("produces the same verdicts with and without an explicit default region", async () => {
    const a = await (await POST(check({ content: SCAM }))).json();
    const b = await (await POST(check({ content: SCAM, region: DEFAULT_REGION }))).json();
    expect(a.results).toEqual(b.results);
  });
});
