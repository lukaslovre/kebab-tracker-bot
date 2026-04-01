import express from "express";
import { createServer, getServerPort } from "@devvit/web/server";
import type { OnCommentSubmitRequest, OnPostSubmitRequest } from "@devvit/web/shared";

import { handleKebabTrigger } from "../modules/kebab/handleTrigger";

const app = express();

app.use(express.json());

app.post("/internal/on-comment-submit", async (req, res) => {
  try {
    const { comment, author } = req.body as OnCommentSubmitRequest;

    if (!comment || !author) {
      res.json({ status: "ok" });
      return;
    }

    await handleKebabTrigger({
      kind: "comment",
      itemId: comment.id,
      authorName: author.name,
      text: comment.body,
    });
  } catch (error) {
    console.error("[kebab] Comment trigger handler crashed", { error });
  }

  res.json({ status: "ok" });
});

app.post("/internal/on-post-submit", async (req, res) => {
  try {
    const { post, author } = req.body as OnPostSubmitRequest;

    if (!post || !author) {
      res.json({ status: "ok" });
      return;
    }

    const parts = [post.title, post.selftext].filter((p): p is string =>
      Boolean(p && p.trim()),
    );

    await handleKebabTrigger({
      kind: "post",
      itemId: post.id,
      authorName: author.name,
      text: parts.join("\n\n"),
    });
  } catch (error) {
    console.error("[kebab] Post trigger handler crashed", { error });
  }

  res.json({ status: "ok" });
});

const server = createServer(app);
server.listen(getServerPort());
