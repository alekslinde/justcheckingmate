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
  await db.execute(`INSERT OR IGNORE INTO counters (name, value) VALUES ('checks', 0)`);
  await db.execute(`INSERT OR IGNORE INTO counters (name, value) VALUES ('reports', 0)`);
  // Migrations — ALTER TABLE ignores silently if column already exists
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_url     TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_phone   TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN scam_email   TEXT    NOT NULL DEFAULT ''`).catch(() => {});
  await db.execute(`ALTER TABLE reports ADD COLUMN report_count INTEGER NOT NULL DEFAULT 1`).catch(() => {});
}

export async function getDb(): Promise<Client> {
  if (!_initialized) _initialized = setup();
  await _initialized;
  return client();
}
