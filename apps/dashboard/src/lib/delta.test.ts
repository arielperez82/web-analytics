import { describe, expect, it } from "vitest";

import { deltaOf } from "./delta";

describe("deltaOf", () => {
  it.each([
    { percent: 20, higherIsBetter: true, expected: { arrow: "up", tone: "good", word: "Up" } },
    { percent: -2.86, higherIsBetter: true, expected: { arrow: "down", tone: "bad", word: "Down" } },
    { percent: -3.85, higherIsBetter: false, expected: { arrow: "down", tone: "good", word: "Down" } },
    { percent: 4, higherIsBetter: false, expected: { arrow: "up", tone: "bad", word: "Up" } },
  ])("reads $percent as $expected.word and $expected.tone when higherIsBetter is $higherIsBetter", ({ percent, higherIsBetter, expected }) => {
    expect(deltaOf({ percent, higherIsBetter })).toEqual(expected);
  });

  it.each([true, false])("treats no change as neutral whichever direction is better (%s)", (higherIsBetter) => {
    expect(deltaOf({ percent: 0, higherIsBetter })).toEqual({ arrow: "flat", tone: "neutral", word: "No change" });
  });

  it.each([0.004, -0.004, Number.NaN])("treats %s as no change, since it shows as 0% or not at all", (percent) => {
    expect(deltaOf({ percent, higherIsBetter: true })).toEqual({ arrow: "flat", tone: "neutral", word: "No change" });
  });
});
