import { describe, expect, it } from "vitest";

import { effectiveGrain, hourAvailable, hourBucket } from "./grain";

const week = { date_from: "2026-11-10", date_to: "2026-11-16" };
const day = { date_from: "2026-11-10", date_to: "2026-11-10" };
const month = { date_from: "2026-10-18", date_to: "2026-11-16" };

describe("hourAvailable", () => {
  it("is true while four-hour buckets fit a chart of at most 200 bars, which is 33 days", () => {
    expect(hourAvailable(day)).toBe(true);
    expect(hourAvailable(week)).toBe(true);
    expect(hourAvailable(month)).toBe(true);
    expect(hourAvailable({ date_from: "2026-10-15", date_to: "2026-11-16" })).toBe(true);
    expect(hourAvailable({ date_from: "2026-10-14", date_to: "2026-11-16" })).toBe(false);
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
    expect(effectiveGrain({ grain: "hour", params: { date_from: "2026-07-01", date_to: "2026-11-16" } })).toBe("day");
  });
});

describe("hourBucket", () => {
  it("is one hour while the hours fit 200 bars, which is eight days", () => {
    expect(hourBucket(day)).toBe(1);
    expect(hourBucket({ date_from: "2026-11-09", date_to: "2026-11-16" })).toBe(1);
  });

  it("steps down to four hours beyond eight days", () => {
    expect(hourBucket({ date_from: "2026-11-08", date_to: "2026-11-16" })).toBe(4);
    expect(hourBucket(month)).toBe(4);
  });

  it("is undefined when even four-hour buckets would not fit, or the range is unknown", () => {
    expect(hourBucket({ date_from: "2026-10-14", date_to: "2026-11-16" })).toBeUndefined();
    expect(hourBucket({})).toBeUndefined();
  });
});
