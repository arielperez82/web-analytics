import { describe, expect, it } from "vitest";

import { rangeLabel, sameRange } from "./range-label";

describe("rangeLabel", () => {
  it("uses the shortcut's own name", () => {
    expect(rangeLabel({ days: 7 })).toBe("Last 7 Days");
    expect(rangeLabel({ preset: "yesterday" })).toBe("Yesterday");
  });

  it("writes a custom span as from to to", () => {
    expect(rangeLabel({ from: "2026-11-14", to: "2026-11-21" })).toBe("2026-11-14 → 2026-11-21");
  });

  it("writes a single custom day once", () => {
    expect(rangeLabel({ from: "2026-11-14", to: "2026-11-14" })).toBe("2026-11-14");
  });

  it("tells whether two ranges are the same", () => {
    expect(sameRange({ days: 7 }, { days: 7 })).toBe(true);
    expect(sameRange({ days: 7 }, { days: 30 })).toBe(false);
    expect(sameRange({ preset: "yesterday" }, { days: 1 })).toBe(false);
  });
});
