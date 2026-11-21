import { describe, expect, it } from "vitest";

import { hourlyRequest, hourWindow, zonedHour } from "./hour-window";

describe("hourWindow", () => {
  it("is the UTC span of the local days", () => {
    expect(hourWindow({ date_from: "2026-11-10", date_to: "2026-11-10" }, "America/New_York")).toEqual({
      from_at: "2026-11-10T05:00:00Z",
      to_at: "2026-11-11T05:00:00Z",
    });
  });

  it("starts the day before UTC for a zone ahead of it", () => {
    expect(hourWindow({ date_from: "2026-11-10", date_to: "2026-11-11" }, "Asia/Tokyo")).toEqual({
      from_at: "2026-11-09T15:00:00Z",
      to_at: "2026-11-11T15:00:00Z",
    });
  });

  it("follows the clock change inside the range", () => {
    expect(hourWindow({ date_from: "2026-11-01", date_to: "2026-11-02" }, "America/New_York")).toEqual({
      from_at: "2026-11-01T04:00:00Z",
      to_at: "2026-11-03T05:00:00Z",
    });
  });

  it("is the plain UTC days in UTC", () => {
    expect(hourWindow({ date_from: "2026-11-10", date_to: "2026-11-10" }, "UTC")).toEqual({
      from_at: "2026-11-10T00:00:00Z",
      to_at: "2026-11-11T00:00:00Z",
    });
  });
});

describe("zonedHour", () => {
  it("shows a UTC hour on the clock of the zone", () => {
    expect(zonedHour("2026-11-10 05:00:00", "America/New_York")).toBe("2026-11-10 00:00:00");
    expect(zonedHour("2026-11-10 23:00:00", "Asia/Tokyo")).toBe("2026-11-11 08:00:00");
    expect(zonedHour("2026-11-10 09:00:00", "UTC")).toBe("2026-11-10 09:00:00");
  });
});

describe("hourlyRequest", () => {
  it("asks for one-hour buckets for a day and four-hour buckets for a month", () => {
    expect(hourlyRequest({ date_from: "2026-11-10", date_to: "2026-11-10" }).bucket_hours).toBe("1");
    expect(hourlyRequest({ date_from: "2026-10-18", date_to: "2026-11-16" }).bucket_hours).toBe("4");
  });

  it("asks for the 24 hours from an exact start, and nothing about days", () => {
    expect(
      hourlyRequest({ date_from: "2026-11-06", date_to: "2026-11-07", from_at: "2026-11-06T16:00:00Z", tz: "UTC" }),
    ).toEqual({ from_at: "2026-11-06T16:00:00Z", to_at: "2026-11-07T16:00:00Z", bucket_hours: "1" });
  });
});
