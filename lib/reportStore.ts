// Rate limiting and dedup are intentionally in-memory — they don't need to
// survive restarts and keeping them out of the DB makes them fast and
// impossible for scammers to probe via the API.

import { randomBytes } from "crypto";
import { scrubPii } from "./piiScrubber";
import { defang, defangEmail, defangPhone, defangText } from "@justcheckingmate/engine/urlSanitizer";
import { getDb } from "./db";

// Privacy contract: this shape is exactly what reaches the database. The
// reporter's IP is deliberately NOT part of it — IPs are used transiently for
// rate limiting (see checkAndRecordRateLimit) and never persisted. `location`
// is the coarse region string derived in lib/geo.ts.
export interface Report {
  id: string;
  type: string;
  content: string;
  description: string;
  contact: string;
  submittedAt: number;
  location: string;
  scamUrl: string;
  scamPhone: string;
  scamEmail: string;
  scamReplyTo: string;
  emailAuth?: string; // compact SPF/DKIM/DMARC summary; absent for non-email reports
  // Region pack that assessed this report (ISO 3166-1 alpha-2). Operational
  // data for measuring coverage gaps — not surfaced in the public feed.
  region?: string;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 4;

/**
 * Budget for read-only analysis (`/api/check`), which is the core user action
 * and gets repeated legitimately — someone working through a suspicious inbox
 * may check a dozen things in a sitting. The submission budget of 4 exists to
 * throttle writes to the shared database and is far too tight here; this one
 * only needs to stop automated abuse of a public, unauthenticated endpoint.
 */
export const CHECK_RATE_LIMIT = 30;

const rateLimiter = new Map<string, number[]>();

function cleanRateLimiter() {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, times] of rateLimiter) {
    const recent = times.filter((t) => t > cutoff);
    if (recent.length === 0) rateLimiter.delete(ip);
    else rateLimiter.set(ip, recent);
  }
}

/**
 * Records a hit against `key` and reports whether it is within budget.
 *
 * Callers namespace the key (`bug:`, `inbound:`, `check:`) so surfaces share
 * this limiter without starving each other. `limit` defaults to the submission
 * budget; pass CHECK_RATE_LIMIT for read-only analysis.
 *
 * NOTE: this is per-process memory. On serverless each instance keeps its own
 * counts, so the effective limit is looser than it reads under horizontal
 * scaling. It stops casual scripted abuse, not a distributed attacker.
 */
export function checkAndRecordRateLimit(key: string, limit: number = RATE_LIMIT): boolean {
  cleanRateLimiter();
  const now = Date.now();
  const times = (rateLimiter.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= limit) return false;
  rateLimiter.set(key, [...times, now]);
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
             scam_url, scam_phone, scam_email, scam_reply_to, email_auth, report_count, location, region)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      report.id, report.type, report.content, report.description, report.contact,
      report.submittedAt, suspect ? 1 : 0,
      report.scamUrl, report.scamPhone, report.scamEmail, report.scamReplyTo,
      report.emailAuth ?? "", reportCount, report.location, report.region ?? "",
    ],
  });

  if (!suspect) {
    await db.execute({
      sql: `UPDATE counters SET value = value + 1 WHERE name = 'reports'`,
      args: [],
    });
  }
}

// Which entry point a check came through. Add a member when a new surface
// ships (extension, telegram, …) so its volume is attributable from day one —
// an unattributed surface is indistinguishable from no traffic at all.
//
// `share` is the OS share sheet (app/share/page.tsx). It reaches the same
// /api/check as `web` and is analysed identically, so it is NOT a separate
// code path — but it is a separate *product surface*, and rolling it into
// `web` would make it impossible to tell whether the share target is used at
// all. That question is the whole reason Phase 2a shipped.
export type CheckSurface = "web" | "share" | "email" | "unknown";

// What became of it.
//
// `delivered` means a person has a verdict in hand. `analysed` means the email
// path produced a reply for the Worker to send; it is recorded on the inbound
// analysis path only, and says nothing about whether the reply arrived.
// `unknown` is the neutral bucket for an unrecognised value — deliberately NOT
// folded into `analysed`, which would silently move a bad write into a counted
// population.
//
// These are NOT two halves of one ratio. See the note on `getCheckEvents`.
export type CheckOutcome = "delivered" | "analysed" | "unknown";

const CHECK_SURFACES: readonly CheckSurface[] = ["web", "share", "email", "unknown"];
const CHECK_OUTCOMES: readonly CheckOutcome[] = ["delivered", "analysed", "unknown"];

// UTC day key, `YYYY-MM-DD`. UTC rather than AEST deliberately: unlike the
// region-demand script — which buckets AU submissions at UTC+10 so a month's
// first hours don't fall into the previous one — this is read as a weekly rate
// across surfaces, where a fixed, machine-independent boundary matters more
// than aligning to an Australian calendar day.
function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Record one check against the per-surface aggregate.
 *
 * Never throws: telemetry must not be able to fail a user-facing request, and
 * both call sites already treat counting as best-effort. An unknown surface is
 * bucketed as "unknown" rather than dropped, so a miswired new client shows up
 * as unattributed volume instead of vanishing.
 */
export async function recordCheckEvent(
  surface: CheckSurface,
  outcome: CheckOutcome,
  at: number = Date.now(),
): Promise<void> {
  // Both call sites pass literals today, so these are unreachable from inside
  // this repo. They are kept for the surface a future client adds — a bad value
  // arriving from a new caller should land in `unknown` and be visible as
  // unattributed volume, never be dropped and never be quietly counted as
  // something it wasn't.
  const safeSurface: CheckSurface = CHECK_SURFACES.includes(surface) ? surface : "unknown";
  const safeOutcome: CheckOutcome = CHECK_OUTCOMES.includes(outcome) ? outcome : "unknown";
  try {
    const db = await getDb();
    await db.execute({
      sql: `INSERT INTO check_events (surface, outcome, day, value)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(surface, outcome, day)
            DO UPDATE SET value = value + 1`,
      args: [safeSurface, safeOutcome, utcDay(at)],
    });
  } catch {
    // Aggregate is best-effort; the lifetime counter is the source of truth.
  }
}

/**
 * Increment the public lifetime "scams checked" total.
 *
 * `surface` is optional so existing callers keep working unchanged; passing it
 * also records the per-surface aggregate.
 *
 * The aggregate write is deliberately NOT awaited. The public counter is the
 * source of truth and the caller is waiting on this — making the request pay
 * for a second serial round trip (which contends on a single hot per-day row)
 * to update a secondary number is the wrong trade. `recordCheckEvent` already
 * swallows its own failures.
 */
export async function incrementCheckCount(surface?: CheckSurface): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `UPDATE counters SET value = value + 1 WHERE name = 'checks'`,
    args: [],
  });
  if (surface) {
    void recordCheckEvent(surface, "delivered");
  }
}

export interface CheckEventRow {
  surface: CheckSurface;
  outcome: CheckOutcome;
  day: string;
  value: number;
}

/**
 * Read the per-surface aggregate, newest day first.
 *
 * `sinceDay` is an inclusive `YYYY-MM-DD` bound; omit it for everything. The
 * shape is deliberately raw — callers do their own bucketing.
 *
 * **`delivered` and `analysed` are not a numerator and denominator.** Dividing
 * one by the other looks meaningful and is not:
 *
 * - They are written on different code paths, behind two independent
 *   rate-limit budgets (`inbound:` and `delivered:`, 4 per 10 min each), so
 *   either can be throttled while the other is not. `delivered` exceeding
 *   `analysed` is an ordinary outcome, not a corruption.
 * - The `web` surface never writes `analysed` at all — a web check is delivered
 *   by definition — so any such ratio is undefined there rather than 100%.
 * - A crash mid-analysis writes neither, so failures are absent from both
 *   sides rather than lowering a success rate.
 *
 * Read them as two separate volumes: how many verdicts reached people, and how
 * many replies the email path produced. A true delivery rate needs both
 * outcomes written on one path under one budget, which is a schema change, not
 * a division.
 */
export async function getCheckEvents(sinceDay?: string): Promise<CheckEventRow[]> {
  const db = await getDb();
  const result = sinceDay
    ? await db.execute({
        sql: `SELECT surface, outcome, day, value FROM check_events
              WHERE day >= ? ORDER BY day DESC, surface, outcome`,
        args: [sinceDay],
      })
    : await db.execute(
        `SELECT surface, outcome, day, value FROM check_events
         ORDER BY day DESC, surface, outcome`,
      );
  return result.rows.map((r) => ({
    surface: r.surface as CheckSurface,
    outcome: r.outcome as CheckOutcome,
    day: r.day as string,
    value: Number(r.value),
  }));
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
  emailAuth: string;
  location: string;
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
    // id is included so a reporter can look up their own submission by the
    // reference shown on the success screen.
    conditions.push(
      "(content LIKE ? OR scam_url LIKE ? OR scam_phone LIKE ? OR scam_email LIKE ? OR id LIKE ?)"
    );
    args.push(term, term, term, term, term);
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
                 scam_url, scam_phone, scam_email, scam_reply_to, email_auth, report_count, location
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
    // Already a composed, defanged summary at write time — render as stored.
    emailAuth:   (r.email_auth as string) ?? "",
    location:    (r.location as string) ?? "",
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

// ── Feed stats (for the submissions page overview panel) ──────────────────────

export interface FeedStats {
  total: number;
  byDay: { date: string; count: number }[];   // ISO date strings, last 30 days
  byType: { type: string; count: number }[];  // all types, descending
}

export async function getFeedStats(): Promise<FeedStats> {
  const db = await getDb();
  const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const [totalRes, byDayRes, byTypeRes] = await Promise.all([
    db.execute(`SELECT COUNT(*) as n FROM reports WHERE suspect = 0`),
    db.execute({
      sql: `SELECT date(submitted_at / 1000, 'unixepoch') as d, COUNT(*) as n
            FROM reports
            WHERE suspect = 0 AND submitted_at >= ?
            GROUP BY d
            ORDER BY d ASC`,
      args: [since30d],
    }),
    db.execute(
      `SELECT type, COUNT(*) as n FROM reports WHERE suspect = 0 GROUP BY type ORDER BY n DESC`
    ),
  ]);

  return {
    total:  Number(totalRes.rows[0]?.n ?? 0),
    byDay:  byDayRes.rows.map((r)  => ({ date: r.d as string, count: Number(r.n) })),
    byType: byTypeRes.rows.map((r) => ({ type: r.type as string, count: Number(r.n) })),
  };
}


/**
 * How many reports in `byDay` fall within the last `days` days of `now`.
 *
 * `now` is a parameter rather than a call to Date.now() inside the function so
 * this stays pure: the caller is a React component, and reading the clock while
 * rendering makes the output depend on when the render happened rather than on
 * the props — which is both a hydration hazard and untestable.
 *
 * Compares ISO date strings directly, which is valid because they are
 * zero-padded and fixed-width, and avoids re-parsing each row into a Date only
 * to compare it back.
 */
export function countRecent(byDay: FeedStats["byDay"], now: number, days = 7): number {
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return byDay.reduce((sum, d) => (d.date >= cutoff ? sum + d.count : sum), 0);
}
