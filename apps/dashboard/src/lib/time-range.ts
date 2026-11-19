import type { Range } from "./dashboard-state";
import { localDay } from "./time-zone";

const DAY_MS = 86_400_000;

const daysBefore = (day: string, days: number): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() - days * DAY_MS).toISOString().slice(0, 10);

export const rangeToParams = (
  range: Range,
  now: Date,
  zone = "UTC",
): Readonly<Record<"date_from" | "date_to", string>> => {
  if ("from" in range) return { date_from: range.from, date_to: range.to };
  const today = localDay(now, zone);
  return { date_from: daysBefore(today, range.days - 1), date_to: today };
};
