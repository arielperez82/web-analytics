import { describe, expect, it } from "vitest";

import { hourWindow, zonedHour } from "./hour-window";

describe("hourWindow", () => {
  it("is the UTC span of the local days", () => {
    expect(hourWindow({ date_from: "2026-11-10", date_to: "2026-11-10" }, "America/New_York")).toEqual({
      from_utc: "2026-11-10 05:00:00",
      to_utc: "2026-11-11 05:00:00",
    });
  });

  it("starts the day before UTC for a zone ahead of it", () => {
    expect(hourWindow({ date_from: "2026-11-10", date_to: "2026-11-11" }, "Asia/Tokyo")).toEqual({
      from_utc: "2026-11-09 15:00:00",
      to_utc: "2026-11-11 15:00:00",
    });
  });

  it("follows the clock change inside the range", () => {
    expect(hourWindow({ date_from: "2026-11-01", date_to: "2026-11-02" }, "America/New_York")).toEqual({
      from_utc: "2026-11-01 04:00:00",
      to_utc: "2026-11-03 05:00:00",
    });
  });

  it("is the plain UTC days in UTC", () => {
    expect(hourWindow({ date_from: "2026-11-10", date_to: "2026-11-10" }, "UTC")).toEqual({
      from_utc: "2026-11-10 00:00:00",
      to_utc: "2026-11-11 00:00:00",
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
