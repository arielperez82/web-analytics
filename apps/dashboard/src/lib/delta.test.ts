import { describe, expect, it } from "vitest";

import { deltaOf } from "./delta";

describe("deltaOf", () => {
  it.each([
    { change: 20, higherIsBetter: true, expected: { arrow: "up", tone: "good", word: "Up" } },
    { change: 1, higherIsBetter: true, expected: { arrow: "up", tone: "good", word: "Up" } },
    { change: -2.86, higherIsBetter: true, expected: { arrow: "down", tone: "bad", word: "Down" } },
    { change: -3.85, higherIsBetter: false, expected: { arrow: "down", tone: "good", word: "Down" } },
    { change: 4, higherIsBetter: false, expected: { arrow: "up", tone: "bad", word: "Up" } },
  ])("reads $change as $expected.word and $expected.tone when higherIsBetter is $higherIsBetter", ({ change, higherIsBetter, expected }) => {
    expect(deltaOf({ change, higherIsBetter })).toEqual(expected);
  });

  it.each([true, false])("treats no change as neutral whichever direction is better (%s)", (higherIsBetter) => {
    expect(deltaOf({ change: 0, higherIsBetter })).toEqual({ arrow: "flat", tone: "neutral", word: "No change" });
  });

  it.each([0.004, -0.004, Number.NaN])("treats %s as no change, since it shows as 0 or not at all", (change) => {
    expect(deltaOf({ change, higherIsBetter: true })).toEqual({ arrow: "flat", tone: "neutral", word: "No change" });
  });
});
