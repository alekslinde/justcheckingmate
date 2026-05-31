// Rate limiting and dedup are intentionally in-memory — they don't need to
// survive restarts and keeping them out of the DB makes them fast and
// impossible for scammers to probe via the API.

import { randomBytes } from "crypto";
import { scrubPii } from "./piiScrubber";
import { defang, defangEmail, defangPhone, defangText } from "./urlSanitizer";
import { getDb } from "./db";

export interface Report {
  id: string;
  type: string;
  content: string;
  description: string;
  contact: string;
  submittedAt: number;
  ip: string;
  scamUrl: string;
  scamPhone: string;
  scamEmail: string;
  scamReplyTo: string;
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

type IdentifierCol = "scam_url" | "scam_phone" | "scam_email";

function getPrimaryIdentifier(report: Report): [IdentifierCol, string] | null {
  if (report.scamUrl)   return ["scam_url",   report.scamUrl];
  if (report.scamPhone) return ["scam_phone", report.scamPhone];
  if (report.scamEmail) return ["scam_email", report.scamEmail];
  return null;
}

export async function storeReport(report: Report, suspect: boolean): Promise<void> {
  const db = await getDb();

  let reportCount = 1;

  if (!suspect) {
    const identifier = getPrimaryIdentifier(report);
    if (identifier) {
      const [col, val] = identifier;
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as n FROM reports WHERE suspect = 0 AND ${col} = ?`,
        args: [val],
      });
      const existingCount = Number(countResult.rows[0]?.n ?? 0);
      if (existingCount > 0) {
        reportCount = existingCount + 1;
        // Keep all matching rows in sync so any of them can be sorted by count
        await db.execute({
          sql: `UPDATE reports SET report_count = ? WHERE suspect = 0 AND ${col} = ?`,
          args: [reportCount, val],
        });
      }
    }
  }

  await db.execute({
    sql: `INSERT INTO reports
            (id, type, content, description, contact, submitted_at, suspect,
             scam_url, scam_phone, scam_email, scam_reply_to, report_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      report.id, report.type, report.content, report.description, report.contact,
      report.submittedAt, suspect ? 1 : 0,
      report.scamUrl, report.scamPhone, report.scamEmail, report.scamReplyTo, reportCount,
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
  scamUrl: string;
  scamPhone: string;
  scamEmail: string;
  scamReplyTo: string;
  matchCount: number;
}

export type SortOption = "desc" | "asc" | "most" | "least";

interface FeedOpts {
  type?: string;
  since?: number;
  search?: string;
}

function buildConditions({ type, since, search }: FeedOpts) {
  const conditions: string[] = ["suspect = 0"];
  const args: (string | number)[] = [];
  if (type && type !== "all") { conditions.push("type = ?"); args.push(type); }
  if (since)                  { conditions.push("submitted_at >= ?"); args.push(since); }
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      "(content LIKE ? OR scam_url LIKE ? OR scam_phone LIKE ? OR scam_email LIKE ?)"
    );
    args.push(term, term, term, term);
  }
  return { where: conditions.join(" AND "), args };
}

export async function getPublicReports(opts: {
  limit?: number;
  offset?: number;
  sort?: SortOption;
} & FeedOpts = {}): Promise<PublicReport[]> {
  const { limit = 25, offset = 0, type, sort = "desc", since, search } = opts;
  const { where, args } = buildConditions({ type, since, search });
  const db = await getDb();

  const orderBy =
    sort === "most"  ? "report_count DESC, submitted_at DESC" :
    sort === "least" ? "report_count ASC,  submitted_at DESC" :
    sort === "asc"   ? "submitted_at ASC"                     :
                       "submitted_at DESC";

  const result = await db.execute({
    sql: `SELECT id, type, content, description, submitted_at,
                 scam_url, scam_phone, scam_email, scam_reply_to, report_count
          FROM reports WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
    args: [...args, Math.min(limit, 100), offset],
  });

  return result.rows.map((r) => ({
    id:          r.id as string,
    type:        r.type as string,
    content:     defangText(r.content as string),
    description: scrubPii(r.description as string),
    submittedAt: Number(r.submitted_at),
    scamUrl:     (r.scam_url as string)   ? defang(r.scam_url as string)        : "",
    scamPhone:   (r.scam_phone as string) ? defangPhone(r.scam_phone as string) : "",
    scamEmail:   (r.scam_email as string) ? defangEmail(r.scam_email as string) : "",
    scamReplyTo: (r.scam_reply_to as string) ? defangEmail(r.scam_reply_to as string) : "",
    matchCount:  Number(r.report_count ?? 1),
  }));
}

export async function getPublicReportsCount(opts: FeedOpts = {}): Promise<number> {
  const { where, args } = buildConditions(opts);
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) as n FROM reports WHERE ${where}`,
    args,
  });
  return Number(result.rows[0]?.n ?? 0);
}
