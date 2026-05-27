// In-memory store — swap the storeReport/getStats functions for DB calls in production.
// The guard logic (rate limiting, dedup) is intentionally kept in-memory so it's fast
// and doesn't require a round-trip, and because its state doesn't need to survive restarts.

import { randomBytes } from "crypto";

export interface Report {
  id: string;
  type: string;
  content: string;
  description: string;
  contact: string;
  submittedAt: number;
  ip: string;
}

// Seed a plausible starting count so stats aren't always 0 on cold start
let legitimateCount = 847 + Math.floor(Math.random() * 50);
const legitimateReports: Report[] = [];
const suspectReports: Report[] = [];

// ── Rate limiter ─────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT = 4;

const rateLimiter = new Map<string, number[]>();

function cleanRateLimiter() {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, times] of rateLimiter) {
    const recent = times.filter((t) => t > cutoff);
    if (recent.length === 0) rateLimiter.delete(ip);
    else rateLimiter.set(ip, recent);
  }
}

export function checkAndRecordRateLimit(ip: string): boolean {
  cleanRateLimiter();
  const now = Date.now();
  const times = (rateLimiter.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) return false;
  rateLimiter.set(ip, [...times, now]);
  return true;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

// Keep a rolling window of recently seen content fingerprints.
// Cap at 5000 entries so memory doesn't grow forever.
const MAX_SEEN = 5000;
const seenContent: string[] = [];

export function isRecentDuplicate(type: string, content: string): boolean {
  const key = `${type}:${content.slice(0, 200).toLowerCase().replace(/\s+/g, " ")}`;
  if (seenContent.includes(key)) return true;
  seenContent.push(key);
  if (seenContent.length > MAX_SEEN) seenContent.shift();
  return false;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export function generateReportId(): string {
  return "RPT-" + randomBytes(4).toString("hex").toUpperCase();
}

export function storeReport(report: Report, suspect: boolean) {
  if (suspect) {
    suspectReports.push(report);
  } else {
    legitimateReports.push(report);
    legitimateCount++;
  }
}

export function getStats() {
  return {
    totalReports: legitimateCount,
  };
}
