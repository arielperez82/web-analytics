import type { FilterKey } from "./filters";

export type Report = {
  readonly slug: string;
  readonly heading: string;
  readonly endpoint: string;
  readonly labelKey: string;
  readonly filterKey?: FilterKey;
  readonly previousPeriod?: boolean;
};

export const REPORTS: readonly Report[] = [
  { slug: "pages", heading: "Top pages", endpoint: "top_pages", labelKey: "pathname" },
  { slug: "sources", heading: "Top sources", endpoint: "top_sources", labelKey: "referrer" },
  { slug: "channels", heading: "Channels", endpoint: "channels", labelKey: "channel", previousPeriod: false },
  { slug: "locations", heading: "Top locations", endpoint: "top_locations", labelKey: "location", filterKey: "location" },
  { slug: "devices", heading: "Devices", endpoint: "top_devices", labelKey: "device", filterKey: "device" },
  { slug: "browsers", heading: "Browsers", endpoint: "top_browsers", labelKey: "browser", filterKey: "browser" },
];

export const reportBySlug = (slug: string): Report | undefined =>
  REPORTS.find((report) => report.slug === slug);

export const FILTER_REPORTS: readonly Report[] = REPORTS.filter((report) => report.filterKey);

export const LIST_REPORTS: readonly Report[] = REPORTS.filter((report) => !report.filterKey);
