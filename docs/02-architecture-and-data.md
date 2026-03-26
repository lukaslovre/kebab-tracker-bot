# System Architecture & Data Model

## 1. Tech Stack Overview

- **Language:** TypeScript
- **Runtime:** Bun
- **Database:** SQLite (`bun:sqlite`)
- **Reddit API:** Native `fetch` (No heavy wrapper libraries)

## 2. High-Level Architecture

The application runs as a continuous background process with the following conceptual modules:

1.  **The Listener (Poller):** Since Reddit doesn't natively push webhooks for new comments for most apps, this module should poll Reddit's listing endpoints on an interval (e.g., 10–15s). For the MVP, poll the subreddit comments listing (e.g., `GET /r/<subreddit>/comments` — append `.json` for the public endpoint or use `https://oauth.reddit.com/r/<subreddit>/comments` for OAuth-authenticated requests). Submissions can be added later via `/r/<subreddit>/new.json` if the product expands beyond comment-only tracking. Prefer OAuth-authenticated requests in production (use `https://oauth.reddit.com/...`) and use `before`/`after` parameters or track the latest processed `comment_id` to avoid reprocessing.
2.  **The Parser:** Uses Regular Expressions (Regex) to check if a new comment contains `!kebab`. If found, it extracts optional arguments (Ratings: `\d{1,2}\/10`, Dates: `\d{4}-\d{2}-\d{2}`).
3.  **The DB Layer:** Use SQLite to insert the log, update the user's total count, and calculate the global/personal time deltas.
4.  **The Replier:** Constructs the Markdown string (The Dashboard) and sends a request to the Reddit API to reply to the user's comment.

### MVP scope note

For the MVP, the bot listens to **new comments only**. Submissions/posts can be added later, but they are not part of the first implementation pass.

## 3. Database Schema (SQLite)

To support the MVP and future averages/streaks, a normalized relational structure is best.

**Table: `users`**

- `username` (TEXT PRIMARY KEY) - The Reddit username used as the user key for the MVP.
- `total_kebabs` (INTEGER) - Cached count for quick Level calculation.
- `created_at` (DATETIME) - When they first used the bot.

> MVP decision: use `username` as the primary user identifier to avoid extra Reddit API lookups. If the project later needs stronger identity tracking, `reddit_user_id` can be added in a future migration.

**Table: `kebab_logs`**
_(Stores every individual kebab eaten. Essential for calculating averages and personal streaks)._

- `log_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `username` (TEXT FOREIGN KEY references `users`)
- `timestamp` (DATETIME) - The actual time the kebab was eaten (handles backdating).
- `logged_at` (DATETIME) - The time the comment was made.
- `rating` (INTEGER NULLABLE) - E.g., 8 (out of 10).
- `comment_id` (TEXT UNIQUE) - The Reddit comment ID. (Crucial: Enforces a unique constraint so the bot never processes the same comment twice if it restarts).
- `replied_at` (DATETIME NULLABLE) - When the bot successfully replied, if it needs to retry or resume later.
