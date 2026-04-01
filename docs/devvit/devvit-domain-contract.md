# Devvit Domain Contract — Kebab Tracker (Step 1)

This document locks the **data + UX contract** for the Devvit rewrite.
It is written to be implementable directly in Step 2 without further decisions.

## Locked Rules (from migration docs)

- **Event-driven only**: handle `onCommentSubmit` and `onPostSubmit`.
- **KV aggregates** (Redis) only: no per-log rows.
- **No backdating**: every accepted log uses `Date.now()`.
- **Ratings are optional**: only aggregate ratings when explicitly provided.
- **Cooldown is loud**: on cooldown, always reply with a rejection message.
- **Global “Big Bang”**: the first-ever log initializes the global clock and uses a special message.
- **Auto-flair**: on successful log, set user flair to the computed level.
- **Croatian templates**: user-facing strings are centralized; no i18n framework.

---

## Redis Key Schema (Final)

All values are stored as **strings** in Redis, but treated as **numbers** in code.
Timestamps are **milliseconds since epoch** (UTC) from `Date.now()`.

### Key normalization

- `<username>` is **normalized** for keys as: `username.trim().toLowerCase()`.
  - Example: `"LukasLovre"` → `"lukaslovre"`.
- `<item_id>` is the trigger item fullname id from Devvit:
  - Comments: `comment.id` (e.g. `t1_abc123`)
  - Posts: `post.id` (e.g. `t3_def456`)

### Keys

**Global state**

- `global:last_kebab_timestamp` → **Number (ms)**
  - Meaning: timestamp of the most recent accepted kebab log in the subreddit.
  - Written on: every successful log.
  - Read for: “Subreddit clock” delta.

**User aggregates** (per normalized username)

- `user:<username>:total_kebabs` → **Integer**
  - Meaning: total accepted logs for the user.
  - Written on: every successful log (`+1`).
  - Read for: level computation.

- `user:<username>:last_kebab_timestamp` → **Number (ms)**
  - Meaning: timestamp of the user’s most recent accepted log.
  - Written on: every successful log (overwrite).
  - Read for: cooldown + personal delta.

- `user:<username>:rating_sum` → **Integer**
  - Meaning: sum of all ratings the user has ever submitted.
  - Written on: successful log **only when rating is present** (`+rating`).

- `user:<username>:rating_count` → **Integer**
  - Meaning: count of logs that included a rating.
  - Written on: successful log **only when rating is present** (`+1`).

**Idempotency**

- `processed:<item_id>` → **String "1"**, with **TTL**
  - Meaning: this exact trigger item (comment/post) has already been processed.
  - Strategy: `redis.set(key, "1", { nx: true, expiration: new Date(Date.now() + ttlMs) })` (or equivalent) before any counters update.
  - TTL: **7 days** (enough to cover replay/duplication without leaking keys forever).
  - Behavior when present: **exit early** (no writes, no replies).

### Example snapshot (shape)

After user `LukasLovre` successfully logs a kebab with rating `8/10`:

- `global:last_kebab_timestamp` = `"<now_ms>"`
- `user:lukaslovre:total_kebabs` = `"<int>"`
- `user:lukaslovre:last_kebab_timestamp` = `"<now_ms>"`
- `user:lukaslovre:rating_sum` = `"<int>"` (incremented by `8`)
- `user:lukaslovre:rating_count` = `"<int>"` (incremented by `1`)
- `processed:t1_abc123` = `"1"` (expires in 7 days)

---

## Parsing Contract (Final)

### Input text

- **Comments**: `comment.body`
- **Posts**: `${post.title}\n\n${post.body}` (empty parts omitted)

### Command detection

- Command string comes from subreddit setting: `TRACKER_COMMAND` (default: `!kebab`).
- Detection is **case-insensitive**.
- Only the **first occurrence** of the command is considered; arguments are parsed from the text **after** it.

### Rating syntax

- Optional rating pattern: `N/10` where `N` is an integer in **[1..10]**.
- Whitespace is flexible: `8/10`, `8 / 10` are both accepted.

### Extra text after the command

- Any text after the command that is not a rating is ignored.
- Date-like text such as `YYYY-MM-DD` (optionally with time `HH:mm`) does not trigger a special error.
- There is no code path that accepts or uses user-provided timestamps.

---

## Reply Templates (Croatian) — Final Copy

All templates are **Reddit-flavored Markdown**.

### 1) Success dashboard (normal)

Header:
- `🌯 **Kebab zabilježen!**` (append ` (Ocjena: N/10)` only if rating was provided for this log)

Body:
- `🚨 **Sat subreddita:** Niz je prekinut! Sub je bio bez kebaba \`<delta>\`. Sat je resetiran na 0.`
- `⏱️ **Tvoj osobni niz:** Prošlo je \`<delta>\` od zadnjeg loga.`
- `📈 **Tvoja statistika:** Razina **<level>** — <title> (**<total>** ukupno).`
  - Append ` Prosječna ocjena: \`<avg>/10\`.` **only if** the user has at least one rated log.

### 2) “Big Bang” (first-ever global clock)

This is used when `global:last_kebab_timestamp` does not exist yet.

- `🚀 **Sat subreddita:** Prvi kebab ikad ovdje. Sat je upravo pokrenut.`

Everything else stays identical to the success dashboard.

### 3) Personal first log

Used when `user:<username>:last_kebab_timestamp` does not exist.

- `⏱️ **Tvoj osobni niz:** Ovo ti je prvi zapis. Dobrodošao!`

### 4) Cooldown rejection

- `⏳ **Polako!**`
- `Možeš logirati novi kebab za \`<remaining>\`.`
- `Probaj kasnije: \`<command>\` ili \`<command> 8/10\`.`

### 5) Parse errors

**Invalid rating** (e.g. `0/10`, `12/10`):
- `❓ **Ne kužim.** Ocjena mora biti između 1/10 i 10/10 (npr. 8/10).`

Parse error replies end with examples:
- `Primjeri: \`<command>\`, \`<command> 8/10\``

### Rendered examples

**Success (normal, rating + avg)**

```md
🌯 **Kebab zabilježen!** (Ocjena: 8/10)

🚨 **Sat subreddita:** Niz je prekinut! Sub je bio bez kebaba `2 dana, 4 sata`. Sat je resetiran na 0.
⏱️ **Tvoj osobni niz:** Prošlo je `14 dana` od zadnjeg loga.
📈 **Tvoja statistika:** Razina **3** — Döner znalac (**14** ukupno). Prosječna ocjena: `7.2/10`.
```

**Success (Big Bang + personal first, no rating lines)**

```md
🌯 **Kebab zabilježen!**

🚀 **Sat subreddita:** Prvi kebab ikad ovdje. Sat je upravo pokrenut.
⏱️ **Tvoj osobni niz:** Ovo ti je prvi zapis. Dobrodošao!
📈 **Tvoja statistika:** Razina **1** — Doner početnik (**1** ukupno).
```

**Cooldown rejection**

```md
⏳ **Polako!**

Možeš logirati novi kebab za `3 sata, 12 minuta`.

Probaj kasnije: `!kebab` ili `!kebab 8/10`.
```

---

## Leveling + Flair Contract

### Settings

- `ITEMS_PER_LEVEL` (subreddit setting, number, default `5`)

### Level computation

- `level = floor(total_kebabs / itemsPerLevel) + 1`

### Titles (locked list)

1. Doner početnik
2. Lepinja šegrt
3. Döner znalac
4. Majstor umaka
5. Kebab veteran
6. Kebab legenda
7. Kebab mit

If the computed level exceeds the list, use the last title (`Kebab mit`).

### Flair text format (locked)

- `Razina <level> — <title>`

---

## Edge Cases (Explicit)

- **First log in subreddit**: no global timestamp → Big Bang global line; then write global/user state.
- **User’s first log**: no user timestamp → “first log” personal line.
- **Rating omitted**: do not update `rating_sum`/`rating_count`; omit average rating from dashboard if the user has no rated logs.
- **Duplicate trigger delivery**: if `processed:<item_id>` exists, exit immediately (no counters changed; no reply).
- **Cooldown hit**: reply with cooldown rejection; do not update any aggregates.
