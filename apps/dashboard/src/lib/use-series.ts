"use client";

import { useEffect, useState } from "react";

import type { Metric } from "./metrics";

export type SeriesPoint = {
  readonly label: string;
  readonly current: number;
  readonly previousLabel: string | null;
  readonly previous: number | null;
};

export type { Metric };

export type MetricSeries = Readonly<Record<Metric, readonly SeriesPoint[]>>;

type State = {
  readonly series: MetricSeries | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly retry: () => void;
};

export const useSeries = (params: Readonly<Record<string, string | undefined>>): State => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<State, "retry">>({ series: undefined, error: undefined, loading: true, refreshing: false });
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (value !== undefined ? [[key, value] as [string, string]] : [])),
  ).toString();

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: previous.series === undefined, refreshing: previous.series !== undefined, error: undefined }));
    fetch(`/api/series?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { series?: MetricSeries; error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        setState({ series: body.series, error: undefined, loading: false, refreshing: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          series: previous.series,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
          refreshing: false,
        }));
      });
    return () => controller.abort();
  }, [query, attempt]);

  return { ...state, retry: () => setAttempt((count) => count + 1) };
};
