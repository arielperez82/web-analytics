import type { CompareChoice } from "./compare-window";

const WORDS: Readonly<Record<CompareChoice, string>> = {
  previous_period: "previous period",
  previous_week: "previous week",
  previous_month: "previous month",
  previous_year: "previous year",
};

export const comparisonWords = (choice: CompareChoice): string => WORDS[choice];

export const comparisonTitle = (choice: CompareChoice): string => {
  const words = WORDS[choice];
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};
