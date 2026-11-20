import { describe, expect, it } from "vitest";

import { type ProxyDeps,proxyEndpoint } from "./endpoint-proxy";

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
      request("visitor_counts", "date_from=2026-01-01&date_to=2026-01-31&token=evil&like_filter=%25x"),
      deps,
    );
    expect(calls[0].url).toBe(
      "http://tb.test/v0/pipes/visitor_counts.json?date_from=2026-01-01&date_to=2026-01-31",
    );
  });

  it("forwards the series metric and the include-bots switch", async () => {
    const { deps, calls } = createFakeDeps();
    await proxyEndpoint(request("daily_series", "metric=known&include_bots=1"), deps);
    expect(calls[0].url).toBe(
      "http://tb.test/v0/pipes/daily_series.json?metric=known&include_bots=1",
    );
  });

  it("serves the overview endpoints and no longer serves kpis", async () => {
    const { deps } = createFakeDeps();
    for (const name of ["visitor_counts", "engagement", "daily_series", "hourly_series", "conversion_summary"]) {
      expect((await proxyEndpoint(request(name), deps)).status).toBe(200);
    }
    expect((await proxyEndpoint(request("kpis"), deps)).status).toBe(404);
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

  it("lists tenants when the deployment is not pinned to one", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("tenants"), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/tenants.json");
  });

  it("hides the tenants endpoint when the deployment is pinned to a tenant", async () => {
    const { deps, calls } = createFakeDeps({ tenantId: "my-tenant" });
    expect((await proxyEndpoint(request("tenants"), deps)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("forwards an empty tenant_id so events without a tenant can be selected", async () => {
    const { deps, calls } = createFakeDeps();
    await proxyEndpoint(request("top_pages", "tenant_id="), deps);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/top_pages.json?tenant_id=");
  });
  it("allows the channels endpoint", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("channels", "domain=a.com"), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/channels.json?domain=a.com");
  });

  it("forwards a valid goal_path to conversions", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("conversions", "goal_path=/thanks"), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/conversions.json?goal_path=%2Fthanks");
  });

  it("rejects an invalid goal_path with 400 and never calls Tinybird", async () => {
    const { deps, calls } = createFakeDeps();
    for (const bad of ["thanks", "/a%20b", "/a?x=1", "/a#b", `/${"x".repeat(200)}`]) {
      const query = new URLSearchParams({ goal_path: bad }).toString();
      expect((await proxyEndpoint(request("conversions", query), deps)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("forwards a valid goal_event to conversions", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("conversions", "goal_event=signup_completed"), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/conversions.json?goal_event=signup_completed");
  });

  it("rejects an invalid goal_event with 400 and never calls Tinybird", async () => {
    const { deps, calls } = createFakeDeps();
    for (const bad of ["a b", "x'; --", "a".repeat(101)]) {
      const query = new URLSearchParams({ goal_event: bad }).toString();
      expect((await proxyEndpoint(request("conversions", query), deps)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("forwards a valid tz to the endpoint", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("visitor_counts", "tz=America%2FNew_York"), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/visitor_counts.json?tz=America%2FNew_York");
  });

  it("rejects an invalid tz with 400 and never calls Tinybird", async () => {
    const { deps, calls } = createFakeDeps();
    for (const bad of ["Not/AZone", "x'; --", "New York"]) {
      const query = new URLSearchParams({ tz: bad }).toString();
      expect((await proxyEndpoint(request("visitor_counts", query), deps)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  describe("a daily series that starts before the first data", () => {
    const withDomains = (firstSeen: readonly string[]) => {
      const calls: string[] = [];
      const deps: ProxyDeps = {
        tinybird: { host: "http://tb.test", token: "secret-token" },
        fetch: async (url) => {
          calls.push(String(url));
          const body = String(url).includes("/domains.json")
            ? { data: firstSeen.map((first_seen) => ({ domain: "a.com", first_seen })) }
            : { data: [] };
          return new Response(JSON.stringify(body), { status: 200 });
        },
      };
      return { deps, calls };
    };

    it("starts at the earliest day with data instead of filling the empty years", async () => {
      const { deps, calls } = withDomains(["2026-03-05 10:00:00", "2026-02-11 08:30:00"]);
      await proxyEndpoint(request("daily_series", "date_from=1970-01-01&date_to=2026-11-18&tenant_id=t"), deps);
      expect(calls.at(-1)).toContain("date_from=2026-02-11");
      expect(calls[0]).toBe("http://tb.test/v0/pipes/domains.json?tenant_id=t");
    });

    it("reads the first day on the clock of the viewer's zone", async () => {
      const { deps, calls } = withDomains(["2026-02-11 02:00:00"]);
      await proxyEndpoint(
        request("daily_series", "date_from=1970-01-01&date_to=2026-11-18&tz=America%2FNew_York"),
        deps,
      );
      expect(calls.at(-1)).toContain("date_from=2026-02-10");
    });

    it("leaves a start that is already after the first data alone, without asking for the domains", async () => {
      const { deps, calls } = withDomains(["2026-02-11 08:30:00"]);
      await proxyEndpoint(request("daily_series", "date_from=2026-06-01&date_to=2026-06-30"), deps);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("date_from=2026-06-01");
    });

    it("keeps the requested start when there is no data to find", async () => {
      const { deps, calls } = withDomains([]);
      await proxyEndpoint(request("daily_series", "date_from=1970-01-01&date_to=2026-11-18"), deps);
      expect(calls.at(-1)).toContain("date_from=1970-01-01");
    });

    it("leaves other endpoints alone", async () => {
      const { deps, calls } = withDomains(["2026-02-11 08:30:00"]);
      await proxyEndpoint(request("visitor_counts", "date_from=1970-01-01&date_to=2026-11-18"), deps);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("date_from=1970-01-01");
    });
  });

  it("forwards an ISO 8601 window to the hourly series", async () => {
    const { deps, calls } = createFakeDeps();
    const query = new URLSearchParams({ from_at: "2026-11-10T05:00:00Z", to_at: "2026-11-11T05:00:00Z" }).toString();
    const result = await proxyEndpoint(request("hourly_series", query), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe(
      "http://tb.test/v0/pipes/hourly_series.json?from_at=2026-11-10T05%3A00%3A00Z&to_at=2026-11-11T05%3A00%3A00Z",
    );
  });

  it("accepts an ISO 8601 instant with an offset", async () => {
    const { deps } = createFakeDeps();
    const query = new URLSearchParams({ from_at: "2026-11-10T00:00:00-05:00" }).toString();
    expect((await proxyEndpoint(request("hourly_series", query), deps)).status).toBe(200);
  });

  it("rejects a malformed ISO 8601 window with 400 and never calls Tinybird", async () => {
    const { deps, calls } = createFakeDeps();
    for (const bad of ["tomorrow", "2026-11-10", "2026-11-10 05:00:00", "2026-11-10T05:00:00Z'; --"]) {
      const query = new URLSearchParams({ from_at: bad }).toString();
      expect((await proxyEndpoint(request("hourly_series", query), deps)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("forwards the bucket size to the hourly series", async () => {
    const { deps, calls } = createFakeDeps();
    const result = await proxyEndpoint(request("hourly_series", "bucket_hours=4"), deps);
    expect(result.status).toBe(200);
    expect(calls[0]?.url).toBe("http://tb.test/v0/pipes/hourly_series.json?bucket_hours=4");
  });

  it("rejects a bucket size that is not a whole number of hours from 1 to 24, never calling Tinybird", async () => {
    const { deps, calls } = createFakeDeps();
    for (const bad of ["0", "25", "-1", "1.5", "four", "4; DROP"]) {
      const query = new URLSearchParams({ bucket_hours: bad }).toString();
      expect((await proxyEndpoint(request("hourly_series", query), deps)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("ignores a caller tenant_id for conversions when pinned", async () => {
    const { deps, calls } = createFakeDeps({ tenantId: "my-tenant" });
    await proxyEndpoint(request("conversions", "tenant_id=someone-else&goal_path=/thanks"), deps);
    expect(calls[0]?.url).toBe(
      "http://tb.test/v0/pipes/conversions.json?tenant_id=my-tenant&goal_path=%2Fthanks",
    );
  });
});
