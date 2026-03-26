# Data Flow — Comment Lifecycle

## Purpose

Explain what happens from “a new Reddit comment exists” to “the bot replies (or decides not to)”.

## Lifecycle (step-by-step)

1. **Poller fetches `t1_xxx`.**
   - `runCommentsPoller` calls `RedditClient.fetchSubredditComments(...)` and receives `RedditComment` items (with a fullname like `t1_<id>`).
   - It deduplicates in-memory and persists a cursor so restarts can resume safely.

2. **`handleKebabComment` parses it.**
   - The poller calls `handleKebabComment({ comment, ... })` for each new comment.
   - The handler ignores the bot’s own comments, searches for the configured tracker command (default `!kebab`), and parses any optional args (rating/backdate).
   - If parsing fails, it sends a best-effort “parse error” reply and returns.

3. **DB transaction ensures idempotency & cooldown.**
   - The handler resolves the “eaten at” timestamp (including backdating rules / configured timezone handling).
   - `KebabDb.recordKebabLog(...)` runs a SQLite transaction that:
     - Checks `kebab_logs.comment_id` first (at-most-once per Reddit comment).
     - Enforces the cooldown window for non-backdated logs.
     - Inserts a `kebab_logs` row with `reply_status = 'pending'` on success.
   - Depending on the result, the handler may send a best-effort cooldown/future-date reply, or (for accepted logs) leave the reply for the worker.

4. **Worker picks up unreplied logs and posts to Reddit.**
   - `runPendingRepliesWorker` polls `listUnrepliedKebabLogs(...)` for rows where `reply_status = 'pending'`.
   - For each pending log it:
     - Loads dashboard data via `getDashboardDataForLogId(...)`.
     - Builds markdown with `buildKebabDashboardReplyFromLogData(...)` + `src/templates/`, using the configured timezone, tracker command, and level cadence.
     - Calls `RedditClient.replyToComment(...)`.
     - Marks the row as `success`, or retries with backoff (and eventually marks `failed_permanently`).
