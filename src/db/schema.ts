import { type Database } from "bun:sqlite";

export function initSchema(db: Database): void {
  // Ensure foreign keys are actually enforced.
  db.run("PRAGMA foreign_keys = ON;");

  // Reasonable defaults for a single-writer bot.
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");
  db.run("PRAGMA busy_timeout = 5000;");

  db.run(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      total_kebabs INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kebab_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      logged_at TEXT NOT NULL,
      rating INTEGER NULL,
      comment_id TEXT NOT NULL UNIQUE,
      replied_at TEXT NULL,
      FOREIGN KEY (username) REFERENCES users(username)
    );
  `);

  db.run(
    "CREATE INDEX IF NOT EXISTS idx_kebab_logs_username_logged_at ON kebab_logs(username, logged_at);",
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_kebab_logs_logged_at ON kebab_logs(logged_at);",
  );

  // Phase 3 queries use `timestamp` (eaten time) for streak computations.
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_kebab_logs_username_timestamp ON kebab_logs(username, timestamp);",
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_kebab_logs_timestamp ON kebab_logs(timestamp);",
  );
}
