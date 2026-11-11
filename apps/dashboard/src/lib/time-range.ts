import type { Range } from "./dashboard-state";

const DAY_MS = 86_400_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const dayCount = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

export const rangeToParams = (
  range: Range,
  now: Date,
): Readonly<Record<"date_from" | "date_to" | "days", string>> =>
  "from" in range
    ? {
        date_from: range.from,
        date_to: range.to,
        days: String(dayCount(range.from, range.to)),
      }
    : {
        date_from: isoDay(new Date(now.getTime() - (range.days - 1) * DAY_MS)),
        date_to: isoDay(now),
        days: String(range.days),
      };
