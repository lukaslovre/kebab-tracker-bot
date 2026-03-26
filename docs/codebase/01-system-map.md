# System Map

## Purpose

A high-level map of the codebase, with clear module boundaries.

## Directory map (domain boundaries)

### `src/reddit/` — Reddit API + OAuth boundary

**Responsibility:** Talk to Reddit (OAuth tokens, HTTP requests, rate limits) and expose a small typed interface to the rest of the app.

**Knows about:**

- OAuth (`RedditAuth`) and token refresh
- HTTP request details (headers, timeouts)
- Reddit API endpoints and error shapes

**Does _not_ know about:**

- Kebabs, cooldown rules, streaks, dashboards, or any domain decisions

---

### `src/poller/` — ingestion boundary

**Responsibility:** Continuously fetch new subreddit comments and hand them off to a callback.

**Knows about:**

- “New comments” as a stream
- Cursoring (persisted last-seen fullname) and basic retry/backoff

**Does _not_ know about:**

- `!kebab` commands or any domain parsing
- SQLite schema details

---

### `src/kebab/` — kebab domain boundary

**Responsibility:** All kebab-specific behavior: parsing `!kebab` commands, interpreting backdates in the Croatian timezone, deciding what to record, and generating reply markdown.

**Knows about:**

- `!kebab` command syntax (parser)
- Domain time rules (e.g. backdating, `Europe/Zagreb`)
- Which DB operations are needed to record a log and render a dashboard reply

**Does _not_ know about:**

- Raw HTTP (`fetch`, headers, OAuth)

**Note:** `src/kebab/` _may call_ `RedditClient` methods (e.g. “reply to this comment”), but it does not implement HTTP itself — that stays inside `src/reddit/`.

---

### `src/db/` — persistence boundary

**Responsibility:** SQLite schema + transactions that enforce invariants (idempotency, cooldown window) and provide query helpers for rendering replies.

**Knows about:**

- SQLite tables/indexes and stored fields (UTC ISO strings)
- Transactional rules (at-most-once per comment, cooldown enforcement)
- Bot state needed for restart-safety (e.g. comment cursor)

**Does _not_ know about:**

- Reddit HTTP details
- How replies are formatted (markdown/templates)

---

## Where orchestration lives

- `src/index.ts` wires everything together: loads config/logger, opens the DB, creates the Reddit client, starts the poller, and starts the pending-replies worker.

## Supporting folders (brief)

- `src/templates/`: localized reply rendering (Croatian markdown).
- `src/utils/`: generic helpers (sleep, timeouts, small data structures).
