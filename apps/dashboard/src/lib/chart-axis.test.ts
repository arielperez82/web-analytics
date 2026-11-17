import { describe, expect, it } from "vitest";

import { xLabels, yTicks } from "./chart-axis";

describe("yTicks", () => {
  it("marks the top, the middle and zero, placed where the bars put them", () => {
    expect(yTicks([7, 40, 12])).toEqual([
      { value: 40, percent: 100 },
      { value: 20, percent: 50 },
      { value: 0, percent: 0 },
    ]);
  });

  it("rounds the middle tick to a whole count and places it at its real height", () => {
    expect(yTicks([9])[1]).toEqual({ value: 5, percent: 55.56 });
  });

  it("leaves out the middle tick for counts too small to halve", () => {
    expect(yTicks([3, 1])).toEqual([
      { value: 3, percent: 100 },
      { value: 0, percent: 0 },
    ]);
  });

  it("shows only zero when nothing was counted", () => {
    expect(yTicks([0, 0])).toEqual([{ value: 0, percent: 0 }]);
    expect(yTicks([])).toEqual([{ value: 0, percent: 0 }]);
  });
});

describe("xLabels", () => {
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) => `2026-11-${String(10 + index).padStart(2, "0")}`);

  it("names every day of a week", () => {
    expect(xLabels(days(7), "day")).toEqual(["Nov 10", "Nov 11", "Nov 12", "Nov 13", "Nov 14", "Nov 15", "Nov 16"]);
  });

  it("names every other day once there are more than a week", () => {
    const labels = xLabels(days(14), "day");
    expect(labels.slice(0, 4)).toEqual(["Nov 10", "", "Nov 12", ""]);
    expect(labels).toHaveLength(14);
  });

  it("labels hours with the clock time, every fourth hour of a day", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => `2026-11-10 ${String(hour).padStart(2, "0")}:00:00`);
    const labels = xLabels(hours, "hour");
    expect(labels.filter((label) => label !== "")).toEqual(["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"]);
  });

  it("labels only the midnights, with the date, once the hours span several days", () => {
    const hours = Array.from({ length: 72 }, (_, index) => {
      const day = 10 + Math.floor(index / 24);
      return `2026-11-${String(day)} ${String(index % 24).padStart(2, "0")}:00:00`;
    });
    const labels = xLabels(hours, "hour");
    expect(labels.filter((label) => label !== "")).toEqual(["Nov 10", "Nov 11", "Nov 12"]);
    expect(labels[0]).toBe("Nov 10");
    expect(labels[24]).toBe("Nov 11");
  });

  it("returns nothing for no bars", () => {
    expect(xLabels([], "day")).toEqual([]);
  });
});
