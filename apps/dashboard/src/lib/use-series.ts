"use client";

import { useEffect, useState } from "react";

export type SeriesPoint = {
  readonly label: string;
  readonly current: number;
  readonly previousLabel: string | null;
  readonly previous: number | null;
};

type State = {
  readonly points: readonly SeriesPoint[] | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly retry: () => void;
};

export const useSeries = (params: Readonly<Record<string, string | undefined>>): State => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<State, "retry">>({ points: undefined, error: undefined, loading: true });
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (value !== undefined ? [[key, value] as [string, string]] : [])),
  ).toString();

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: previous.points === undefined, error: undefined }));
    fetch(`/api/series?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { points?: SeriesPoint[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        setState({ points: body.points ?? [], error: undefined, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          points: previous.points,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
      });
    return () => controller.abort();
  }, [query, attempt]);

  return { ...state, retry: () => setAttempt((count) => count + 1) };
};
