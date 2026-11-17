import type { Grain } from "./dashboard-state";

const DAY_MS = 86_400_000;
const MAX_HOURLY_DAYS = 7;

type DayRange = { readonly date_from?: string; readonly date_to?: string };

const daysIn = ({ date_from, date_to }: DayRange): number =>
  date_from === undefined || date_to === undefined
    ? 0
    : Math.round((Date.parse(`${date_to}T00:00:00Z`) - Date.parse(`${date_from}T00:00:00Z`)) / DAY_MS) + 1;

export const hourAvailable = (params: DayRange): boolean => daysIn(params) <= MAX_HOURLY_DAYS;

export const effectiveGrain = ({ grain, params }: { grain: Grain | undefined; params: DayRange }): Grain => {
  if (!hourAvailable(params)) return "day";
  return grain ?? (daysIn(params) === 1 ? "hour" : "day");
};
