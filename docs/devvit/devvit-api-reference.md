# Devvit API Reference: Kebab Tracker Implementation

This document provides the specific Devvit API syntax required to migrate the Kebab Tracker. Use these patterns to replace the legacy `src/reddit/` and `src/db/` modules.

## 1. App Configuration (`src/main.ts`)

Every Devvit app must register its plugins at the top level. Without these, `context.reddit` and `context.redis` will be undefined.

```typescript
import { Devvit } from "@devvit/public-api";

Devvit.configure({
  redditAPI: true, // Enables triggers, comments, and flairs
  redis: true, // Enables the Key-Value store
});

// Settings, Triggers, and Actions go below this...
export default Devvit;
```

## 2. Global Settings (Replacing `.env`)

Instead of an environment file, use `addSettings`. These are configurable by the subreddit moderator in the Reddit App UI.

```typescript
Devvit.addSettings([
  {
    name: "TRACKER_COMMAND",
    label: "Command to trigger (e.g. !kebab)",
    type: "string",
    defaultValue: "!kebab",
  },
  {
    name: "COOLDOWN_HOURS",
    label: "Cooldown period for users",
    type: "number",
    defaultValue: 4,
  },
]);

// Accessing settings inside a trigger:
const command = await context.settings.get("TRACKER_COMMAND");
```

## 3. Event Triggers (The New "Poller")

Replace the polling loop with these event listeners. They fire automatically when a user interacts with the sub.

```typescript
// Trigger for Comments
Devvit.addTrigger({
  event: "CommentSubmit",
  onEvent: async (event, context) => {
    const body = event.comment?.body;
    const author = event.author?.name;
    const commentId = event.comment?.id; // Use this for replying
    // Logic: if (body.includes(command)) { ... }
  },
});

// Trigger for Posts (Submissions)
Devvit.addTrigger({
  event: "PostSubmit",
  onEvent: async (event, context) => {
    const body = event.post?.body || event.post?.title;
    const postId = event.post?.id;
    // Logic: same as above
  },
});
```

## 4. Redis Storage (The SQLite Replacement)

Devvit Redis is a Key-Value store. Use it to store user aggregates and the global clock.

| Goal                  | Redis Method                                          |
| :-------------------- | :---------------------------------------------------- |
| **Check Cooldown**    | `await context.redis.get(key)`                        |
| **Update Last Log**   | `await context.redis.set(key, Date.now().toString())` |
| **Increment Totals**  | `await context.redis.incrBy(key, 1)`                  |
| **Add to Rating Sum** | `await context.redis.incrBy(key, ratingValue)`        |

**Pro-Tip: Handling the "First Run"**
If `await context.redis.get('global:last_timestamp')` returns `undefined`, it means this is the first kebab ever. This is your trigger to show the "Clock Started" message.

## 5. Reddit Actions (Replies & Flairs)

Use the `context.reddit` client to interact with the community.

### Replying to the Trigger

The `id` must be the "fullname" (e.g., `t1_...` for comments or `t3_...` for posts). Devvit triggers usually provide these as `event.comment.id` or `event.post.id`.

```typescript
await context.reddit.submitComment({
  id: event.comment.id,
  text: "🌯 **Kebab Logged!** \n\n (Markdown Dashboard goes here...)",
});
```

### Updating User Flair

Use this to reflect the user's "Kebab Level."

```typescript
await context.reddit.setUserFlair({
  subredditName: context.subredditName,
  username: authorName,
  text: `Kebab Level ${calculatedLevel}`,
});
```

## 6. Type Safety & Context

Each trigger provides a `context` object. This is your gateway to everything:

- `context.reddit`: API methods.
- `context.redis`: Storage methods.
- `context.subredditName`: The name of the sub the app is running in.
- `context.settings`: Access to moderator-defined configs.
