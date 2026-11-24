import { METRICS } from "@/lib/metrics";
import { vi } from "vitest";

export type ApiRow = Readonly<Record<string, string | number | null>>;
export type MetricRows = Readonly<Record<string, readonly ApiRow[]>>;
type Route = readonly ApiRow[] | MetricRows | ((query: URLSearchParams) => readonly ApiRow[] | MetricRows);


export type FakeApi = {
  readonly requestsTo: (endpoint: string) => readonly URLSearchParams[];
};

const ENDPOINT_PATH = /^\/api\/(?:endpoints\/([^?]+)|(series))\?(.*)$/;

const seriesOf = (rows: readonly ApiRow[] | MetricRows): MetricRows =>
  Array.isArray(rows)
    ? Object.fromEntries(METRICS.map((metric) => [metric, rows]))
    : (rows as MetricRows);

const bodyOf = (endpoint: string, query: URLSearchParams, rows: readonly ApiRow[] | MetricRows) =>
  endpoint === "series" ? { grain: query.get("grain") ?? "day", series: seriesOf(rows) } : { data: rows };

export const installFakeApi = (routes: Readonly<Record<string, Route>>): FakeApi => {
  const requests: { readonly endpoint: string; readonly query: URLSearchParams }[] = [];
  vi.stubGlobal("fetch", (input: string) => {
    const match = ENDPOINT_PATH.exec(input);
    const endpoint = match?.[1] ?? match?.[2] ?? "";
    const query = new URLSearchParams(match?.[3] ?? "");
    requests.push({ endpoint, query });
    const route = routes[endpoint];
    if (route === undefined)
      return Promise.resolve(new Response(JSON.stringify({ error: `no fake for ${endpoint}` }), { status: 404 }));
    const rows = typeof route === "function" ? route(query) : route;
    return Promise.resolve(new Response(JSON.stringify(bodyOf(endpoint, query, rows))));
  });
  return {
    requestsTo: (endpoint) =>
      requests.filter((request) => request.endpoint === endpoint).map((request) => request.query),
  };
};

export const removeFakeApi = (): void => {
  vi.unstubAllGlobals();
};

export const failOnce = (endpoint: string, only: (query: URLSearchParams) => boolean = () => true) => {
  const real = globalThis.fetch;
  const seen: boolean[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    const name = /\/api\/(?:endpoints\/)?([^?]+)/.exec(input)?.[1] ?? "";
    const target = name === endpoint && only(new URLSearchParams(input.split("?")[1] ?? ""));
    const first = target && seen.length === 0;
    if (target) seen.push(true);
    return first
      ? Promise.resolve(new Response(JSON.stringify({ error: "warehouse down" }), { status: 500 }))
      : real(input, init);
  });
};
