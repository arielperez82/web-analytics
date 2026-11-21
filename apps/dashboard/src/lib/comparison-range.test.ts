import { describe, expect, it } from "vitest";

import { comparisonRange } from "./comparison-range";

const wednesday = new Date("2026-11-18T12:00:00Z");
const previous = (range: Parameters<typeof comparisonRange>[0]["range"], now = wednesday, zone = "UTC") =>
  comparisonRange({ range, now, zone, mode: "previous" });

describe("comparisonRange", () => {
  describe("the previous period", () => {
    it("compares today with yesterday", () => {
      expect(previous({ days: 1 })).toEqual({ date_from: "2026-11-17", date_to: "2026-11-17" });
    });

    it("compares yesterday with the day before", () => {
      expect(previous({ preset: "yesterday" })).toEqual({ date_from: "2026-11-16", date_to: "2026-11-16" });
    });

    it("compares the last N days with the N days before them", () => {
      expect(previous({ days: 30 })).toEqual({ date_from: "2026-09-20", date_to: "2026-10-19" });
    });

    it("compares a custom range with the equally long range before it", () => {
      expect(previous({ from: "2026-11-10", to: "2026-11-16" })).toEqual({
        date_from: "2026-11-03",
        date_to: "2026-11-09",
      });
    });

    it("compares this week so far with the same days of last week", () => {
      expect(previous({ preset: "this_week" })).toEqual({ date_from: "2026-11-09", date_to: "2026-11-11" });
    });

    it("compares this month so far with the same days of last month", () => {
      expect(previous({ preset: "this_month" })).toEqual({ date_from: "2026-10-01", date_to: "2026-10-18" });
    });

    it("stops last month's days at its end when it is shorter", () => {
      expect(previous({ preset: "this_month" }, new Date("2026-03-30T12:00:00Z"))).toEqual({
        date_from: "2026-02-01",
        date_to: "2026-02-28",
      });
    });

    it("compares this year so far with the same days of last year", () => {
      expect(previous({ preset: "this_year" })).toEqual({ date_from: "2025-01-01", date_to: "2025-11-18" });
    });

    it("stops last year's days at its end when a leap day has no counterpart", () => {
      expect(previous({ preset: "this_year" }, new Date("2028-02-29T12:00:00Z"))).toEqual({
        date_from: "2027-01-01",
        date_to: "2027-02-28",
      });
    });

    it("compares the last 12 months with the 12 months before them", () => {
      expect(previous({ preset: "last_12_months" })).toEqual({ date_from: "2024-11-19", date_to: "2025-11-18" });
    });

    it("has nothing to compare all time with", () => {
      expect(previous({ preset: "all_time" })).toBeUndefined();
    });

    it("reads today on the clock of the zone", () => {
      expect(previous({ days: 1 }, new Date("2026-11-18T02:00:00Z"), "America/New_York")).toEqual({
        date_from: "2026-11-16",
        date_to: "2026-11-16",
      });
    });
  });

  describe("the same period a week earlier", () => {
    it("compares today with the same day last week", () => {
      expect(comparisonRange({ range: { days: 1 }, now: wednesday, zone: "UTC", mode: "last_week" })).toEqual({
        date_from: "2026-11-11",
        date_to: "2026-11-11",
      });
    });

    it("compares yesterday with the same day last week", () => {
      expect(
        comparisonRange({ range: { preset: "yesterday" }, now: wednesday, zone: "UTC", mode: "last_week" }),
      ).toEqual({ date_from: "2026-11-10", date_to: "2026-11-10" });
    });
  });

  describe("the last 24 hours", () => {
    const hours = { preset: "last_24_hours" } as const;
    const wednesdayAfternoon = new Date("2026-11-18T15:30:00Z");

    it("compares with the 24 hours before it", () => {
      expect(previous(hours, wednesdayAfternoon)).toEqual({
        date_from: "2026-11-16",
        date_to: "2026-11-17",
        from_at: "2026-11-16T16:00:00Z",
      });
    });

    it("compares with the same hours a week earlier when asked", () => {
      expect(comparisonRange({ range: hours, now: wednesdayAfternoon, zone: "UTC", mode: "last_week" })).toEqual({
        date_from: "2026-11-10",
        date_to: "2026-11-11",
        from_at: "2026-11-10T16:00:00Z",
      });
    });
  });
});
