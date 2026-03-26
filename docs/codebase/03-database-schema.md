# Database Schema — SQLite

## Purpose

A quick reference for the SQLite schema (tables + indexes).

## Conventions

- All timestamps are stored as **UTC ISO strings** (`Date.toISOString()`) in `TEXT` columns.
  - ISO UTC strings sort lexicographically, so `ORDER BY timestamp` / `ORDER BY logged_at` is chronological.
- `comment_id` is the Reddit comment **ID** (e.g. `abc123`), not the fullname (`t1_abc123`).
- Reply state is stored on the log row (`kebab_logs.reply_status`).

---

## Tables

### `bot_state`

Persistent key/value state for restart safety.

| Column       | Type   | Constraints   | Meaning                                                 |
| ------------ | ------ | ------------- | ------------------------------------------------------- |
| `key`        | `TEXT` | `PRIMARY KEY` | Namespaced state key (e.g. `comments.cursor.fullname`). |
| `value`      | `TEXT` | `NOT NULL`    | Value for the key (typically a string token/cursor).    |
| `updated_at` | `TEXT` | `NOT NULL`    | When this key was last written (UTC ISO).               |

### `users`

One row per Reddit username.

| Column         | Type      | Constraints          | Meaning                                                   |
| -------------- | --------- | -------------------- | --------------------------------------------------------- |
| `username`     | `TEXT`    | `PRIMARY KEY`        | Reddit username.                                          |
| `total_kebabs` | `INTEGER` | `NOT NULL DEFAULT 0` | Cached counter (incremented on each accepted log insert). |
| `created_at`   | `TEXT`    | `NOT NULL`           | When the user was first seen (UTC ISO).                   |

### `kebab_logs`

One row per accepted tracker-command log (idempotent per Reddit comment).

| Column         | Type      | Constraints                                 | Meaning                                                                               |
| -------------- | --------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `log_id`       | `INTEGER` | `PRIMARY KEY AUTOINCREMENT`                 | Internal identifier for the log row.                                                  |
| `username`     | `TEXT`    | `NOT NULL`, `FOREIGN KEY → users(username)` | Author of the comment / owner of the log.                                             |
| `timestamp`    | `TEXT`    | `NOT NULL`                                  | **Eaten-at** time (UTC ISO). Used for streak calculations (supports backdating).      |
| `logged_at`    | `TEXT`    | `NOT NULL`                                  | **Comment-created** time (UTC ISO). Used for cooldown enforcement + processing order. |
| `rating`       | `INTEGER` | `NULL`                                      | Optional rating (e.g. `8` from `8/10`).                                               |
| `comment_id`   | `TEXT`    | `NOT NULL UNIQUE`                           | Reddit comment id; UNIQUE provides at-most-once processing per comment.               |
| `reply_status` | `TEXT`    | `NOT NULL DEFAULT 'pending'`                | Reply state machine: `pending` → `success` \| `failed_permanently`.                   |

---

## Indexes (and why they exist)

These are purely performance/ergonomics: the bot can function without them, but key queries are much cheaper with them.

| Index                               | On                                | Why it exists                                                                                    |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `idx_kebab_logs_username_logged_at` | `kebab_logs(username, logged_at)` | Makes the **cooldown check** fast (`WHERE username = ? ORDER BY logged_at DESC LIMIT 1`).        |
| `idx_kebab_logs_logged_at`          | `kebab_logs(logged_at)`           | Speeds up time-ordered scans, especially the worker queue order (`ORDER BY logged_at ASC`).      |
| `idx_kebab_logs_username_timestamp` | `kebab_logs(username, timestamp)` | Speeds up **per-user streak deltas** (`WHERE username = ? ... ORDER BY timestamp DESC LIMIT 1`). |
| `idx_kebab_logs_timestamp`          | `kebab_logs(timestamp)`           | Speeds up **global streak deltas** (`WHERE timestamp < ? ... ORDER BY timestamp DESC LIMIT 1`).  |

Notes:

- `comment_id` has an implicit UNIQUE index because of `UNIQUE` — that’s the core idempotency guarantee.
- `reply_status` is intentionally _not_ indexed right now; the pending set is expected to be small.
