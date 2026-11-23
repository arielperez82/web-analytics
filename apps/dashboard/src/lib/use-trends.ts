"use client";

import { type SeriesPoint, useSeries } from "./use-series";

export type TrendMetric = "known" | "anonymous" | "sessions" | "pageviews";

type Params = Readonly<Record<string, string | undefined>>;

const trendOf = (feed: ReturnType<typeof useSeries>): readonly SeriesPoint[] =>
  feed.error === undefined ? (feed.points ?? []) : [];

export const useTrends = (params: Params): Readonly<Record<TrendMetric, readonly SeriesPoint[]>> => ({
  known: trendOf(useSeries({ ...params, metric: "known" })),
  anonymous: trendOf(useSeries({ ...params, metric: "anonymous" })),
  sessions: trendOf(useSeries({ ...params, metric: "sessions" })),
  pageviews: trendOf(useSeries({ ...params, metric: "pageviews" })),
});
