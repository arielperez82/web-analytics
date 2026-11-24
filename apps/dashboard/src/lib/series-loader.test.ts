import { describe, expect, it } from "vitest";

import type { ProxyDeps } from "./endpoint-proxy";
import { loadSeries } from "./series-loader";

type Rows = readonly Record<string, unknown>[] | undefined;

const fakeDeps = (
  rowsFor: (url: URL) => Rows,
  engagementFor: (url: URL) => Rows = () => undefined,
): { readonly deps: ProxyDeps; readonly urls: URL[] } => {
  const urls: URL[] = [];
  const deps: ProxyDeps = {
    tinybird: { host: "http://tb.test", token: "t" },
    fetch: async (url) => {
      const parsed = new URL(String(url));
      urls.push(parsed);
      const data = parsed.pathname.includes("engagement_series") ? engagementFor(parsed) : rowsFor(parsed);
      return data === undefined
        ? new Response("boom", { status: 500 })
        : new Response(JSON.stringify({ data }), { status: 200 });
    },
  };
  return { deps, urls };
};

const seriesCalls = (urls: readonly URL[]) => urls.filter((url) => !url.pathname.includes("engagement_series"));

const load = (query: string, deps: ProxyDeps, authenticated = true) =>
  loadSeries({ query: new URLSearchParams(query), authenticated }, deps);

const counts = { sessions: 0, known: 0, anonymous: 0, pageviews: 0 };

const byStart = (url: URL) =>
  url.searchParams.get("date_from") === "2026-11-16"
    ? [
        { date: "2026-11-16", ...counts, sessions: 5, value: 5 },
        { date: "2026-11-17", ...counts, sessions: 7, value: 7 },
      ]
    : [
        { date: "2026-11-09", ...counts, sessions: 3, value: 3 },
        { date: "2026-11-10", ...counts, sessions: 4, value: 4 },
      ];

describe("loadSeries", () => {
  it("loads the range and its comparison together and pairs them", async () => {
    const { deps, urls } = fakeDeps(byStart);
    const result = await load(
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10&metric=sessions",
      deps,
    );
    expect(seriesCalls(urls).map((u) => [u.pathname, u.searchParams.get("date_from"), u.searchParams.get("date_to")])).toEqual([
      ["/v0/pipes/daily_series.json", "2026-11-16", "2026-11-17"],
      ["/v0/pipes/daily_series.json", "2026-11-09", "2026-11-10"],
    ]);
    expect(result).toEqual({
      status: 200,
      body: {
        grain: "day",
        series: expect.objectContaining({
          sessions: [
            { label: "2026-11-16", current: 5, previousLabel: "2026-11-09", previous: 3 },
            { label: "2026-11-17", current: 7, previousLabel: "2026-11-10", previous: 4 },
          ],
        }),
      },
    });
  });

  it("keeps the filters and the zone on both calls, never forwards the comparison dates, and asks for no single metric", async () => {
    const { deps, urls } = fakeDeps(byStart);
    await load(
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10&metric=known&location=ES&tz=Europe%2FMadrid",
      deps,
    );
    for (const url of urls) {
      expect(url.searchParams.has("metric")).toBe(false);
      expect(url.searchParams.get("location")).toBe("ES");
      expect(url.searchParams.get("tz")).toBe("Europe/Madrid");
      expect(url.searchParams.has("compare_from")).toBe(false);
      expect(url.searchParams.has("grain")).toBe(false);
    }
  });

  it("loads only the range when there is nothing to compare with", async () => {
    const { deps, urls } = fakeDeps(byStart);
    const result = await load("date_from=2026-11-16&date_to=2026-11-17", deps);
    expect(seriesCalls(urls)).toHaveLength(1);
    expect(result.body).toMatchObject({ series: { sessions: [{ previous: null }, { previous: null }] } });
  });

  it("loads hourly buckets for both ranges and reads their labels on the clock of the zone", async () => {
    const { deps, urls } = fakeDeps((url) => [
      { hour: url.searchParams.get("from_at")?.startsWith("2026-11-17") ? "2026-11-17 05:00:00" : "2026-11-16 05:00:00", ...counts, value: 2 },
    ]);
    const result = await load(
      "grain=hour&tz=America%2FNew_York&date_from=2026-11-17&date_to=2026-11-17&compare_from=2026-11-16&compare_to=2026-11-16",
      deps,
    );
    expect(seriesCalls(urls).map((u) => [u.pathname, u.searchParams.get("from_at"), u.searchParams.has("date_from")])).toEqual([
      ["/v0/pipes/hourly_series.json", "2026-11-17T05:00:00Z", false],
      ["/v0/pipes/hourly_series.json", "2026-11-16T05:00:00Z", false],
    ]);
    expect(result.body).toMatchObject({
      grain: "hour",
      series: { sessions: [{ label: "2026-11-17 00:00:00", previousLabel: "2026-11-16 00:00:00" }] },
    });
  });

  it("loads 24 hours from an exact start and the 24 hours it is compared with", async () => {
    const { deps, urls } = fakeDeps(() => [{ hour: "2026-11-17 16:00:00", ...counts, value: 2 }]);
    await load(
      "grain=hour&date_from=2026-11-17&date_to=2026-11-18&from_at=2026-11-17T16:00:00Z&compare_from_at=2026-11-16T16:00:00Z",
      deps,
    );
    expect(
      seriesCalls(urls).map((u) => [u.searchParams.get("from_at"), u.searchParams.get("to_at"), u.searchParams.has("date_from")]),
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

    expect(seriesCalls(urls)).toHaveLength(2);
    const paired = (label: string, previousLabel: string, current: number, previous: number) => ({
      label,
      current,
      previousLabel,
      previous,
    });
    expect(result.body).toEqual({
      grain: "day",
      series: {
        sessions: [paired("2026-11-16", "2026-11-09", 10, 1), paired("2026-11-17", "2026-11-10", 20, 2)],
        known: [paired("2026-11-16", "2026-11-09", 11, 2), paired("2026-11-17", "2026-11-10", 21, 3)],
        anonymous: [paired("2026-11-16", "2026-11-09", 12, 3), paired("2026-11-17", "2026-11-10", 22, 4)],
        pageviews: [paired("2026-11-16", "2026-11-09", 13, 4), paired("2026-11-17", "2026-11-10", 23, 5)],
      },
    });
  });

  it("answers with the metrics it has when a pipe lacks one", async () => {
    const { deps } = fakeDeps(() => [{ date: "2026-11-16", value: 8, sessions: 1, known: 2, anonymous: 3 }]);

    const result = await load("date_from=2026-11-16&date_to=2026-11-16", deps);

    expect(result.status).toBe(200);
    expect(Object.keys((result.body as { series: object }).series).sort()).toEqual(["anonymous", "known", "sessions"]);
  });

  it("leaves out a metric that any row lacks, in either period", async () => {
    const full = { sessions: 1, known: 2, anonymous: 3, pageviews: 4 };
    const { deps } = fakeDeps((url) =>
      url.searchParams.get("date_from") === "2026-11-16"
        ? [{ date: "2026-11-16", value: 1, ...full }]
        : [{ date: "2026-11-09", value: 1, sessions: 1, known: 2, anonymous: 3 }],
    );

    const result = await load("date_from=2026-11-16&date_to=2026-11-16&compare_from=2026-11-09&compare_to=2026-11-09", deps);

    expect(Object.keys((result.body as { series: object }).series).sort()).toEqual(["anonymous", "known", "sessions"]);
  });

  it("refuses to answer when the pipe has no metric at all", async () => {
    const { deps } = fakeDeps(() => [{ date: "2026-11-16", value: 9 }]);

    const result = await load("date_from=2026-11-16&date_to=2026-11-16", deps);

    expect(result).toEqual({ status: 502, body: { error: "The series feed is missing a metric" } });
  });

  describe("bounce rate and average session", () => {
    const engagementDay = (date: string, bounce: number, average: number) => ({
      date,
      session_count: 1,
      bounce_rate_percent: bounce,
      avg_session_sec: average,
    });
    const engagementByStart = (url: URL) =>
      url.searchParams.get("date_from") === "2026-11-16"
        ? [engagementDay("2026-11-16", 40, 90), engagementDay("2026-11-17", 50, 100)]
        : [engagementDay("2026-11-09", 30, 60), engagementDay("2026-11-10", 20, 70)];
    const both =
      "date_from=2026-11-16&date_to=2026-11-17&compare_from=2026-11-09&compare_to=2026-11-10";

    it("pairs both with the comparison, from the engagement pipe, in the same call", async () => {
      const { deps, urls } = fakeDeps(byStart, engagementByStart);

      const result = await load(both, deps);

      expect(urls.filter((url) => url.pathname === "/v0/pipes/daily_engagement_series.json")).toHaveLength(2);
      expect(result.body).toMatchObject({
        series: {
          bounce_rate: [
            { label: "2026-11-16", current: 40, previousLabel: "2026-11-09", previous: 30 },
            { label: "2026-11-17", current: 50, previousLabel: "2026-11-10", previous: 20 },
          ],
          avg_session: [
            { label: "2026-11-16", current: 90, previousLabel: "2026-11-09", previous: 60 },
            { label: "2026-11-17", current: 100, previousLabel: "2026-11-10", previous: 70 },
          ],
        },
      });
    });

    it("asks the engagement pipe for the same range, filters and zone as the counts, and no metric", async () => {
      const { deps, urls } = fakeDeps(byStart, engagementByStart);

      await load(`${both}&location=ES&tz=Europe%2FMadrid`, deps);

      for (const url of urls.filter((u) => u.pathname.includes("engagement_series"))) {
        expect(url.searchParams.get("location")).toBe("ES");
        expect(url.searchParams.get("tz")).toBe("Europe/Madrid");
        expect(url.searchParams.has("compare_from")).toBe(false);
        expect(url.searchParams.has("metric")).toBe(false);
      }
    });

    it("still answers the counts when only the engagement pipe fails", async () => {
      const { deps } = fakeDeps(byStart, () => undefined);

      const result = await load(both, deps);

      expect(result.status).toBe(200);
      expect(Object.keys((result.body as { series: object }).series).sort()).toEqual([
        "anonymous",
        "known",
        "pageviews",
        "sessions",
      ]);
    });

    it("leaves out only the one it cannot read when a row lacks a field", async () => {
      const { deps } = fakeDeps(byStart, () => [
        { date: "2026-11-16", session_count: 1, bounce_rate_percent: 40 },
        { date: "2026-11-17", session_count: 1, bounce_rate_percent: 50 },
      ]);

      const result = await load("date_from=2026-11-16&date_to=2026-11-17", deps);

      const keys = Object.keys((result.body as { series: object }).series);
      expect(keys).toContain("bounce_rate");
      expect(keys).not.toContain("avg_session");
    });

    it("still answers the counts when the engagement pipe answers with a body it cannot read", async () => {
      const { deps } = fakeDeps(byStart);
      const readable: ProxyDeps = {
        ...deps,
        fetch: async (url, init) =>
          String(url).includes("engagement_series") ? new Response("null", { status: 200 }) : deps.fetch(url, init),
      };

      const result = await load(both, readable);

      expect(result.status).toBe(200);
      expect(Object.keys((result.body as { series: object }).series).sort()).toEqual([
        "anonymous",
        "known",
        "pageviews",
        "sessions",
      ]);
    });

    it("leaves the engagement trends out when they do not span the same days as the counts", async () => {
      const { deps } = fakeDeps(byStart, (url) => [
        engagementDay("2026-11-15", 10, 10),
        ...engagementByStart(url),
      ]);

      const result = await load(both, deps);

      expect(Object.keys((result.body as { series: object }).series).sort()).toEqual([
        "anonymous",
        "known",
        "pageviews",
        "sessions",
      ]);
    });

    it("fails as a whole when the counts fail, even if engagement answers", async () => {
      const { deps } = fakeDeps(() => undefined, engagementByStart);

      const result = await load(both, deps);

      expect(result).toEqual({ status: 502, body: { error: "Upstream error" } });
    });

    it("reads hourly engagement over the same windows, on the clock of the zone", async () => {
      const hour = (at: string) => ({ hour: at, session_count: 1, bounce_rate_percent: 10, avg_session_sec: 20 });
      const { deps, urls } = fakeDeps(
        (url) => [{ hour: url.searchParams.get("from_at")?.startsWith("2026-11-17") ? "2026-11-17 05:00:00" : "2026-11-16 05:00:00", ...counts, value: 2 }],
        (url) => [hour(url.searchParams.get("from_at")?.startsWith("2026-11-17") ? "2026-11-17 05:00:00" : "2026-11-16 05:00:00")],
      );

      const result = await load(
        "grain=hour&tz=America%2FNew_York&date_from=2026-11-17&date_to=2026-11-17&compare_from=2026-11-16&compare_to=2026-11-16",
        deps,
      );

      expect(
        urls
          .filter((u) => u.pathname.includes("engagement_series"))
          .map((u) => [u.pathname, u.searchParams.get("from_at"), u.searchParams.has("date_from")]),
      ).toEqual([
        ["/v0/pipes/hourly_engagement_series.json", "2026-11-17T05:00:00Z", false],
        ["/v0/pipes/hourly_engagement_series.json", "2026-11-16T05:00:00Z", false],
      ]);
      expect(result.body).toMatchObject({
        series: { bounce_rate: [{ label: "2026-11-17 00:00:00", previousLabel: "2026-11-16 00:00:00" }] },
      });
    });
  });
});
