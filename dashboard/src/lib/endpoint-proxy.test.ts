import { describe, expect, it } from "vitest";

import { proxyEndpoint, type ProxyDeps } from "./endpoint-proxy";

type Call = { readonly url: string; readonly authorization: string | null };

const createFakeDeps = (
  overrides: Partial<ProxyDeps> = {},
): { readonly deps: ProxyDeps; readonly calls: Call[] } => {
  const calls: Call[] = [];
  const deps: ProxyDeps = {
    tinybird: { host: "http://tb.test", token: "secret-token" },
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return new Response(JSON.stringify({ data: [{ ok: 1 }] }), { status: 200 });
    },
    ...overrides,
  };
  return { deps, calls };
};

const request = (name: string, query = "", authenticated = true) => ({
  name,
  query: new URLSearchParams(query),
  authenticated,
});

describe("proxyEndpoint", () => {
  it("returns 401 and never calls Tinybird when unauthenticated", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("top_pages", "", false), deps);
    expect(result.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("returns 404 for endpoints outside the allowlist", async () => {
    const { deps, calls } = createFakeDeps();
    for (const name of ["analytics_hits", "../tokens", "top_pages.csv", "nope"]) {
      expect((await proxyEndpoint(request(name), deps)).status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it("calls the pipe with the server-side token and returns the body", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("top_pages", "domain=a.com"), deps);
    expect(result).toEqual({ status: 200, body: { data: [{ ok: 1 }] } });
    expect(calls[0]).toEqual({
      url: "http://tb.test/v0/pipes/top_pages.json?domain=a.com",
      authorization: "Bearer secret-token",
    });
  });

  it("forwards only known params", async () => {
    const { deps, calls } = createFakeDeps();
    await proxyEndpoint(
      request("kpis", "date_from=2026-01-01&date_to=2026-01-31&token=evil&like_filter=%25x"),
      deps,
    );
    expect(calls[0].url).toBe(
      "http://tb.test/v0/pipes/kpis.json?date_from=2026-01-01&date_to=2026-01-31",
    );
  });

  it("forwards the previous-period comparison flag", async () => {
    const { deps, calls } = createFakeDeps();
    await proxyEndpoint(request("top_pages", "include_previous_period=true"), deps);
    expect(calls[0].url).toBe(
      "http://tb.test/v0/pipes/top_pages.json?include_previous_period=true",
    );
  });

  it("pins tenant_id server-side, overriding any client value", async () => {
    const { deps, calls } = createFakeDeps({
      tenantId: "my-tenant",
    });
    await proxyEndpoint(request("domains", "tenant_id=someone-else"), deps);
    await proxyEndpoint(request("top_pages", "domain=a.com"), deps);
    expect(calls[0].url).toBe(
      "http://tb.test/v0/pipes/domains.json?tenant_id=my-tenant",
    );
    expect(calls[1].url).toBe(
      "http://tb.test/v0/pipes/top_pages.json?tenant_id=my-tenant&domain=a.com",
    );
  });

  it("forwards the visitor cross-filters", async () => {
    const { deps, calls } = createFakeDeps();
    await proxyEndpoint(
      request("top_pages", "location=US&device=mobile-ios&browser=safari"),
      deps,
    );
    expect(calls[0].url).toBe(
      "http://tb.test/v0/pipes/top_pages.json?location=US&device=mobile-ios&browser=safari",
    );
  });

  it("maps upstream failures to 502 without leaking the upstream body", async () => {
    const { deps } = createFakeDeps({
      fetch: async () => new Response("secret internals", { status: 500 }),
    });
    const result = await proxyEndpoint(request("trend"), deps);
    expect(result).toEqual({ status: 502, body: { error: "Upstream error" } });
  });

  it("maps network errors to 502", async () => {
    const { deps } = createFakeDeps({
      fetch: async () => {
        throw new Error("boom");
      },
    });
    expect((await proxyEndpoint(request("trend"), deps)).status).toBe(502);
  });
});
