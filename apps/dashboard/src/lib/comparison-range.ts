import type { Range } from "./dashboard-state";
import { daysBefore, rangeToParams, shifted } from "./time-range";

export type CompareMode = "previous" | "last_week";

export type DayRange = { readonly date_from: string; readonly date_to: string };

type CalendarPreset = "this_week" | "this_month" | "this_year";

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const DECEMBER = 12;
const YEAR_DIGITS = 4;

const lengthOf = ({ date_from, date_to }: DayRange): number =>
  Math.round((Date.parse(`${date_to}T00:00:00Z`) - Date.parse(`${date_from}T00:00:00Z`)) / DAY_MS) + 1;

const lastDayOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const dayOf = (year: number, month: number, day: number): string =>
  [
    String(year).padStart(YEAR_DIGITS, "0"),
    String(month).padStart(2, "0"),
    String(Math.min(day, lastDayOfMonth(year, month))).padStart(2, "0"),
  ].join("-");

const precedingEqualLength = (current: DayRange): DayRange => ({
  date_from: daysBefore(current.date_from, lengthOf(current)),
  date_to: daysBefore(current.date_from, 1),
});

const lastWeek = (current: DayRange): DayRange => ({
  date_from: shifted(current.date_from, -DAYS_PER_WEEK),
  date_to: shifted(current.date_to, -DAYS_PER_WEEK),
});

const previousMonth = ({ date_to }: DayRange): DayRange => {
  const [year = 0, month = 0, day = 0] = date_to.split("-").map(Number);
  const [lastYear, lastMonth] = month === 1 ? [year - 1, DECEMBER] : [year, month - 1];
  return { date_from: dayOf(lastYear, lastMonth, 1), date_to: dayOf(lastYear, lastMonth, day) };
};

const previousYear = ({ date_to }: DayRange): DayRange => {
  const [year = 0, month = 0, day = 0] = date_to.split("-").map(Number);
  return { date_from: dayOf(year - 1, 1, 1), date_to: dayOf(year - 1, month, day) };
};

const sameSpanOfLastCycle: Readonly<Record<CalendarPreset, (current: DayRange) => DayRange>> = {
  this_week: lastWeek,
  this_month: previousMonth,
  this_year: previousYear,
};

const isCalendarPreset = (range: Range): range is { readonly preset: CalendarPreset } =>
  "preset" in range && range.preset in sameSpanOfLastCycle;

export const comparisonRange = ({
  range,
  now,
  zone,
  mode,
}: {
  readonly range: Range;
  readonly now: Date;
  readonly zone: string;
  readonly mode: CompareMode;
}): DayRange | undefined => {
  if ("preset" in range && range.preset === "all_time") return undefined;
  const current = rangeToParams(range, now, zone);
  if (mode === "last_week") return lastWeek(current);
  return isCalendarPreset(range) ? sameSpanOfLastCycle[range.preset](current) : precedingEqualLength(current);
};
