import { describe, expect, it } from "vitest";

import { COMPARE_CHOICES } from "./compare-window";
import { comparisonTitle, comparisonWords } from "./comparison-words";

describe("the words for a comparison", () => {
  it.each([
    ["previous_period", "previous period", "Previous period"],
    ["previous_week", "previous week", "Previous week"],
    ["previous_month", "previous month", "Previous month"],
    ["previous_year", "previous year", "Previous year"],
  ] as const)("names %s as %s", (choice, words, title) => {
    expect(comparisonWords(choice)).toBe(words);
    expect(comparisonTitle(choice)).toBe(title);
  });

  it("has words for every comparison there is", () => {
    expect(COMPARE_CHOICES.map((choice) => comparisonWords(choice))).toHaveLength(COMPARE_CHOICES.length);
    expect(new Set(COMPARE_CHOICES.map((choice) => comparisonWords(choice))).size).toBe(COMPARE_CHOICES.length);
  });
});
