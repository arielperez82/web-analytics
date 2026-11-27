import { describe, expect, it } from "vitest";

import { closedWindow, comparedWindow, isValidInstant } from "./compare-window";
import { rangeToParams } from "./time-range";

const days = (date_from: string, date_to: string) => ({ date_from, date_to });
const hours = (from_at: string, to_at: string) => ({ from_at, to_at });

describe("comparedWindow in whole days", () => {
  it("puts the previous period right before, as long as the current one", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-11-10", "2026-11-16"), zone: "UTC" })).toEqual({
      compare_from: "2026-11-03",
      compare_to: "2026-11-09",
    });
  });

  it("compares a single day with the day before", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-11-18", "2026-11-18"), zone: "UTC" })).toEqual({
      compare_from: "2026-11-17",
      compare_to: "2026-11-17",
    });
  });

  it("shifts the same days back one week for last week", () => {
    expect(comparedWindow({ compare: "last_week", window: days("2026-11-10", "2026-11-16"), zone: "UTC" })).toEqual({
      compare_from: "2026-11-03",
      compare_to: "2026-11-09",
    });
  });

  it("compares a long range with the days before it, across a month end", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-03-01", "2026-03-30"), zone: "UTC" })).toEqual({
      compare_from: "2026-01-30",
      compare_to: "2026-02-28",
    });
  });

  it("keeps a whole month as long as the month", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-03-01", "2026-03-31"), zone: "UTC" })).toEqual({
      compare_from: "2026-01-29",
      compare_to: "2026-02-28",
    });
  });

  it("crosses a year end", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-01-01", "2026-01-07"), zone: "UTC" })).toEqual({
      compare_from: "2025-12-25",
      compare_to: "2025-12-31",
    });
  });

  it("counts a leap day when shifting back a week", () => {
    expect(comparedWindow({ compare: "last_week", window: days("2028-03-01", "2028-03-07"), zone: "UTC" })).toEqual({
      compare_from: "2028-02-23",
      compare_to: "2028-02-29",
    });
  });

  it("counts whole days across a clock change, in any zone", () => {
    const window = days("2026-11-02", "2026-11-08");
    expect(comparedWindow({ compare: "last_week", window, zone: "America/New_York" })).toEqual({
      compare_from: "2026-10-26",
      compare_to: "2026-11-01",
    });
    expect(comparedWindow({ compare: "previous", window, zone: "Asia/Kolkata" })).toEqual({
      compare_from: "2026-10-26",
      compare_to: "2026-11-01",
    });
  });

  it("shifts a three-day window by seven days, not by its length, for last week", () => {
    const window = days("2026-11-10", "2026-11-12");
    expect(comparedWindow({ compare: "last_week", window, zone: "UTC" })).toEqual({
      compare_from: "2026-11-03",
      compare_to: "2026-11-05",
    });
    expect(comparedWindow({ compare: "previous", window, zone: "UTC" })).toEqual({
      compare_from: "2026-11-07",
      compare_to: "2026-11-09",
    });
  });

  it("shifts a whole month by seven days for last week and by its length for previous", () => {
    const window = days("2026-11-01", "2026-11-30");
    expect(comparedWindow({ compare: "last_week", window, zone: "UTC" })).toEqual({
      compare_from: "2026-10-25",
      compare_to: "2026-11-23",
    });
    expect(comparedWindow({ compare: "previous", window, zone: "UTC" })).toEqual({
      compare_from: "2026-10-02",
      compare_to: "2026-10-31",
    });
  });

  describe("the calendar presets compare with the equal-length window just before", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const previousOf = (preset: "this_week" | "this_month" | "this_year") =>
      comparedWindow({ compare: "previous", window: rangeToParams({ preset }, now, "UTC"), zone: "UTC" });

    it("compares this week so far with the days right before Monday", () => {
      expect(previousOf("this_week")).toEqual({ compare_from: "2026-11-13", compare_to: "2026-11-15" });
    });

    it("compares this month so far with the days right before the 1st", () => {
      expect(previousOf("this_month")).toEqual({ compare_from: "2026-10-14", compare_to: "2026-10-31" });
    });

    it("compares this year so far with as many days right before January 1st", () => {
      expect(previousOf("this_year")).toEqual({ compare_from: "2025-02-13", compare_to: "2025-12-31" });
    });
  });

  it("has no comparison that would reach before year 1", () => {
    expect(comparedWindow({ compare: "previous", window: days("0001-01-01", "0001-01-03"), zone: "UTC" })).toBeUndefined();
    expect(comparedWindow({ compare: "last_week", window: days("0001-01-03", "0001-01-05"), zone: "UTC" })).toBeUndefined();
  });

  it("refuses a day the calendar does not have", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-02-29", "2026-03-02"), zone: "UTC" })).toBeUndefined();
  });

  it("ignores instants that are not part of the request", () => {
    expect(comparedWindow({ compare: "previous", window: days("2026-11-10", "2026-11-10"), zone: "UTC" })).not.toHaveProperty(
      "compare_from_at",
    );
  });

  it.each([
    ["only a start", { date_from: "2026-11-10" }],
    ["only an end", { date_to: "2026-11-10" }],
    ["nothing", {}],
    ["an end before the start", days("2026-11-10", "2026-11-09")],
    ["a start that is not a day", days("yesterday", "2026-11-09")],
    ["an end that is not a day", days("2026-11-01", "2026-13-40")],
  ])("has no comparison for %s", (_name, window) => {
    expect(comparedWindow({ compare: "previous", window, zone: "UTC" })).toBeUndefined();
  });
});

describe("comparedWindow in exact hours", () => {
  it("puts the previous window right before, as long as the current one", () => {
    expect(
      comparedWindow({ compare: "previous", window: hours("2026-11-17T16:00:00Z", "2026-11-18T16:00:00Z"), zone: "UTC" }),
    ).toEqual({ compare_from_at: "2026-11-16T16:00:00Z", compare_to_at: "2026-11-17T16:00:00Z" });
  });

  it("starts at the same local time a week earlier for last week", () => {
    expect(
      comparedWindow({ compare: "last_week", window: hours("2026-11-17T16:00:00Z", "2026-11-18T16:00:00Z"), zone: "UTC" }),
    ).toEqual({ compare_from_at: "2026-11-10T16:00:00Z", compare_to_at: "2026-11-11T16:00:00Z" });
  });

  it("keeps the same local start across the fall clock change and the same length", () => {
    expect(
      comparedWindow({
        compare: "last_week",
        window: hours("2026-11-08T05:00:00Z", "2026-11-09T05:00:00Z"),
        zone: "America/New_York",
      }),
    ).toEqual({ compare_from_at: "2026-11-01T04:00:00Z", compare_to_at: "2026-11-02T04:00:00Z" });
  });

  it("keeps the same local start across the spring clock change and the same length", () => {
    expect(
      comparedWindow({
        compare: "last_week",
        window: hours("2026-03-15T04:00:00Z", "2026-03-16T04:00:00Z"),
        zone: "America/New_York",
      }),
    ).toEqual({ compare_from_at: "2026-03-08T05:00:00Z", compare_to_at: "2026-03-09T05:00:00Z" });
  });

  it("measures the previous window in elapsed hours across a clock change", () => {
    expect(
      comparedWindow({
        compare: "previous",
        window: hours("2026-11-02T05:00:00Z", "2026-11-03T05:00:00Z"),
        zone: "America/New_York",
      }),
    ).toEqual({ compare_from_at: "2026-11-01T05:00:00Z", compare_to_at: "2026-11-02T05:00:00Z" });
  });

  it("reads the local time in a zone with a half hour offset", () => {
    expect(
      comparedWindow({
        compare: "last_week",
        window: hours("2026-11-10T18:30:00Z", "2026-11-11T18:30:00Z"),
        zone: "Asia/Kolkata",
      }),
    ).toEqual({ compare_from_at: "2026-11-03T18:30:00Z", compare_to_at: "2026-11-04T18:30:00Z" });
  });

  it("keeps a local start that is not on midnight across the spring clock change", () => {
    expect(
      comparedWindow({
        compare: "last_week",
        window: hours("2026-03-15T07:30:00Z", "2026-03-16T07:30:00Z"),
        zone: "America/New_York",
      }),
    ).toEqual({ compare_from_at: "2026-03-08T07:30:00Z", compare_to_at: "2026-03-09T07:30:00Z" });
  });

  it("settles a local start that does not exist a week earlier on the instant before the gap", () => {
    expect(
      comparedWindow({
        compare: "last_week",
        window: hours("2026-03-15T06:30:00Z", "2026-03-16T06:30:00Z"),
        zone: "America/New_York",
      }),
    ).toEqual({ compare_from_at: "2026-03-08T06:30:00Z", compare_to_at: "2026-03-09T06:30:00Z" });
  });

  it("settles a local start that happens twice a week earlier on its first occurrence", () => {
    expect(
      comparedWindow({
        compare: "last_week",
        window: hours("2026-11-08T06:30:00Z", "2026-11-09T06:30:00Z"),
        zone: "America/New_York",
      }),
    ).toEqual({ compare_from_at: "2026-11-01T05:30:00Z", compare_to_at: "2026-11-02T05:30:00Z" });
  });

  it("goes back across a month end", () => {
    expect(
      comparedWindow({ compare: "last_week", window: hours("2026-12-03T00:00:00Z", "2026-12-04T00:00:00Z"), zone: "UTC" }),
    ).toEqual({ compare_from_at: "2026-11-26T00:00:00Z", compare_to_at: "2026-11-27T00:00:00Z" });
  });

  it("accepts offsets in the instants", () => {
    expect(
      comparedWindow({
        compare: "previous",
        window: hours("2026-11-17T17:00:00+01:00", "2026-11-18T17:00:00+01:00"),
        zone: "Europe/Madrid",
      }),
    ).toEqual({ compare_from_at: "2026-11-16T16:00:00Z", compare_to_at: "2026-11-17T16:00:00Z" });
  });

  it("takes the instants over the days when both are given", () => {
    expect(
      comparedWindow({
        compare: "previous",
        window: { ...days("2026-11-17", "2026-11-18"), ...hours("2026-11-17T16:00:00Z", "2026-11-18T16:00:00Z") },
        zone: "UTC",
      }),
    ).toEqual({ compare_from_at: "2026-11-16T16:00:00Z", compare_to_at: "2026-11-17T16:00:00Z" });
  });

  it.each([
    ["a day the calendar does not have", hours("2023-02-31T00:00:00Z", "2023-03-02T00:00:00Z")],
    ["hour 24", hours("2026-11-10T24:00:00Z", "2026-11-12T00:00:00Z")],
    ["minute 60", hours("2026-11-10T00:60:00Z", "2026-11-12T00:00:00Z")],
    ["an offset beyond a day", hours("2026-11-10T00:00:00+24:00", "2026-11-12T00:00:00Z")],
    ["year 0", hours("0000-01-01T00:00:00Z", "0000-01-02T00:00:00Z")],
  ])("has no comparison for %s", (_name, window) => {
    expect(comparedWindow({ compare: "previous", window, zone: "UTC" })).toBeUndefined();
  });

  it("has no comparison that would reach before year 1", () => {
    expect(
      comparedWindow({ compare: "previous", window: hours("0001-01-01T05:00:00Z", "0001-01-01T15:00:00Z"), zone: "UTC" }),
    ).toBeUndefined();
  });

  it.each([
    ["only a start", { from_at: "2026-11-17T16:00:00Z" }],
    ["only an end", { to_at: "2026-11-17T16:00:00Z" }],
    ["an end before the start", hours("2026-11-18T16:00:00Z", "2026-11-17T16:00:00Z")],
    ["an empty window", hours("2026-11-18T16:00:00Z", "2026-11-18T16:00:00Z")],
    ["a start that is not an instant", hours("yesterday", "2026-11-17T16:00:00Z")],
  ])("has no comparison for %s", (_name, window) => {
    expect(comparedWindow({ compare: "previous", window, zone: "UTC" })).toBeUndefined();
  });
});

describe("isValidInstant", () => {
  it.each(["2026-11-10T05:00:00Z", "2026-11-10T05:00:00+05:30", "2024-02-29T23:59:59Z"])("accepts %s", (value) => {
    expect(isValidInstant(value)).toBe(true);
  });

  it.each(["2023-02-31T00:00:00Z", "2026-11-10T24:00:00Z", "2026-11-10", "yesterday", "", "2026-11-10T05:00:00"])(
    "refuses %s",
    (value) => {
      expect(isValidInstant(value)).toBe(false);
    },
  );
});

describe("closedWindow", () => {
  const now = new Date("2026-11-18T16:20:00Z");

  it("ends an open exact window at the end of the current hour", () => {
    expect(closedWindow({ window: { from_at: "2026-11-17T17:00:00Z" }, now })).toEqual({
      from_at: "2026-11-17T17:00:00Z",
      to_at: "2026-11-18T17:00:00Z",
    });
  });

  it("ends it an hour later when now is exactly on the hour", () => {
    expect(
      closedWindow({ window: { from_at: "2026-11-17T17:00:00Z" }, now: new Date("2026-11-18T16:00:00Z") }).to_at,
    ).toBe("2026-11-18T17:00:00Z");
  });

  it("leaves a window that already has an end alone", () => {
    const window = { from_at: "2026-11-17T17:00:00Z", to_at: "2026-11-18T05:00:00Z" };
    expect(closedWindow({ window, now })).toEqual(window);
  });

  it("leaves a day window alone", () => {
    const window = { date_from: "2026-11-10", date_to: "2026-11-12" };
    expect(closedWindow({ window, now })).toEqual(window);
  });
});
