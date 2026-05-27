// Rate limiting and dedup are intentionally in-memory — they don't need to
// survive restarts and keeping them out of the DB makes them fast and
// impossible for scammers to probe via the API.

import { randomBytes } from "crypto";
import { scrubPii } from "./piiScrubber";
import { getDb } from "./db";

export interface Report {
  id: string;
  type: string;
  content: string;
  description: string;
  contact: string;
  submittedAt: number;
  ip: string;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 10 * 60 * 1000;
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

export async function storeReport(report: Report, suspect: boolean): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO reports (id, type, content, description, contact, submitted_at, suspect)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      report.id,
      report.type,
      report.content,
      report.description,
      report.contact,
      report.submittedAt,
      suspect ? 1 : 0,
    ],
  });
  if (!suspect) {
    await db.execute({
      sql: `UPDATE counters SET value = value + 1 WHERE name = 'reports'`,
      args: [],
    });
  }
}

export async function incrementCheckCount(): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `UPDATE counters SET value = value + 1 WHERE name = 'checks'`,
    args: [],
  });
}

export async function getStats(): Promise<{ checks: number; reports: number }> {
  const db = await getDb();
  const result = await db.execute(`SELECT name, value FROM counters`);
  const map = Object.fromEntries(result.rows.map((r) => [r.name as string, Number(r.value)]));
  return { checks: map.checks ?? 0, reports: map.reports ?? 0 };
}

// ── Public feed ───────────────────────────────────────────────────────────────

export interface PublicReport {
  id: string;
  type: string;
  content: string;
  description: string;
  submittedAt: number;
}

export async function getPublicReports(limit = 50): Promise<PublicReport[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT id, type, content, description, submitted_at
          FROM reports WHERE suspect = 0
          ORDER BY submitted_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((r) => ({
    id: r.id as string,
    type: r.type as string,
    content: r.content as string,
    description: scrubPii(r.description as string),
    submittedAt: Number(r.submitted_at),
  }));
}
