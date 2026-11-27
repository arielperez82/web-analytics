import { offsetMs, partsIn } from "./hour-window";
import { shifted } from "./time-range";

export type CompareChoice =
  | "previous_period"
  | "previous_week"
  | "previous_month"
  | "previous_year"
  | "previous"
  | "last_week";

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

const COMPARE_CHOICES: readonly string[] = [
  "previous_period",
  "previous_week",
  "previous_month",
  "previous_year",
  "previous",
  "last_week",
];

export const isCompareChoice = (value: string): value is CompareChoice => COMPARE_CHOICES.includes(value);

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

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MONTHS_PER_YEAR = 12;
const MONTH_LENGTHS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const FEBRUARY = 1;

const isLeap = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number =>
  month === FEBRUARY && isLeap(year) ? MONTH_LENGTHS[FEBRUARY]! + 1 : (MONTH_LENGTHS[month] ?? 0);

const pad = (value: number, width: number): string => String(value).padStart(width, "0");

const monthsBefore = (day: string, months: number): string => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const total = year * MONTHS_PER_YEAR + (month - 1) - months;
  const [targetYear, targetMonth] = [Math.floor(total / MONTHS_PER_YEAR), ((total % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR];
  return `${pad(targetYear, 4)}-${pad(targetMonth + 1, 2)}-${pad(Math.min(date, daysInMonth(targetYear, targetMonth)), 2)}`;
};

const startBefore = (choice: CompareChoice, start: string): string => {
  if (choice === "previous_month") return monthsBefore(start, 1);
  if (choice === "previous_year") return monthsBefore(start, MONTHS_PER_YEAR);
  return shifted(start, -DAYS_PER_WEEK);
};

const isCalendarShift = (compare: CompareChoice): boolean =>
  compare === "previous_week" || compare === "last_week" || compare === "previous_month" || compare === "previous_year";

const sameLocalTimeOn = (instant: Date, day: (local: string) => string, zone: string): Date => {
  const parts = partsIn(instant, zone);
  const localDay = `${parts.year}-${parts.month}-${parts.day}`;
  const seconds = Number(parts.hour) * SECONDS_PER_HOUR + Number(parts.minute) * SECONDS_PER_MINUTE + Number(parts.second);
  const local = Date.parse(`${day(localDay)}T00:00:00Z`) + seconds * 1000;
  const first = local - offsetMs(new Date(local), zone);
  return new Date(local - offsetMs(new Date(first), zone));
};

const wholeDays = (compare: CompareChoice, from: string, to: string): ComparedWindow | undefined => {
  const length = lengthInDays(from, to);
  const compare_from = isCalendarShift(compare) ? startBefore(compare, from) : shifted(from, -length);
  const compare_to = isDay(compare_from) ? shifted(compare_from, length - 1) : undefined;
  return isDay(compare_from) && isDay(compare_to) ? { compare_from, compare_to } : undefined;
};

const exactHours = (compare: CompareChoice, from: Date, to: Date, zone: string): ComparedWindow | undefined => {
  const span = to.getTime() - from.getTime();
  const start = isCalendarShift(compare)
    ? sameLocalTimeOn(from, (local) => startBefore(compare, local), zone)
    : new Date(from.getTime() - span);
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
