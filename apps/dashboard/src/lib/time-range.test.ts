import { describe, expect, it } from "vitest";

import { rangeToParams } from "./time-range";

const now = new Date("2026-11-07T15:30:00Z");

describe("rangeToParams", () => {
  it("covers the last N days inclusive of today", () => {
    expect(rangeToParams({ days: 7 }, now)).toEqual({
      date_from: "2026-11-01",
      date_to: "2026-11-07",
    });
  });

  it("handles a one-day range", () => {
    expect(rangeToParams({ days: 1 }, now)).toEqual({
      date_from: "2026-11-07",
      date_to: "2026-11-07",
    });
  });

  it("sends only the two dates, never a number of days", () => {
    expect(Object.keys(rangeToParams({ days: 7 }, now)).sort()).toEqual(["date_from", "date_to"]);
  });

  it("crosses month and year boundaries", () => {
    expect(rangeToParams({ days: 30 }, new Date("2026-01-10T00:00:00Z"))).toEqual({
      date_from: "2025-12-12",
      date_to: "2026-01-10",
    });
  });

  it("passes a custom range through", () => {
    expect(rangeToParams({ from: "2026-11-01", to: "2026-11-03" }, now)).toEqual({
      date_from: "2026-11-01",
      date_to: "2026-11-03",
    });
  });

  describe("in a time zone", () => {
    const lateEvening = new Date("2026-11-08T02:00:00Z");

    it("counts today on the clock of the zone", () => {
      expect(rangeToParams({ days: 1 }, lateEvening, "America/New_York")).toEqual({
        date_from: "2026-11-07",
        date_to: "2026-11-07",
      });
    });

    it("counts back from the local today", () => {
      expect(rangeToParams({ days: 3 }, lateEvening, "America/New_York")).toEqual({
        date_from: "2026-11-05",
        date_to: "2026-11-07",
      });
    });

    it("keeps counting whole days across a daylight saving change", () => {
      expect(rangeToParams({ days: 7 }, new Date("2026-11-03T12:00:00Z"), "America/New_York")).toEqual({
        date_from: "2026-10-28",
        date_to: "2026-11-03",
      });
    });

    it("reads UTC when no zone is given", () => {
      expect(rangeToParams({ days: 1 }, lateEvening)).toEqual({
        date_from: "2026-11-08",
        date_to: "2026-11-08",
      });
    });
  });

  describe("calendar shortcuts", () => {
    const wednesday = new Date("2026-11-18T15:30:00Z");

    it("yesterday is the one day before today", () => {
      expect(rangeToParams({ preset: "yesterday" }, wednesday)).toEqual({
        date_from: "2026-11-17",
        date_to: "2026-11-17",
      });
    });

    it("this week runs from Monday to today", () => {
      expect(rangeToParams({ preset: "this_week" }, wednesday)).toEqual({
        date_from: "2026-11-16",
        date_to: "2026-11-18",
      });
    });

    it("this week on a Monday is only that day", () => {
      expect(rangeToParams({ preset: "this_week" }, new Date("2026-11-16T09:00:00Z"))).toEqual({
        date_from: "2026-11-16",
        date_to: "2026-11-16",
      });
    });

    it("this week on a Sunday reaches back six days", () => {
      expect(rangeToParams({ preset: "this_week" }, new Date("2026-11-22T09:00:00Z"))).toEqual({
        date_from: "2026-11-16",
        date_to: "2026-11-22",
      });
    });

    it("this month runs from the first to today", () => {
      expect(rangeToParams({ preset: "this_month" }, wednesday)).toEqual({
        date_from: "2026-11-01",
        date_to: "2026-11-18",
      });
    });

    it("this year runs from January 1 to today", () => {
      expect(rangeToParams({ preset: "this_year" }, wednesday)).toEqual({
        date_from: "2026-01-01",
        date_to: "2026-11-18",
      });
    });

    it("the last 12 months start the day after this day last year", () => {
      expect(rangeToParams({ preset: "last_12_months" }, wednesday)).toEqual({
        date_from: "2025-11-19",
        date_to: "2026-11-18",
      });
    });

    it("the last 12 months from a leap day start on March 1", () => {
      expect(rangeToParams({ preset: "last_12_months" }, new Date("2028-02-29T12:00:00Z"))).toEqual({
        date_from: "2027-03-01",
        date_to: "2028-02-29",
      });
    });

    it("reads the week and the month on the clock of the zone", () => {
      const sundayNightUtc = new Date("2026-11-23T02:00:00Z");

      expect(rangeToParams({ preset: "this_week" }, sundayNightUtc, "America/New_York")).toEqual({
        date_from: "2026-11-16",
        date_to: "2026-11-22",
      });
      expect(rangeToParams({ preset: "this_month" }, new Date("2026-12-01T03:00:00Z"), "America/New_York")).toEqual({
        date_from: "2026-11-01",
        date_to: "2026-11-30",
      });
    });
  });
});
