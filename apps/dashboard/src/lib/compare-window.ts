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

export const PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;

const isDay = (value: string | undefined): value is string =>
  value !== undefined && PLAIN_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && shifted(value, 0) === value;

const instantOf = (value: string | undefined): Date | undefined => {
  if (value === undefined || !ISO_INSTANT.test(value)) return undefined;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
};

const asIso = (instant: Date): string => `${instant.toISOString().slice(0, 19)}Z`;

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

const wholeDays = (compare: CompareChoice, from: string, to: string): ComparedWindow => {
  const back = compare === "last_week" ? DAYS_PER_WEEK : lengthInDays(from, to);
  return { compare_from: shifted(from, -back), compare_to: shifted(to, -back) };
};

const exactHours = (compare: CompareChoice, from: Date, to: Date, zone: string): ComparedWindow => {
  const span = to.getTime() - from.getTime();
  const start =
    compare === "last_week" ? sameLocalTimeDaysBefore(from, DAYS_PER_WEEK, zone) : new Date(from.getTime() - span);
  return { compare_from_at: asIso(start), compare_to_at: asIso(new Date(start.getTime() + span)) };
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
