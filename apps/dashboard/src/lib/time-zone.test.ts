import { describe, expect, it } from "vitest";

import { isValidTimeZone, localDay } from "./time-zone";

describe("isValidTimeZone", () => {
  it.each(["UTC", "America/New_York", "Europe/Madrid", "Asia/Kolkata"])("accepts %s", (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(["", "Not/AZone", "New York", "../etc", "UTC; DROP"])("rejects %j", (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe("localDay", () => {
  const instant = new Date("2026-11-11T02:00:00Z");

  it("names the day on the clock of the zone", () => {
    expect(localDay(instant, "America/New_York")).toBe("2026-11-10");
    expect(localDay(instant, "UTC")).toBe("2026-11-11");
    expect(localDay(instant, "Asia/Tokyo")).toBe("2026-11-11");
  });
});
