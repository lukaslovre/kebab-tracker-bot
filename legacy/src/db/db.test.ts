import { describe, expect, it } from "bun:test";
import { createLogger } from "../logger";
import { KebabDb } from "./db";

describe("KebabDb", () => {
  it("persists and loads the poller cursor", () => {
    const db = KebabDb.open({
      dbPath: ":memory:",
      cooldownMs: 1,
      logger: createLogger({ level: "error" }),
    });

    expect(db.getCommentsCursorFullname()).toBeUndefined();
    db.setCommentsCursorFullname("t1_abc123");
    expect(db.getCommentsCursorFullname()).toBe("t1_abc123");

    db.close();
  });

  it("records a basic kebab log idempotently", () => {
    const db = KebabDb.open({
      dbPath: ":memory:",
      cooldownMs: 60 * 60 * 1000,
      logger: createLogger({ level: "error" }),
    });

    const nowSeconds = Math.floor(Date.now() / 1000);

    const first = db.recordBasicKebabLogFromComment({
      username: "alice",
      commentId: "c1",
      createdUtcSeconds: nowSeconds,
    });
    expect(first.status).toBe("inserted");

    const dup = db.recordBasicKebabLogFromComment({
      username: "alice",
      commentId: "c1",
      createdUtcSeconds: nowSeconds,
    });
    expect(dup.status).toBe("duplicate");

    db.close();
  });

  it("enforces cooldown for rapid repeat logs", () => {
    const db = KebabDb.open({
      dbPath: ":memory:",
      cooldownMs: 10_000,
      logger: createLogger({ level: "error" }),
    });

    const t0 = Math.floor(Date.now() / 1000);

    const first = db.recordBasicKebabLogFromComment({
      username: "bob",
      commentId: "c1",
      createdUtcSeconds: t0,
    });
    expect(first.status).toBe("inserted");

    const second = db.recordBasicKebabLogFromComment({
      username: "bob",
      commentId: "c2",
      createdUtcSeconds: t0 + 1,
    });
    expect(second.status).toBe("cooldown");

    db.close();
  });

  it("rejects future-dated eatenAt timestamps", () => {
    const db = KebabDb.open({
      dbPath: ":memory:",
      cooldownMs: 1,
      logger: createLogger({ level: "error" }),
    });

    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const res = db.recordKebabLog({
      username: "carol",
      commentId: "cfuture",
      eatenAtUtc: future,
      loggedAtUtc: now,
      rating: null,
      isBackdated: true,
    });

    expect(res.status).toBe("rejected_future");

    db.close();
  });
});
