# System Architecture & Data Model

## 1. Tech Stack Overview
*   **Language:** TypeScript
*   **Runtime:** Bun
*   **Database:** SQLite (`bun:sqlite`)
*   **Reddit API:** Native `fetch` (No heavy wrapper libraries)

### 1.1 Why Bun? (Runtime Comparison)
As an engineering decision, Bun was chosen over Node.js and Deno for this specific use case:
*   **Node.js:** The industry standard, but requires build tools (`tsc` or `tsx`) to run TypeScript, and managing external SQLite binaries can be clunky in Docker.
*   **Deno:** Secure by default and native TS, but the ecosystem transition is still ongoing.
*   **Bun:** Provides native TypeScript execution, blazing-fast startup times, and crucially, a highly optimized **built-in SQLite driver** (`bun:sqlite`). This removes the need for external database dependencies, making it perfect for a lightweight, high-performance bot.

## 2. High-Level Architecture
The application runs as a continuous background process with the following conceptual modules:

1.  **The Listener (Poller):** Since Reddit doesn't natively push webhooks for new comments to free tier apps, this module uses `setInterval` to poll the `r/KebabLog/comments.json` endpoint every ~10-15 seconds. It uses the `before` parameter to only fetch comments newer than the last checked ID.
2.  **The Parser:** Uses Regular Expressions (Regex) to check if a new comment contains `!kebab`. If found, it extracts optional arguments (Ratings: `\d{1,2}\/10`, Dates: `\d{4}-\d{2}-\d{2}`).
3.  **The DB Layer:** Executes SQLite transactions to insert the log, update the user's total count, and calculate the global/personal time deltas.
4.  **The Replier:** Constructs the Markdown string (The Dashboard) and sends a `POST` request to the Reddit API to reply to the user's comment.

## 3. Database Schema (SQLite)
To support the MVP and future averages/streaks, a normalized relational structure is best.

**Table: `global_state`**
*(A single-row table to track the subreddit's overall streak)*
*   `id` (INTEGER PRIMARY KEY) - Always 1.
*   `last_kebab_timestamp` (DATETIME) - The exact UTC time the last valid `!kebab` was logged by *anyone*.

**Table: `users`**
*   `reddit_user_id` (TEXT PRIMARY KEY) - The unique Reddit account ID (e.g., `t2_xxxxx`).
*   `username` (TEXT) - Stored for easy reference/debugging.
*   `total_kebabs` (INTEGER) - Cached count for quick Level calculation.
*   `created_at` (DATETIME) - When they first used the bot.

**Table: `kebab_logs`**
*(Stores every individual kebab eaten. Essential for calculating averages and personal streaks).*
*   `log_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
*   `reddit_user_id` (TEXT FOREIGN KEY references `users`)
*   `timestamp` (DATETIME) - The actual time the kebab was eaten (handles backdating).
*   `logged_at` (DATETIME) - The time the comment was made.
*   `rating` (INTEGER NULLABLE) - E.g., 8 (out of 10).
*   `comment_id` (TEXT UNIQUE) - The Reddit comment ID. (Crucial: Enforces a unique constraint so the bot never processes the same comment twice if it restarts).