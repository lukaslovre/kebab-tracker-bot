# Error Handling & Retries

## Purpose

Explain how the bot stays resilient when Reddit is flaky (network issues, 5xx) or when the bot hits rate limits (429s), and clarify which replies are retried vs best-effort.

---

## Rate limits (HTTP 429)

### Where 429s are detected

- `src/reddit/client.ts` treats `res.status === 429` as a special case and throws `RedditRateLimitError`.
- `src/reddit/auth.ts` does the same for OAuth token refresh.
- Both parse Reddit’s `Retry-After` header (seconds) into `retryAfterMs`.
  - If the header is missing/invalid, the fallback is `1_000ms`.

### How the poller reacts

The comments poller (`runCommentsPoller`) catches `RedditRateLimitError` and:

- Logs a warning (includes `retryAfterMs` and URL).
- Increments an internal `consecutiveErrors` counter.
- Sleeps for:

  `max(retryAfterMs, computeBackoffMs(consecutiveErrors))`

`computeBackoffMs(...)` is exponential and includes jitter:

- Base: `pollIntervalMs`
- Growth: doubles after each consecutive failure
- Cap: `5 minutes`
- Jitter: ±20% (prevents multiple instances synchronizing)

Net effect:

- The bot respects Reddit’s `Retry-After` hint.
- If rate limits keep happening, it backs off harder over time.

---

## Reply worker retries (durable replies)

Accepted `!kebab` logs are inserted with `kebab_logs.reply_status = 'pending'`. A separate worker (`runPendingRepliesWorker`) is responsible for posting the dashboard reply and retrying failures.

### Exponential backoff

For transient failures (network hiccups, 5xx, unexpected exceptions), the worker retries each log with exponential backoff:

- Base: `baseBackoffMs` (default `5_000ms`)
- Cap: `maxBackoffMs` (default `10 minutes`)
- Growth: doubles each attempt (with ±20% jitter)
- Attempts: `maxAttempts` (default `8`)

Retry state is kept **in-memory per `log_id`** (`attempts` + `nextAttemptAtMs`) to avoid spamming.

Important nuance:

- Because attempts are not persisted, `maxAttempts` is effectively **per process run**.
- The durable bit is `reply_status` in SQLite: `pending` survives restarts, so the worker can resume.

### Rate limits in the worker

If `replyToComment(...)` throws `RedditRateLimitError`, the worker:

- Uses Reddit’s `retryAfterMs` (clamped to `maxBackoffMs`) as the delay for the next attempt.
- Still counts it as an attempt for that process run.

### Permanent failures

A pending log is marked `failed_permanently` when:

- Reddit returns a non-429 client error (`RedditApiError` with HTTP `4xx`), or
- The worker hits `maxAttempts` within a single process run.

Once marked `failed_permanently`, it will no longer be picked up because the worker only queries rows with `reply_status = 'pending'`.

---

## “Error Replies” (best-effort replies)

Some replies are **not** part of the durable pending-replies pipeline.

These are user-facing “you did something wrong / can’t do that” replies sent directly by `handleKebabComment`:

- Parse error (`renderKebabParseErrorReply(...)`)
- Cooldown rejection (`renderKebabCooldownReply(...)`)
- Future-date rejection (`renderKebabFutureDateReply(...)`)

Behavior:

- They are sent via a `replyBestEffort(...)` helper.
- Any failure (including `RedditRateLimitError`) is **logged and swallowed**.
- They are **not written to SQLite**, so they are **not retried after restart**.

Why this tradeoff exists:

- Error replies are helpful UX, but the bot prioritizes keeping the main poller loop moving.
- Durable retries are reserved for the “real” dashboard reply for accepted logs.

---

## Cursor safety and idempotency (why retries are safe)

- The poller persists its cursor (`comments.cursor.fullname`) in `bot_state` after each successfully processed comment.
- If `onNewComment` throws for a specific comment, the poller does **not** advance the cursor past it (the next poll iteration will retry).
- The DB enforces at-most-once insertion per comment via `kebab_logs.comment_id UNIQUE`.
