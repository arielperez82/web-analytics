import { describe, expect, it } from "vitest";

import { lineHeights, xLabels, yTicks } from "./chart-axis";

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

  it("labels the first bar of each day when bars are several hours wide, even after a clock change shifts them", () => {
    const keys = [
      "2026-03-07 22:00:00",
      "2026-03-08 02:00:00",
      "2026-03-08 06:00:00",
      "2026-03-08 09:00:00",
      "2026-03-08 13:00:00",
      "2026-03-09 01:00:00",
    ].concat(Array.from({ length: 30 }, (_, index) => `2026-03-10 ${String(index % 24).padStart(2, "0")}:00:00`));
    const labels = xLabels(keys, "hour");
    expect(labels.slice(0, 6)).toEqual(["Mar 7", "Mar 8", "", "", "", "Mar 9"]);
  });

  it("returns nothing for no bars", () => {
    expect(xLabels([], "day")).toEqual([]);
  });
});

describe("lineHeights", () => {
  it("draws both lines on one scale, against the highest value of either", () => {
    expect(
      lineHeights([
        { current: 10, previous: 40 },
        { current: 20, previous: 5 },
      ]),
    ).toEqual({ current: [25, 50], previous: [100, 12.5] });
  });

  it("leaves a missing comparison empty instead of drawing it at zero", () => {
    expect(lineHeights([{ current: 4, previous: null }]).previous).toEqual([null]);
  });

  it("draws a real zero on the floor", () => {
    expect(lineHeights([{ current: 0, previous: 8 }]).current).toEqual([0]);
  });

  it("keeps everything on the floor when nothing was counted", () => {
    expect(lineHeights([{ current: 0, previous: 0 }])).toEqual({ current: [0], previous: [0] });
    expect(lineHeights([])).toEqual({ current: [], previous: [] });
  });
});

describe("lineHeights with gaps", () => {
  it("leaves a missing value as a gap and scales from the values that exist", () => {
    expect(
      lineHeights([
        { current: null, previous: null },
        { current: 5, previous: null },
        { current: 10, previous: null },
      ]).current,
    ).toEqual([null, 50, 100]);
  });
});
