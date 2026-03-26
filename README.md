# kebab-tracker-bot

Reddit bot that tracks a configurable tracker command (default: `!kebab`) for a single subreddit and replies with a unified “dashboard” (global streak + personal streak + stats).

To install dependencies:

```bash
bun install
```

Create your local environment file:

```bash
cp .env.example .env
```

Required env vars for the bot:

- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` (script app)
- `REDDIT_USERNAME`, `REDDIT_PASSWORD` (bot account)
- `USER_AGENT` (required by Reddit)
- `SUBREDDIT_NAME` (e.g. `KebabLog`)

To run:

```bash
bun run dev
```

Type-check (no emit):

```bash
bun run typecheck
```

Format:

```bash
bun run format
```

Check formatting without changing files:

```bash
bun run format:check
```

Run tests:

```bash
bun run test
```

The test script uses Bun's built-in runner and keeps working even before you
add any test files.

## Deployment (Docker / Coolify)

This repo ships a Bun-based [Dockerfile](Dockerfile) intended for running on a
small VPS via Coolify.

### Persistent SQLite storage

The bot uses a single SQLite file. In Docker you must mount a volume so data
survives redeployments.

- Container path: `/app/data`
- DB file inside container: `/app/data/kebab.db`
- Set `DB_PATH=/app/data/kebab.db`

Example Coolify volume mapping:

- Host: `/data/kebab-bot`
- Container: `/app/data`

### Required env vars

Configure these in Coolify “Variables” (or in a local `.env`):

- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`, `REDDIT_PASSWORD`
- `USER_AGENT`
- `SUBREDDIT_NAME`
- `DB_PATH`

Optional env vars (see `.env.example` for defaults):

- `DEFAULT_TIMEZONE`
- `ITEMS_PER_LEVEL`
- `TRACKER_COMMAND`
- `POLL_INTERVAL_MS`
- `REQUEST_TIMEOUT_MS`
- `KEBAB_COOLDOWN_HOURS`
- `LOG_LEVEL`

## Runbook / Ops

### What “healthy” looks like

In logs you should see:

- `Bot starting` once at boot
- `Bot heartbeat` every ~5 minutes
- `New comments observed` when new comments arrive
- `Kebab log recorded (reply pending)` when a tracker command was accepted
- `Replied to pending log` when the bot posts the dashboard reply

### If it stops replying

1. Check logs for `Rate limited` / backoff messages.
2. Watch `pendingReplies` in `Bot heartbeat` — if it grows, replies are failing.
3. Verify the bot account is a moderator (or can comment) in the target subreddit.
4. Confirm the deployed `DB_PATH` points to the mounted volume and is writable.
5. Confirm `USER_AGENT` is set (Reddit may throttle/deny generic agents).

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
