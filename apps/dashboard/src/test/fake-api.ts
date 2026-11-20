import { vi } from "vitest";

export type ApiRow = Readonly<Record<string, string | number | null>>;
type Route = readonly ApiRow[] | ((query: URLSearchParams) => readonly ApiRow[]);

export type FakeApi = {
  readonly requestsTo: (endpoint: string) => readonly URLSearchParams[];
};

const ENDPOINT_PATH = /^\/api\/(?:endpoints\/([^?]+)|(series))\?(.*)$/;

const bodyOf = (endpoint: string, query: URLSearchParams, rows: readonly ApiRow[]) =>
  endpoint === "series" ? { grain: query.get("grain") ?? "day", points: rows } : { data: rows };

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
