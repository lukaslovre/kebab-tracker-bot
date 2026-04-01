# Devvit Web Cheatsheet (Server-Only App)

## 1. Project Structure & Paradigm

This project uses the **Devvit Web** architecture as a headless, server-only application.

- **No Blocks UI:** Do not use `Devvit.addCustomPostType` or `Devvit.addTrigger`.
- **Configuration:** All permissions, settings, and event triggers are defined in `devvit.json`.
- **Server:** The app logic lives in `src/server/index.ts` using the **Hono** framework.
- **Unified SDK:** All server capabilities (Redis, Reddit API, Settings) are imported from `@devvit/web/server`.

---

## 2. Configuration (`devvit.json`)

This file is the source of truth for the app. It maps Reddit events to your server endpoints and defines subreddit-level settings.

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "kebab-tracker-bot",
  "server": {
    "dir": "dist/server",
    "entry": "index.cjs"
  },
  "permissions": {
    "reddit": true,
    "redis": true
  },
  "settings": {
    "subreddit": {
      "TRACKER_COMMAND": {
        "type": "string",
        "label": "Command to trigger the bot",
        "defaultValue": "!kebab"
      },
      "COOLDOWN_HOURS": {
        "type": "number",
        "label": "Cooldown period (in hours)",
        "defaultValue": 4
      },
      "ITEMS_PER_LEVEL": {
        "type": "number",
        "label": "Logs needed per level",
        "defaultValue": 5
      }
    }
  },
  "triggers": {
    "onCommentSubmit": "/internal/on-comment-submit",
    "onPostSubmit": "/internal/on-post-submit"
  }
}
```

---

## 3. Server Setup & Triggers (Hono)

Reddit will send POST requests to your internal endpoints whenever a trigger fires.

```typescript
// src/server/index.ts
import { Hono } from "hono";
import { createServer, getServerPort } from "@devvit/web/server";
import type {
  OnCommentSubmitRequest,
  OnPostSubmitRequest,
  TriggerResponse,
} from "@devvit/web/shared";

const app = new Hono();

// Handle new comments
app.post("/internal/on-comment-submit", async (c) => {
  const { comment, author } = await c.req.json<OnCommentSubmitRequest>();

  if (!comment || !author) return c.json<TriggerResponse>({ status: "ok" });

  console.log(`New comment by ${author.name}: ${comment.body}`);
  // Kebab parsing logic goes here...

  return c.json<TriggerResponse>({ status: "ok" });
});

// Handle new posts
app.post("/internal/on-post-submit", async (c) => {
  const { post, author } = await c.req.json<OnPostSubmitRequest>();
  // Post logic goes here...
  return c.json<TriggerResponse>({ status: "ok" });
});

// Boilerplate to start the server
const server = createServer(app);
server.listen(getServerPort());
```

---

## 4. Redis (Key-Value Store)

Devvit provides a built-in Redis client. Everything is stored as a string, but `incrBy` handles math automatically.

```typescript
import { redis } from "@devvit/web/server";

// Set a value
await redis.set("user:bob:last_kebab", Date.now().toString());

// Get a value
const lastKebab = await redis.get("user:bob:last_kebab");

// Increment a counter (returns the new total as a number)
const totalKebabs = await redis.incrBy("user:bob:total_kebabs", 1);

// Delete a key
await redis.del("processed:t1_abc123");
```

---

## 5. Reddit API (Replies & Flairs)

Use the native Reddit client to interact with the subreddit.

```typescript
import { reddit, context } from "@devvit/web/server";

// 1. Reply to a Comment or Post
// Note: Use the ID from the trigger event (e.g., comment.id or post.id)
await reddit.submitComment({
  postId: "t1_abcdef",
  text: "🌯 **Kebab Logged!**\n\nThe global clock has been reset.",
});

// 2. Set User Flair
await reddit.setUserFlair({
  subredditName: context.subredditName,
  username: "bob",
  text: "Level 3 Doner Novice",
});
```

---

## 6. App Settings

Access the variables defined in `devvit.json` dynamically.

```typescript
import { settings } from "@devvit/web/server";

// Retrieve settings configured by the subreddit moderator
const command = await settings.get<string>("TRACKER_COMMAND"); // e.g., "!kebab"
const cooldown = await settings.get<number>("COOLDOWN_HOURS"); // e.g., 4
```

---

## 7. CLI Commands (For the Developer)

- **`devvit playtest`**: Compiles the app, uploads it to a private test subreddit, and streams live logs to your terminal. Re-compiles automatically on file save.
- **`devvit logs <subreddit>`**: Streams historical and live logs for a specific subreddit installation.
