import { createClient, type Client } from "@libsql/client";

let _client: Client | undefined;
let _initialized: Promise<void> | undefined;

function client(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

async function setup(): Promise<void> {
  const db = client();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id          TEXT    PRIMARY KEY,
      type        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      contact     TEXT    NOT NULL DEFAULT '',
      submitted_at INTEGER NOT NULL,
      suspect     INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS counters (
      name  TEXT    PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Bug reports — diagnostics for failed/awkward actions, sent only with the
  // user's explicit consent. Never contains the scam content or uploaded files.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id            TEXT    PRIMARY KEY,
      action        TEXT    NOT NULL DEFAULT 'manual',
      error_message TEXT    NOT NULL DEFAULT '',
      description   TEXT    NOT NULL DEFAULT '',
      contact       TEXT    NOT NULL DEFAULT '',
      path          TEXT    NOT NULL DEFAULT '',
      user_agent    TEXT    NOT NULL DEFAULT '',
      viewport      TEXT    NOT NULL DEFAULT '',
      app_language  TEXT    NOT NULL DEFAULT '',
      submitted_at  INTEGER NOT NULL
    )
  `);
  // Per-surface check telemetry. Deliberately an AGGREGATE, not an event log:
  // one row per (surface, outcome, UTC day), incremented in place. This answers
  // "which surfaces get used" and "what share of forwards yield a verdict"
  // without recording anything about an individual check — no timestamp beyond
  // the day, no content, no sender, nothing joinable back to a person. The raw
  // email is still never stored (see app/api/inbound/route.ts).
  //
  // `counters.checks` remains the public lifetime total and the source of truth
  // for the published number; this table is strictly additional. The two are
  // incremented together on the delivered path, so they can drift only for
  // checks that predate this table.
  //
  // `day` leads the primary key so a range scan over `WHERE day >= ?` — the only
  // way this table is read — uses the PK prefix instead of scanning everything.
  // `value` has no DEFAULT: every row is created by an upsert that sets it to 1,
  // and a zero row would mean "something happened zero times", which is not a
  // thing this table can record.
  //
  // Failure is swallowed for the same reason the ALTER migrations below are:
  // `getDb` memoises `setup()`, so letting this reject would poison
  // initialisation for `reports`, `counters` and `bug_reports` too. Telemetry
  // must never be able to take the app down.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS check_events (
      day      TEXT    NOT NULL,
      surface  TEXT    NOT NULL,
      outcome  TEXT    NOT NULL,
      value    INTEGER NOT NULL,
      PRIMARY KEY (day, surface, outcome)
    )
  `).catch(() => {});
  await db.execute(`INSERT OR IGNORE INTO counters (name, value) VALUES ('checks', 0)`);
  await db.execute(`INSERT OR IGNORE INTO counters (name, value) VALUES ('reports', 0)`);
  // Migrations — ALTER TABLE ignores silently if column already exists
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_url     TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_phone   TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_email   TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_reply_to TEXT   NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN report_count INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  // Compact email-authentication summary (SPF/DKIM/DMARC), derived client-side
  // from pasted headers — never the raw email. Empty for non-email reports.
  await db.execute(`ALTER TABLE reports ADD COLUMN email_auth   TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  // Coarse submission location (state for AU, country otherwise) derived from
  // geo headers at submission time. The reporter's IP is never stored.
  await db.execute(`ALTER TABLE reports ADD COLUMN location     TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  // Region pack used to assess this report (ISO 3166-1 alpha-2). Distinct from
  // `location`, which is display text: this records which detection ruleset ran,
  // so coverage gaps by region are measurable. Empty for rows predating it.
  await db.execute(`ALTER TABLE reports ADD COLUMN region       TEXT    NOT NULL DEFAULT ''`).catch(() => {});
}

export async function getDb(): Promise<Client> {
  if (!_initialized) _initialized = setup();
  await _initialized;
  return client();
}
