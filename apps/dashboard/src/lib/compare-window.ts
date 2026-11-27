import { offsetMs, partsIn } from "./hour-window";
import { shifted } from "./time-range";

export type CompareChoice = "previous" | "last_week";

export type CurrentWindow = {
  readonly date_from?: string;
  readonly date_to?: string;
  readonly from_at?: string;
  readonly to_at?: string;
};

export type ComparedWindow =
  | { readonly compare_from: string; readonly compare_to: string }
  | { readonly compare_from_at: string; readonly compare_to_at: string };

export const COMPARE_PARAMS: readonly string[] = ["compare_from", "compare_to", "compare_from_at", "compare_to_at"];

export const isCompareChoice = (value: string): value is CompareChoice => value === "previous" || value === "last_week";

const PLAIN_DAY = /^(\d{4})-\d{2}-\d{2}$/;

const ISO_INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-](\d{2}):(\d{2}))$/;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DAYS_PER_WEEK = 7;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;

const isDay = (value: string | undefined): value is string => {
  if (value === undefined) return false;
  const year = PLAIN_DAY.exec(value)?.[1];
  return year !== undefined && Number(year) >= 1 && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && shifted(value, 0) === value;
};

const fieldsOf = (value: string): { readonly day: string; readonly numbers: readonly number[] } | undefined => {
  const match = ISO_INSTANT.exec(value);
  if (match === null) return undefined;
  const [, day = "", hour = "", minute = "", second = "", , offsetHour = "00", offsetMinute = "00"] = match;
  return { day, numbers: [hour, minute, second, offsetHour, offsetMinute].map(Number) };
};

export const isValidInstant = (value: string | undefined): value is string => {
  const fields = value === undefined ? undefined : fieldsOf(value);
  if (fields === undefined) return false;
  const [hour = 0, minute = 0, second = 0, offsetHour = 0, offsetMinute = 0] = fields.numbers;
  return (
    isDay(fields.day) &&
    hour <= LAST_HOUR &&
    minute <= LAST_MINUTE &&
    second <= LAST_MINUTE &&
    offsetHour <= LAST_HOUR &&
    offsetMinute <= LAST_MINUTE
  );
};

const instantOf = (value: string | undefined): Date | undefined =>
  isValidInstant(value) ? new Date(value) : undefined;

const asIso = (instant: Date): string => `${instant.toISOString().slice(0, 19)}Z`;

export const endOfCurrentHour = (now: Date): string =>
  asIso(new Date((Math.floor(now.getTime() / HOUR_MS) + 1) * HOUR_MS));

export const closedWindow = ({ window, now }: { readonly window: CurrentWindow; readonly now: Date }): CurrentWindow =>
  window.from_at !== undefined && window.to_at === undefined ? { ...window, to_at: endOfCurrentHour(now) } : window;

const lengthInDays = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

const sameLocalTimeDaysBefore = (instant: Date, days: number, zone: string): Date => {
  const parts = partsIn(instant, zone);
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) - days,
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const first = local - offsetMs(new Date(local), zone);
  return new Date(local - offsetMs(new Date(first), zone));
};

const wholeDays = (compare: CompareChoice, from: string, to: string): ComparedWindow | undefined => {
  const back = compare === "last_week" ? DAYS_PER_WEEK : lengthInDays(from, to);
  const [compare_from, compare_to] = [shifted(from, -back), shifted(to, -back)];
  return isDay(compare_from) && isDay(compare_to) ? { compare_from, compare_to } : undefined;
};

const exactHours = (compare: CompareChoice, from: Date, to: Date, zone: string): ComparedWindow | undefined => {
  const span = to.getTime() - from.getTime();
  const start =
    compare === "last_week" ? sameLocalTimeDaysBefore(from, DAYS_PER_WEEK, zone) : new Date(from.getTime() - span);
  const [compare_from_at, compare_to_at] = [start, new Date(start.getTime() + span)].map((instant) =>
    Number.isNaN(instant.getTime()) || instant.getUTCFullYear() < 1 ? undefined : asIso(instant),
  );
  return isValidInstant(compare_from_at) && isValidInstant(compare_to_at) ? { compare_from_at, compare_to_at } : undefined;
};

export const comparedWindow = ({
  compare,
  window,
  zone,
}: {
  readonly compare: CompareChoice;
  readonly window: CurrentWindow;
  readonly zone: string;
}): ComparedWindow | undefined => {
  if (window.from_at !== undefined || window.to_at !== undefined) {
    const [from, to] = [instantOf(window.from_at), instantOf(window.to_at)];
    return from === undefined || to === undefined || from >= to ? undefined : exactHours(compare, from, to, zone);
  }
  const { date_from, date_to } = window;
  return isDay(date_from) && isDay(date_to) && date_from <= date_to ? wholeDays(compare, date_from, date_to) : undefined;
};
