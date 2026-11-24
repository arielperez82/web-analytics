export const METRICS = ["sessions", "known", "anonymous", "pageviews"] as const;

export type Metric = (typeof METRICS)[number];

export const TRENDS = [...METRICS, "bounce_rate", "avg_session"] as const;

export type Trend = (typeof TRENDS)[number];
