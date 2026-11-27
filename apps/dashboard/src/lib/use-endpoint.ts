"use client";

import { useEffect, useState } from "react";

type State<T> = {
  readonly data: readonly T[] | undefined;
  readonly error: string | undefined;
  readonly status: number | undefined;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly retry: () => void;
};

class EndpointError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const useEndpoint = <T,>(
  name: string,
  params: Readonly<Record<string, string | undefined>>,
  enabled = true,
): State<T> => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<State<T>, "retry">>({
    data: undefined,
    error: undefined,
    status: undefined,
    loading: true,
    refreshing: false,
  });
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value !== undefined ? [[key, value] as [string, string]] : [],
    ),
  ).toString();

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: previous.data === undefined, refreshing: previous.data !== undefined, error: undefined }));
    fetch(`/api/endpoints/${name}?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { data?: T[]; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new EndpointError(body.error ?? `HTTP ${response.status}`, response.status);
        setState({ data: body.data ?? [], error: undefined, status: response.status, loading: false, refreshing: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          data: previous.data,
          error: error instanceof Error ? error.message : "Request failed",
          status: error instanceof EndpointError ? error.status : undefined,
          loading: false,
          refreshing: false,
        }));
      });
    return () => controller.abort();
  }, [name, query, attempt, enabled]);

  return { ...state, retry: () => setAttempt((count) => count + 1) };
};
