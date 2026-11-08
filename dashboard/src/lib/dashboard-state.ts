import type { Filters } from "./filters";

export const RANGE_OPTIONS = [1, 7, 30, 90] as const;
export const DEFAULT_DAYS = 7;

export type Range =
  | { readonly days: number }
  | { readonly from: string; readonly to: string };

export type DashboardState = {
  readonly range: Range;
  readonly domain?: string;
  readonly filters: Filters;
};

const FILTER_KEYS = ["location", "device", "browser"] as const;

const isRealDay = (value: string | null): value is string =>
  value !== null &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const parseRange = (search: URLSearchParams): Range => {
  const from = search.get("from");
  const to = search.get("to");
  if (isRealDay(from) && isRealDay(to) && from <= to) return { from, to };
  const days = Number(search.get("days"));
  return RANGE_OPTIONS.some((option) => option === days) ? { days } : { days: DEFAULT_DAYS };
};

export const parseState = (search: URLSearchParams): DashboardState => {
  const domain = search.get("domain");
  return {
    range: parseRange(search),
    ...(domain ? { domain } : {}),
    filters: Object.fromEntries(
      FILTER_KEYS.flatMap((key) => {
        const value = search.get(key);
        return value ? [[key, value]] : [];
      }),
    ),
  };
};

export const toSearch = ({ range, domain, filters }: DashboardState): string =>
  new URLSearchParams([
    ...("from" in range
      ? [["from", range.from], ["to", range.to]]
      : range.days === DEFAULT_DAYS
        ? []
        : [["days", String(range.days)]]),
    ...(domain ? [["domain", domain]] : []),
    ...FILTER_KEYS.flatMap((key) => {
      const value = filters[key];
      return value ? [[key, value]] : [];
    }),
  ]).toString();
