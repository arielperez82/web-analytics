"use client";

import { useEffect, useState } from "react";

type State<T> = {
  readonly data: readonly T[] | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly retry: () => void;
};

export const useEndpoint = <T,>(
  name: string,
  params: Readonly<Record<string, string | undefined>>,
): State<T> => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<State<T>, "retry">>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value !== undefined ? [[key, value] as [string, string]] : [],
    ),
  ).toString();

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: previous.data === undefined, error: undefined }));
    fetch(`/api/endpoints/${name}?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { data?: T[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        setState({ data: body.data ?? [], error: undefined, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          data: previous.data,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
      });
    return () => controller.abort();
  }, [name, query, attempt]);

  return { ...state, retry: () => setAttempt((count) => count + 1) };
};
