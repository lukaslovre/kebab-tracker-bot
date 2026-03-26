# System Architecture & Data Model

## 1. Tech Stack Overview

- **Language:** TypeScript
- **Runtime:** Bun
- **Database:** SQLite (`bun:sqlite`)
- **Reddit API:** Native `fetch` (No heavy wrapper libraries)

## 2. High-Level Architecture

The application runs as a continuous background process with the following conceptual modules:

1.  **The Listener (Poller):** Since Reddit doesn't natively push webhooks for new comments for most apps, this module should poll Reddit's listing endpoints on an interval (e.g., 10–15s). For new comments across the subreddit use the subreddit comments listing (e.g., `GET /r/<subreddit>/comments` — append `.json` for the public endpoint or use `https://oauth.reddit.com/r/<subreddit>/comments` for OAuth-authenticated requests). For new submissions use `/r/<subreddit>/new.json`. Prefer OAuth-authenticated requests in production (use `https://oauth.reddit.com/...`) and use `before`/`after` parameters or track the latest processed `comment_id` to avoid reprocessing.
2.  **The Parser:** Uses Regular Expressions (Regex) to check if a new comment contains `!kebab`. If found, it extracts optional arguments (Ratings: `\d{1,2}\/10`, Dates: `\d{4}-\d{2}-\d{2}`).
3.  **The DB Layer:** Use SQLite to insert the log, update the user's total count, and calculate the global/personal time deltas.
4.  **The Replier:** Constructs the Markdown string (The Dashboard) and sends a request to the Reddit API to reply to the user's comment.

## 3. Database Schema (SQLite)

To support the MVP and future averages/streaks, a normalized relational structure is best.

**Table: `users`**

- `reddit_user_id` (TEXT PRIMARY KEY) - The unique Reddit account ID (e.g., `t2_xxxxx`).
- `username` (TEXT) - Stored for easy reference/debugging.
- `total_kebabs` (INTEGER) - Cached count for quick Level calculation.
- `created_at` (DATETIME) - When they first used the bot.

**Table: `kebab_logs`**
_(Stores every individual kebab eaten. Essential for calculating averages and personal streaks)._

- `log_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `reddit_user_id` (TEXT FOREIGN KEY references `users`)
- `timestamp` (DATETIME) - The actual time the kebab was eaten (handles backdating).
- `logged_at` (DATETIME) - The time the comment was made.
- `rating` (INTEGER NULLABLE) - E.g., 8 (out of 10).
- `comment_id` (TEXT UNIQUE) - The Reddit comment ID. (Crucial: Enforces a unique constraint so the bot never processes the same comment twice if it restarts).
