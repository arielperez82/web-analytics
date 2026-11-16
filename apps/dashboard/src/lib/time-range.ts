import type { Range } from "./dashboard-state";

const DAY_MS = 86_400_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export const rangeToParams = (
  range: Range,
  now: Date,
): Readonly<Record<"date_from" | "date_to", string>> =>
  "from" in range
    ? { date_from: range.from, date_to: range.to }
    : {
        date_from: isoDay(new Date(now.getTime() - (range.days - 1) * DAY_MS)),
        date_to: isoDay(now),
      };
