export type FilterKey = "location" | "device" | "browser";
export type Filters = Readonly<Partial<Record<FilterKey, string>>>;

const ORDER: readonly FilterKey[] = ["location", "device", "browser"];

export const FILTER_LABEL_KEYS: Readonly<Record<FilterKey, string>> = {
  location: "location",
  device: "device",
  browser: "browser",
};

export const toggleFilter = (
  filters: Filters,
  key: FilterKey,
  value: string,
): Filters => {
  const { [key]: current, ...others } = filters;
  return current === value ? others : { ...others, [key]: value };
};

export const activeFilters = (
  filters: Filters,
): readonly { readonly key: FilterKey; readonly value: string }[] =>
  ORDER.flatMap((key) => {
    const value = filters[key];
    return value ? [{ key, value }] : [];
  });
