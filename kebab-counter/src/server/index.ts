import express from "express";
import { createServer, getServerPort } from "@devvit/web/server";
import type { OnCommentSubmitRequest, OnPostSubmitRequest } from "@devvit/web/shared";

const app = express();

app.use(express.json());

app.post("/internal/on-comment-submit", (req, res) => {
  const { comment, author } = req.body as OnCommentSubmitRequest;

  if (!comment || !author) {
    res.json({ status: "ok" });
    return;
  }

  console.log(`🚨 IT WORKS! Received a comment from ${author.name}: ${comment.body}`);

  res.json({ status: "ok" });
});

app.post("/internal/on-post-submit", (req, res) => {
  res.json({ status: "ok" });
});

const server = createServer(app);
server.listen(getServerPort());
