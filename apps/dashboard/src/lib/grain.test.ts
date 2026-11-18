import { describe, expect, it } from "vitest";

import { effectiveGrain, hourAvailable } from "./grain";

const week = { date_from: "2026-11-10", date_to: "2026-11-16" };
const day = { date_from: "2026-11-10", date_to: "2026-11-10" };
const month = { date_from: "2026-10-18", date_to: "2026-11-16" };

describe("hourAvailable", () => {
  it("is true while the hours fit a chart of at most 200 bars, which is eight days", () => {
    expect(hourAvailable(day)).toBe(true);
    expect(hourAvailable(week)).toBe(true);
    expect(hourAvailable({ date_from: "2026-11-09", date_to: "2026-11-16" })).toBe(true);
    expect(hourAvailable({ date_from: "2026-11-08", date_to: "2026-11-16" })).toBe(false);
    expect(hourAvailable(month)).toBe(false);
  });
});

describe("effectiveGrain", () => {
  it("follows the viewer's choice when hours are available", () => {
    expect(effectiveGrain({ grain: "hour", params: week })).toBe("hour");
    expect(effectiveGrain({ grain: "day", params: day })).toBe("day");
  });

  it("defaults to hours for a single day and days otherwise", () => {
    expect(effectiveGrain({ grain: undefined, params: day })).toBe("hour");
    expect(effectiveGrain({ grain: undefined, params: week })).toBe("day");
  });

  it("falls back to days when the range is too long for hours, whatever was chosen", () => {
    expect(effectiveGrain({ grain: "hour", params: month })).toBe("day");
  });
});
