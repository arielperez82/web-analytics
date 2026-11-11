import { describe, expect, it } from "vitest";

import { normalizeRange } from "./date-range";

const today = "2026-11-08";

describe("normalizeRange", () => {
  it("accepts a valid range", () => {
    expect(normalizeRange("2026-11-01", "2026-11-03", today)).toEqual({ from: "2026-11-01", to: "2026-11-03" });
  });

  it("accepts a single day", () => {
    expect(normalizeRange("2026-11-05", "2026-11-05", today)).toEqual({ from: "2026-11-05", to: "2026-11-05" });
  });

  it("swaps a reversed range", () => {
    expect(normalizeRange("2026-11-03", "2026-11-01", today)).toEqual({ from: "2026-11-01", to: "2026-11-03" });
  });

  it("clamps an end date in the future to today", () => {
    expect(normalizeRange("2026-11-01", "2026-12-25", today)).toEqual({ from: "2026-11-01", to: today });
  });

  it.each([
    ["a start date in the future", "2026-11-20", "2026-11-25"],
    ["an empty start", "", "2026-11-03"],
    ["a malformed end", "2026-11-01", "11/03/2026"],
    ["an impossible date", "2026-02-31", "2026-03-02"],
  ])("rejects %s", (_name, from, to) => {
    expect(normalizeRange(from, to, today)).toBeUndefined();
  });
});
