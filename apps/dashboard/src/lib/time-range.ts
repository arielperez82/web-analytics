import type { Range } from "./dashboard-state";
import { localDay } from "./time-zone";

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET = 6;

export const shifted = (day: string, days: number): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export const daysBefore = (day: string, days: number): string => shifted(day, -days);

const weekStart = (day: string): string =>
  daysBefore(day, (new Date(`${day}T00:00:00Z`).getUTCDay() + MONDAY_OFFSET) % DAYS_PER_WEEK);

const dayAfterYearAgo = (day: string): string => {
  const [year = "", month = "", date = ""] = day.split("-");
  const sameDayLastYear = new Date(Date.UTC(Number(year) - 1, Number(month) - 1, Number(date)));
  const exists = sameDayLastYear.getUTCMonth() === Number(month) - 1;
  const base = exists ? sameDayLastYear : new Date(Date.UTC(Number(year) - 1, Number(month), 0));
  return shifted(base.toISOString().slice(0, 10), 1);
};

export const rangeToParams = (
  range: Range,
  now: Date,
  zone = "UTC",
): Readonly<Record<"date_from" | "date_to", string>> => {
  if ("from" in range) return { date_from: range.from, date_to: range.to };
  const today = localDay(now, zone);
  if ("days" in range) return { date_from: daysBefore(today, range.days - 1), date_to: today };
  const first = {
    yesterday: daysBefore(today, 1),
    this_week: weekStart(today),
    this_month: `${today.slice(0, 7)}-01`,
    this_year: `${today.slice(0, 4)}-01-01`,
    last_12_months: dayAfterYearAgo(today),
    all_time: "1970-01-01",
  }[range.preset];
  return { date_from: first, date_to: range.preset === "yesterday" ? first : today };
};
