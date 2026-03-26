import { describe, expect, it } from "bun:test";
import { parseKebabCommand } from "./parser";

describe("parseKebabCommand", () => {
  it("returns found:false when no command exists", () => {
    expect(parseKebabCommand("hello world")).toEqual({ found: false });
  });

  it("parses a basic command", () => {
    const res = parseKebabCommand("!kebab");
    expect(res.found).toBe(true);
    if (res.found && "ok" in res && res.ok) {
      expect(res.rating).toBeNull();
      expect(res.backdate).toBeNull();
    }
  });

  it("parses rating and date in any order", () => {
    const a = parseKebabCommand("!kebab 8/10 2026-03-15");
    expect(a.found).toBe(true);
    if (a.found && "ok" in a && a.ok) {
      expect(a.rating).toBe(8);
      expect(a.backdate?.date).toBe("2026-03-15");
      expect(a.backdate?.time).toBeUndefined();
    }

    const b = parseKebabCommand("!kebab 2026-03-15 18:30 9/10");
    expect(b.found).toBe(true);
    if (b.found && "ok" in b && b.ok) {
      expect(b.rating).toBe(9);
      expect(b.backdate?.date).toBe("2026-03-15");
      expect(b.backdate?.time).toBe("18:30");
    }
  });

  it("rejects invalid rating", () => {
    const res = parseKebabCommand("!kebab 12/10");
    expect(res.found).toBe(true);
    if (res.found && "ok" in res && res.ok === false) {
      expect(res.kind).toBe("invalid_rating");
    } else {
      throw new Error("Expected invalid rating error");
    }
  });
});
