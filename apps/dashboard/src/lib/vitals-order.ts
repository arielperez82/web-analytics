const VITALS_ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"];

type Vital = { readonly domain?: unknown; readonly metric_name?: unknown };

export const orderVitals = <T extends Vital>(rows: readonly T[]): readonly T[] =>
  [...rows].sort(
    (a, b) =>
      String(a.domain).localeCompare(String(b.domain)) ||
      VITALS_ORDER.indexOf(String(a.metric_name)) - VITALS_ORDER.indexOf(String(b.metric_name)),
  );
