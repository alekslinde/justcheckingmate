import { describe, it, expect, vi, beforeEach } from "vitest";

// Avoid any real network: the blocklist fetch and the aggregate counter are
// stubbed so the route runs purely in memory.
vi.mock("@/lib/urlhausBlocklist", () => ({
  getUrlhausBlocklist: async () => new Set<string>(),
}));
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return { ...actual, incrementCheckCount: async () => {} };
});

import { POST, GET } from "@/app/api/inbound/route";
import { NextRequest } from "next/server";

const SECRET = "test-secret-123";

function inbound(bodyObj: unknown, secret: string | null = SECRET): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-inbound-secret"] = secret;
  return new NextRequest("http://localhost/api/inbound", {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
  });
}

const SCAM_FORWARD = [
  "From: victim@gmail.com",
  "Subject: Fwd: refund",
  "",
  "---------- Forwarded message ---------",
  "From: ATO <refunds@ato-refund.xyz>",
  "Reply-To: get@payme.cc",
  "Subject: refund",
  "",
  "You are owed money, click http://ato-refund.xyz/claim",
].join("\n");

beforeEach(() => {
  process.env.INBOUND_SECRET = SECRET;
});

describe("POST /api/inbound — auth", () => {
  it("rejects a missing secret with 401", async () => {
    const res = await POST(inbound({ raw: "x", from: "a@b.com" }, null));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret with 401", async () => {
    const res = await POST(inbound({ raw: "x", from: "a@b.com" }, "nope"));
    expect(res.status).toBe(401);
  });

  it("is closed by default when INBOUND_SECRET is unset", async () => {
    delete process.env.INBOUND_SECRET;
    const res = await POST(inbound({ raw: "x", from: "a@b.com" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/inbound — analysis", () => {
  it("returns a verdict reply for a forwarded scam, analysing the ORIGINAL sender", async () => {
    const res = await POST(inbound({ raw: SCAM_FORWARD, from: "victim@gmail.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.source).toBe("inline");
    expect(data.reply.subject).toBeTruthy();
    // The reply must reference the scammer, defanged — never the victim, never live.
    expect(data.reply.text).toContain("payme[.]cc");
    expect(data.reply.text).not.toMatch(/victim@gmail\.com/);
    expect(data.reply.text).not.toMatch(/http:\/\/ato-refund\.xyz/);
  });

  it("skips (200, no reply) on empty raw", async () => {
    const res = await POST(inbound({ raw: "", from: "a@b.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skip).toBeTruthy();
    expect(data.reply).toBeUndefined();
  });

  it("skips oversized input", async () => {
    const huge = "x".repeat(1_000_001);
    const data = await (await POST(inbound({ raw: huge, from: "a@b.com" }))).json();
    expect(data.skip).toBe("empty-or-too-large");
  });
});

describe("POST /api/inbound — rate limit", () => {
  it("stops replying after repeated forwards from the same sender", async () => {
    const sender = `flood-${Date.now()}@x.com`;
    const replies: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const data = await (await POST(inbound({ raw: SCAM_FORWARD, from: sender }))).json();
      replies.push(!!data.reply);
    }
    // The limiter allows a handful, then no-ops — at least one later call is skipped.
    expect(replies.filter(Boolean).length).toBeLessThan(replies.length);
    expect(replies.at(-1)).toBe(false);
  });
});

describe("GET /api/inbound", () => {
  it("is method-not-allowed", async () => {
    expect((await GET()).status).toBe(405);
  });
});
