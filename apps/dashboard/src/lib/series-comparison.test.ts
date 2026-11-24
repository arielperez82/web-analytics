import { describe, expect, it } from "vitest";

import { alignSeries } from "./series-comparison";

const days = (...entries: readonly (readonly [string, number])[]) =>
  entries.map(([date, value]) => ({ date, value }));

describe("alignSeries", () => {
  it("pairs each point with the point at the same position of the comparison", () => {
    expect(
      alignSeries({
        key: "date",
        current: days(["2026-11-16", 5], ["2026-11-17", 7]),
        previous: days(["2026-11-09", 3], ["2026-11-10", 4]),
      }),
    ).toEqual([
      { label: "2026-11-16", current: 5, previousLabel: "2026-11-09", previous: 3 },
      { label: "2026-11-17", current: 7, previousLabel: "2026-11-10", previous: 4 },
    ]);
  });

  it("leaves a missing counterpart empty instead of padding it with zero", () => {
    expect(
      alignSeries({
        key: "date",
        current: days(["2026-03-29", 1], ["2026-03-30", 2], ["2026-03-31", 3]),
        previous: days(["2026-02-01", 9], ["2026-02-02", 8]),
      }).map(({ previous, previousLabel }) => [previousLabel, previous]),
    ).toEqual([
      ["2026-02-01", 9],
      ["2026-02-02", 8],
      [null, null],
    ]);
  });

  it("ignores comparison points beyond the end of the current range", () => {
    expect(
      alignSeries({
        key: "date",
        current: days(["2026-11-17", 7]),
        previous: days(["2026-11-09", 3], ["2026-11-10", 4]),
      }),
    ).toHaveLength(1);
  });

  it("keeps a real zero as zero", () => {
    expect(
      alignSeries({ key: "date", current: days(["2026-11-17", 0]), previous: days(["2026-11-10", 0]) })[0],
    ).toMatchObject({ current: 0, previous: 0 });
  });

  it("shows no comparison when there is none", () => {
    expect(alignSeries({ key: "date", current: days(["2026-11-17", 7]), previous: undefined })).toEqual([
      { label: "2026-11-17", current: 7, previousLabel: null, previous: null },
    ]);
  });

  it("reads the label from the key of the grain", () => {
    expect(
      alignSeries({
        key: "hour",
        current: [{ hour: "2026-11-17 09:00:00", value: 2 }],
        previous: [{ hour: "2026-11-16 09:00:00", value: 1 }],
      }),
    ).toEqual([{ label: "2026-11-17 09:00:00", current: 2, previousLabel: "2026-11-16 09:00:00", previous: 1 }]);
  });

  it("keeps a bucket with no value as a gap, in the range and in its comparison", () => {
    expect(
      alignSeries({
        key: "date",
        current: [
          { date: "2026-11-16", value: null },
          { date: "2026-11-17", value: 0 },
        ],
        previous: [
          { date: "2026-11-09", value: 4 },
          { date: "2026-11-10", value: null },
        ],
      }).map(({ current, previous }) => [current, previous]),
    ).toEqual([
      [null, 4],
      [0, null],
    ]);
  });
});
