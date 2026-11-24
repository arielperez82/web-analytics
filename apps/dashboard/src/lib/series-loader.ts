import { type ProxyDeps, proxyEndpoint } from "./endpoint-proxy";
import { hourlyRequest, zonedHour } from "./hour-window";
import { METRICS, type Trend } from "./metrics";
import { alignSeries, type SeriesRow } from "./series-comparison";

type LoadRequest = { readonly query: URLSearchParams; readonly authenticated: boolean };

type Params = Readonly<Record<string, string | undefined>>;

type Loaded = { readonly status: number; readonly body: unknown };

const OWN_PARAMS: readonly string[] = ["grain", "compare_from", "compare_to", "compare_from_at"];

const SERIES = {
  day: { endpoint: "daily_series", engagement: "daily_engagement_series", key: "date" },
  hour: { endpoint: "hourly_series", engagement: "hourly_engagement_series", key: "hour" },
} as const;

type Source = readonly (readonly [Trend, string])[];

const COUNTS: Source = METRICS.map((metric) => [metric, metric] as const);

const ENGAGEMENT: Source = [
  ["bounce_rate", "bounce_rate_percent"],
  ["avg_session", "avg_session_sec"],
];

const withoutOwn = (query: URLSearchParams): Params =>
  Object.fromEntries([...query.entries()].filter(([key]) => !OWN_PARAMS.includes(key)));

const MISSING_METRIC = { status: 502, body: { error: "The series feed is missing a metric" } } as const;

const countOf = (row: SeriesRow, field: string): SeriesRow["value"] | undefined => {
  const value = row[field];
  return typeof value === "number" || typeof value === "string" ? value : undefined;
};

const rowsOf = (body: unknown): readonly SeriesRow[] => (body as { data?: readonly SeriesRow[] }).data ?? [];

export const loadSeries = async (
  { query, authenticated }: LoadRequest,
  deps: ProxyDeps,
): Promise<Loaded> => {
  const grain = query.get("grain") === "hour" ? "hour" : "day";
  const { endpoint, engagement, key } = SERIES[grain];
  const zone = query.get("tz") ?? "UTC";
  const range = withoutOwn(query);
  const [compareFrom, compareTo] = [query.get("compare_from"), query.get("compare_to")];
  const compareFromAt = query.get("compare_from_at");
  const comparison = compareFromAt
    ? { ...range, from_at: compareFromAt }
    : compareFrom && compareTo
      ? { ...range, date_from: compareFrom, date_to: compareTo }
      : undefined;

  const call = (name: string, params: Params) =>
    proxyEndpoint(
      {
        name,
        query: new URLSearchParams(
          Object.entries(grain === "hour" ? hourlyRequest(params) : params).flatMap(([field, value]) =>
            value === undefined ? [] : [[field, value] as [string, string]],
          ),
        ),
        authenticated,
      },
      deps,
    );
  const both = (name: string) => Promise.all([call(name, range), comparison ? call(name, comparison) : undefined]);

  const [[current, previous], [currentEngagement, previousEngagement]] = await Promise.all([
    both(endpoint),
    both(engagement),
  ]);
  const failed = [current, previous].find((result) => result !== undefined && result.status !== 200);
  if (failed) return failed;

  const labelled = (rows: readonly SeriesRow[]): readonly SeriesRow[] =>
    grain === "hour" ? rows.map((row) => ({ ...row, hour: zonedHour(String(row.hour), zone) })) : rows;

  const trendsOf = (
    source: Source,
    answers: readonly [Loaded, Loaded | undefined],
  ): readonly (readonly [Trend, unknown])[] => {
    const [now, before] = answers;
    const currentRows = labelled(rowsOf(now.body));
    const previousRows = before ? labelled(rowsOf(before.body)) : undefined;
    return source
      .filter(([, field]) =>
        [...currentRows, ...(previousRows ?? [])].every((row) => countOf(row, field) !== undefined),
      )
      .map(([trend, field]) => [
        trend,
        alignSeries({
          key,
          current: currentRows.map((row) => ({ ...row, value: countOf(row, field) ?? 0 })),
          previous: previousRows?.map((row) => ({ ...row, value: countOf(row, field) ?? 0 })),
        }),
      ]);
  };

  const counts = trendsOf(COUNTS, [current, previous]);
  if (counts.length === 0) return MISSING_METRIC;
  const readable = [currentEngagement, previousEngagement].every((result) => result === undefined || result.status === 200);
  const span = (trend: unknown): number => (Array.isArray(trend) ? trend.length : 0);
  const countSpan = span(counts[0][1]);
  const engagementTrends = (() => {
    if (!readable || currentEngagement.status !== 200) return [];
    try {
      return trendsOf(ENGAGEMENT, [currentEngagement, previousEngagement]).filter(
        ([, trend]) => span(trend) === countSpan,
      );
    } catch {
      return [];
    }
  })();

  return {
    status: 200,
    body: { grain, series: Object.fromEntries([...counts, ...engagementTrends]) },
  };
};
