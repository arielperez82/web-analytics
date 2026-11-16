import { vi } from "vitest";

export type ApiRow = Readonly<Record<string, string | number | null>>;
type Route = readonly ApiRow[] | ((query: URLSearchParams) => readonly ApiRow[]);

export type FakeApi = {
  readonly requestsTo: (endpoint: string) => readonly URLSearchParams[];
};

const ENDPOINT_PATH = /^\/api\/endpoints\/([^?]+)\?(.*)$/;

export const installFakeApi = (routes: Readonly<Record<string, Route>>): FakeApi => {
  const requests: { readonly endpoint: string; readonly query: URLSearchParams }[] = [];
  vi.stubGlobal("fetch", (input: string) => {
    const match = ENDPOINT_PATH.exec(input);
    const endpoint = match?.[1] ?? "";
    const query = new URLSearchParams(match?.[2] ?? "");
    requests.push({ endpoint, query });
    const route = routes[endpoint];
    return Promise.resolve(
      route === undefined
        ? new Response(JSON.stringify({ error: `no fake for ${endpoint}` }), { status: 404 })
        : new Response(JSON.stringify({ data: typeof route === "function" ? route(query) : route })),
    );
  });
  return {
    requestsTo: (endpoint) =>
      requests.filter((request) => request.endpoint === endpoint).map((request) => request.query),
  };
};

export const removeFakeApi = (): void => {
  vi.unstubAllGlobals();
};
