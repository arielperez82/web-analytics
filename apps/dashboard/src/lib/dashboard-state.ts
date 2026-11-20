import type { Filters } from "./filters";
import { isValidTimeZone } from "./time-zone";

export const DEFAULT_DAYS = 7;

export const PRESETS = ["yesterday", "this_week", "this_month", "this_year", "last_12_months", "all_time"] as const;
export type Preset = (typeof PRESETS)[number];

type Shortcut = { readonly label: string; readonly range: Range };

export type Range =
  | { readonly days: number }
  | { readonly preset: Preset }
  | { readonly from: string; readonly to: string };

export const SHORTCUTS: readonly Shortcut[] = [
  { label: "Yesterday", range: { preset: "yesterday" } },
  { label: "Today", range: { days: 1 } },
  { label: "Last 7 Days", range: { days: 7 } },
  { label: "This Week", range: { preset: "this_week" } },
  { label: "Last 30 Days", range: { days: 30 } },
  { label: "This Month", range: { preset: "this_month" } },
  { label: "Last 90 Days", range: { days: 90 } },
  { label: "This Year", range: { preset: "this_year" } },
  { label: "Last 12 Months", range: { preset: "last_12_months" } },
  { label: "All Time", range: { preset: "all_time" } },
];

export type Grain = "day" | "hour";

export type Compare = "last_week" | "off";

export type DashboardState = {
  readonly range: Range;
  readonly grain?: Grain;
  readonly compare?: Compare;
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

const isCompare = (value: string | null): value is Compare => value === "last_week" || value === "off";

const isGrain = (value: string | null): boolean => value === "day" || value === "hour";

const parseRange = (search: URLSearchParams): Range => {
  const from = search.get("from");
  const to = search.get("to");
  if (isRealDay(from) && isRealDay(to) && from <= to) return { from, to };
  const preset = PRESETS.find((name) => name === search.get("range"));
  if (preset !== undefined) return { preset };
  const days = Number(search.get("days"));
  const known = SHORTCUTS.find((shortcut) => "days" in shortcut.range && shortcut.range.days === days);
  return known !== undefined && "days" in known.range ? { days: known.range.days } : { days: DEFAULT_DAYS };
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
    ...(isCompare(search.get("compare")) ? { compare: search.get("compare") as Compare } : {}),
    ...(isGrain(search.get("grain")) ? { grain: search.get("grain") as Grain } : {}),
    filters: Object.fromEntries(
      FILTER_KEYS.flatMap((key) => {
        const value = search.get(key);
        return value ? [[key, value]] : [];
      }),
    ),
  };
};

export const toSearch = ({ range, grain, compare, tenant, domain, filters, includeBots, tz }: DashboardState): string =>
  new URLSearchParams([
    ...("from" in range
      ? [["from", range.from], ["to", range.to]]
      : "preset" in range
        ? [["range", range.preset]]
        : range.days === DEFAULT_DAYS
          ? []
          : [["days", String(range.days)]]),
    ...(tenant !== undefined ? [["tenant", tenant]] : []),
    ...(domain ? [["domain", domain]] : []),
    ...(includeBots ? [["bots", "1"]] : []),
    ...(tz ? [["tz", tz]] : []),
    ...(grain ? [["grain", grain]] : []),
    ...(compare ? [["compare", compare]] : []),
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
