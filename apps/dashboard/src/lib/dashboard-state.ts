import type { Filters } from "./filters";
import { isValidTimeZone } from "./time-zone";

export const RANGE_OPTIONS = [1, 7, 30, 90] as const;
export const DEFAULT_DAYS = 7;

export type Range =
  | { readonly days: number }
  | { readonly from: string; readonly to: string };

export type Grain = "day" | "hour";

export type DashboardState = {
  readonly range: Range;
  readonly grain?: Grain;
  readonly tenant?: string;
  readonly domain?: string;
  readonly filters: Filters;
  readonly includeBots?: boolean;
  readonly tz?: string;
};

const FILTER_KEYS = ["location", "device", "browser"] as const;

export const isRealDay = (value: string | null): value is string =>
  value !== null &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const isGrain = (value: string | null): boolean => value === "day" || value === "hour";

const parseRange = (search: URLSearchParams): Range => {
  const from = search.get("from");
  const to = search.get("to");
  if (isRealDay(from) && isRealDay(to) && from <= to) return { from, to };
  const days = Number(search.get("days"));
  return RANGE_OPTIONS.some((option) => option === days) ? { days } : { days: DEFAULT_DAYS };
};

export const parseState = (search: URLSearchParams): DashboardState => {
  const domain = search.get("domain");
  const tenant = search.get("tenant");
  const tz = search.get("tz");
  return {
    range: parseRange(search),
    ...(tenant !== null ? { tenant } : {}),
    ...(domain ? { domain } : {}),
    ...(tz !== null && isValidTimeZone(tz) ? { tz } : {}),
    ...(search.get("bots") === "1" ? { includeBots: true } : {}),
    ...(isGrain(search.get("grain")) ? { grain: search.get("grain") as Grain } : {}),
    filters: Object.fromEntries(
      FILTER_KEYS.flatMap((key) => {
        const value = search.get(key);
        return value ? [[key, value]] : [];
      }),
    ),
  };
};

export const toSearch = ({ range, grain, tenant, domain, filters, includeBots, tz }: DashboardState): string =>
  new URLSearchParams([
    ...("from" in range
      ? [["from", range.from], ["to", range.to]]
      : range.days === DEFAULT_DAYS
        ? []
        : [["days", String(range.days)]]),
    ...(tenant !== undefined ? [["tenant", tenant]] : []),
    ...(domain ? [["domain", domain]] : []),
    ...(includeBots ? [["bots", "1"]] : []),
    ...(tz ? [["tz", tz]] : []),
    ...(grain ? [["grain", grain]] : []),
    ...FILTER_KEYS.flatMap((key) => {
      const value = filters[key];
      return value ? [[key, value]] : [];
    }),
  ]).toString();

export const drillDay = (state: DashboardState, day: string): DashboardState => {
  const { grain: _grain, ...rest } = state;
  return "from" in state.range && state.range.from === day && state.range.to === day
    ? { ...rest, range: { days: DEFAULT_DAYS } }
    : { ...rest, range: { from: day, to: day }, grain: "hour" };
};

export const hrefFor = (pathname: string, state: DashboardState): string => {
  const search = toSearch(state);
  return search ? `${pathname}?${search}` : pathname;
};

export const tenantLabel = (tenant: string): string => (tenant === "" ? "No Tenant" : tenant);
