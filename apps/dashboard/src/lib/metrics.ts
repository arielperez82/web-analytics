export const METRICS = ["sessions", "known", "anonymous", "pageviews"] as const;

export type Metric = (typeof METRICS)[number];
