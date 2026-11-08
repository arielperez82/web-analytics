import { describe, expect, it } from "vitest";

import { rangeToParams } from "./time-range";

const now = new Date("2026-11-07T15:30:00Z");

describe("rangeToParams", () => {
  it("covers the last N days inclusive of today", () => {
    expect(rangeToParams({ days: 7 }, now)).toEqual({
      date_from: "2026-11-01",
      date_to: "2026-11-07",
      days: "7",
    });
  });

  it("handles a one-day range", () => {
    expect(rangeToParams({ days: 1 }, now)).toEqual({
      date_from: "2026-11-07",
      date_to: "2026-11-07",
      days: "1",
    });
  });

  it("crosses month and year boundaries", () => {
    expect(rangeToParams({ days: 30 }, new Date("2026-01-10T00:00:00Z"))).toEqual({
      date_from: "2025-12-12",
      date_to: "2026-01-10",
      days: "30",
    });
  });

  it("passes a custom range through with its inclusive day count", () => {
    expect(rangeToParams({ from: "2026-11-01", to: "2026-11-03" }, now)).toEqual({
      date_from: "2026-11-01",
      date_to: "2026-11-03",
      days: "3",
    });
  });

  it("counts a single custom day as one day", () => {
    expect(rangeToParams({ from: "2026-11-05", to: "2026-11-05" }, now)).toMatchObject({ days: "1" });
  });
});
