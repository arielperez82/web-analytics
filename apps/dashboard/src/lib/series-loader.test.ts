import { describe, expect, it } from "vitest";

import type { ProxyDeps } from "./endpoint-proxy";
import { loadSeries } from "./series-loader";

const fakeDeps = (
  rowsFor: (url: URL) => readonly Record<string, unknown>[] | undefined,
): { readonly deps: ProxyDeps; readonly urls: URL[] } => {
  const urls: URL[] = [];
  const deps: ProxyDeps = {
    tinybird: { host: "http://tb.test", token: "t" },
    fetch: async (url) => {
      const parsed = new URL(String(url));
      urls.push(parsed);
      const data = rowsFor(parsed);
      return data === undefined
        ? new Response("boom", { status: 500 })
        : new Response(JSON.stringify({ data }), { status: 200 });
    },
  };
  return { deps, urls };
};

const load = (query: string, deps: ProxyDeps, authenticated = true) =>
  loadSeries({ query: new URLSearchParams(query), authenticated }, deps);

const counts = { sessions: 0, known: 0, anonymous: 0, pageviews: 0 };

const byStart = (url: URL) =>
  url.searchParams.get("date_from") === "2026-11-16"
    ? [
        { date: "2026-11-16", ...counts, value: 5 },
        { date: "2026-11-17", ...counts, value: 7 },
      ]
    : [
        { date: "2026-11-09", ...counts, value: 3 },
        { date: "2026-11-10", ...counts, value: 4 },
      ];

describe("loadSeries", () => {
  it("loads the range and its comparison together and pairs them", async () => {
    const { deps, urls } = fakeDeps(byStart);
    const result = await load(
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10&metric=sessions",
      deps,
    );
    expect(urls.map((u) => [u.pathname, u.searchParams.get("date_from"), u.searchParams.get("date_to")])).toEqual([
      ["/v0/pipes/daily_series.json", "2026-11-16", "2026-11-17"],
      ["/v0/pipes/daily_series.json", "2026-11-09", "2026-11-10"],
    ]);
    expect(result).toEqual({
      status: 200,
      body: {
        grain: "day",
        points: [
          { label: "2026-11-16", current: 5, previousLabel: "2026-11-09", previous: 3 },
          { label: "2026-11-17", current: 7, previousLabel: "2026-11-10", previous: 4 },
        ],
        series: expect.any(Object),
      },
    });
  });

  it("keeps the filters, the metric and the zone on both calls and never forwards the comparison dates", async () => {
    const { deps, urls } = fakeDeps(byStart);
    await load(
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10&metric=known&country=ES&tz=Europe%2FMadrid",
      deps,
    );
    for (const url of urls) {
      expect(url.searchParams.get("metric")).toBe("known");
      expect(url.searchParams.get("tz")).toBe("Europe/Madrid");
      expect(url.searchParams.has("compare_from")).toBe(false);
      expect(url.searchParams.has("grain")).toBe(false);
    }
  });

  it("loads only the range when there is nothing to compare with", async () => {
    const { deps, urls } = fakeDeps(byStart);
    const result = await load("date_from=2026-11-16&date_to=2026-11-17", deps);
    expect(urls).toHaveLength(1);
    expect(result.body).toMatchObject({ points: [{ previous: null }, { previous: null }] });
  });

  it("loads hourly buckets for both ranges and reads their labels on the clock of the zone", async () => {
    const { deps, urls } = fakeDeps((url) => [
      { hour: url.searchParams.get("from_at")?.startsWith("2026-11-17") ? "2026-11-17 05:00:00" : "2026-11-16 05:00:00", ...counts, value: 2 },
    ]);
    const result = await load(
      "grain=hour&tz=America%2FNew_York&date_from=2026-11-17&date_to=2026-11-17&compare_from=2026-11-16&compare_to=2026-11-16",
      deps,
    );
    expect(urls.map((u) => [u.pathname, u.searchParams.get("from_at"), u.searchParams.has("date_from")])).toEqual([
      ["/v0/pipes/hourly_series.json", "2026-11-17T05:00:00Z", false],
      ["/v0/pipes/hourly_series.json", "2026-11-16T05:00:00Z", false],
    ]);
    expect(result.body).toMatchObject({
      grain: "hour",
      points: [{ label: "2026-11-17 00:00:00", previousLabel: "2026-11-16 00:00:00" }],
    });
  });

  it("loads 24 hours from an exact start and the 24 hours it is compared with", async () => {
    const { deps, urls } = fakeDeps(() => [{ hour: "2026-11-17 16:00:00", ...counts, value: 2 }]);
    await load(
      "grain=hour&date_from=2026-11-17&date_to=2026-11-18&from_at=2026-11-17T16:00:00Z&compare_from_at=2026-11-16T16:00:00Z",
      deps,
    );
    expect(
      urls.map((u) => [u.searchParams.get("from_at"), u.searchParams.get("to_at"), u.searchParams.has("date_from")]),
    ).toEqual([
      ["2026-11-17T16:00:00Z", "2026-11-18T16:00:00Z", false],
      ["2026-11-16T16:00:00Z", "2026-11-17T16:00:00Z", false],
    ]);
    for (const url of urls) expect(url.searchParams.has("compare_from_at")).toBe(false);
  });

  it("fails as a whole when either call fails", async () => {
    const { deps } = fakeDeps((url) => (url.searchParams.get("date_from") === "2026-11-09" ? undefined : byStart(url)));
    const result = await load(
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10",
      deps,
    );
    expect(result).toEqual({ status: 502, body: { error: "Upstream error" } });
  });

  it("is closed to anyone who is not signed in, without calling Tinybird", async () => {
    const { deps, urls } = fakeDeps(byStart);
    const result = await load("date_from=2026-11-16&date_to=2026-11-17", deps, false);
    expect(result.status).toBe(401);
    expect(urls).toHaveLength(0);
  });

  it("answers for every metric from the one call per period", async () => {
    const day = (date: string, scale: number) => ({
      date,
      value: scale,
      sessions: scale,
      known: scale + 1,
      anonymous: scale + 2,
      pageviews: scale + 3,
    });
    const { deps, urls } = fakeDeps((url) =>
      url.searchParams.get("date_from") === "2026-11-16"
        ? [day("2026-11-16", 10), day("2026-11-17", 20)]
        : [day("2026-11-09", 1), day("2026-11-10", 2)],
    );

    const result = await load(
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10",
      deps,
    );

    expect(urls).toHaveLength(2);
    const paired = (label: string, previousLabel: string, current: number, previous: number) => ({
      label,
      current,
      previousLabel,
      previous,
    });
    expect(result.body).toEqual({
      grain: "day",
      points: expect.any(Array),
      series: {
        sessions: [paired("2026-11-16", "2026-11-09", 10, 1), paired("2026-11-17", "2026-11-10", 20, 2)],
        known: [paired("2026-11-16", "2026-11-09", 11, 2), paired("2026-11-17", "2026-11-10", 21, 3)],
        anonymous: [paired("2026-11-16", "2026-11-09", 12, 3), paired("2026-11-17", "2026-11-10", 22, 4)],
        pageviews: [paired("2026-11-16", "2026-11-09", 13, 4), paired("2026-11-17", "2026-11-10", 23, 5)],
      },
    });
  });

  it("still answers a single metric as points", async () => {
    const { deps } = fakeDeps(() => [{ date: "2026-11-16", value: 8, sessions: 1, known: 2, anonymous: 3, pageviews: 9 }]);

    const result = await load("date_from=2026-11-16&date_to=2026-11-16&metric=pageviews", deps);

    expect(result.body).toMatchObject({ points: [{ current: 8 }], series: { pageviews: [{ current: 9 }], known: [{ current: 2 }] } });
  });

  it("refuses to answer when the pipe has not been deployed with every metric", async () => {
    const { deps } = fakeDeps(() => [{ date: "2026-11-16", value: 9 }]);

    const result = await load("date_from=2026-11-16&date_to=2026-11-16", deps);

    expect(result).toEqual({ status: 502, body: { error: "The series feed is missing a metric" } });
  });
});
