import type { Grain } from "./dashboard-state";

const DAY_MS = 86_400_000;
const HOURS_PER_DAY = 24;
const MAX_HOURLY_BARS = 200;
const BUCKET_HOURS = [1, 4] as const;

type DayRange = { readonly date_from?: string; readonly date_to?: string; readonly from_at?: string };

export const isExactWindow = ({ from_at }: DayRange): boolean => from_at !== undefined;

const daysIn = ({ date_from, date_to }: DayRange): number =>
  date_from === undefined || date_to === undefined
    ? 0
    : Math.round((Date.parse(`${date_to}T00:00:00Z`) - Date.parse(`${date_from}T00:00:00Z`)) / DAY_MS) + 1;

export const hourBucket = (params: DayRange): number | undefined => {
  if (params.from_at !== undefined) return 1;
  const days = daysIn(params);
  return days === 0 ? undefined : BUCKET_HOURS.find((hours) => (days * HOURS_PER_DAY) / hours <= MAX_HOURLY_BARS);
};

export const hourAvailable = (params: DayRange): boolean => hourBucket(params) !== undefined;

export const effectiveGrain = ({ grain, params }: { grain: Grain | undefined; params: DayRange }): Grain => {
  if (params.from_at !== undefined) return "hour";
  if (!hourAvailable(params)) return "day";
  return grain ?? (daysIn(params) === 1 ? "hour" : "day");
};
