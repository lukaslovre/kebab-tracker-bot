import { describe, expect, it } from "bun:test";
import { getKebabLevel } from "./levels";

describe("getKebabLevel", () => {
  it("uses the configured itemsPerLevel threshold", () => {
    expect(getKebabLevel(4, 3)).toEqual({
      level: 2,
      title: "Lepinja šegrt",
    });
    expect(getKebabLevel(6, 3)).toEqual({
      level: 3,
      title: "Döner znalac",
    });
  });
});
