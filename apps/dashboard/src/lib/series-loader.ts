import { type ProxyDeps, proxyEndpoint } from "./endpoint-proxy";
import { hourlyRequest, zonedHour } from "./hour-window";
import { type Metric, METRICS } from "./metrics";
import { alignSeries, type SeriesRow } from "./series-comparison";

type LoadRequest = { readonly query: URLSearchParams; readonly authenticated: boolean };

type Params = Readonly<Record<string, string | undefined>>;

type Loaded = { readonly status: number; readonly body: unknown };

const OWN_PARAMS: readonly string[] = ["grain", "compare_from", "compare_to", "compare_from_at"];

const SERIES = {
  day: { endpoint: "daily_series", key: "date" },
  hour: { endpoint: "hourly_series", key: "hour" },
} as const;

const withoutOwn = (query: URLSearchParams): Params =>
  Object.fromEntries([...query.entries()].filter(([key]) => !OWN_PARAMS.includes(key)));

const MISSING_METRIC = { status: 502, body: { error: "The series feed is missing a metric" } } as const;

const countOf = (row: SeriesRow, metric: Metric): SeriesRow["value"] | undefined => {
  const value = row[metric];
  return typeof value === "number" || typeof value === "string" ? value : undefined;
};

const rowsOf = (body: unknown): readonly SeriesRow[] => (body as { data?: readonly SeriesRow[] }).data ?? [];

export const loadSeries = async (
  { query, authenticated }: LoadRequest,
  deps: ProxyDeps,
): Promise<Loaded> => {
  const grain = query.get("grain") === "hour" ? "hour" : "day";
  const { endpoint, key } = SERIES[grain];
  const zone = query.get("tz") ?? "UTC";
  const range = withoutOwn(query);
  const [compareFrom, compareTo] = [query.get("compare_from"), query.get("compare_to")];
  const compareFromAt = query.get("compare_from_at");
  const comparison = compareFromAt
    ? { ...range, from_at: compareFromAt }
    : compareFrom && compareTo
      ? { ...range, date_from: compareFrom, date_to: compareTo }
      : undefined;

  const call = (params: Params) =>
    proxyEndpoint(
      {
        name: endpoint,
        query: new URLSearchParams(
          Object.entries(grain === "hour" ? hourlyRequest(params) : params).flatMap(([name, value]) =>
            value === undefined ? [] : [[name, value] as [string, string]],
          ),
        ),
        authenticated,
      },
      deps,
    );

  const [current, previous] = await Promise.all([call(range), comparison ? call(comparison) : undefined]);
  const failed = [current, previous].find((result) => result !== undefined && result.status !== 200);
  if (failed) return failed;

  const labelled = (rows: readonly SeriesRow[]): readonly SeriesRow[] =>
    grain === "hour" ? rows.map((row) => ({ ...row, hour: zonedHour(String(row.hour), zone) })) : rows;

  const currentRows = labelled(rowsOf(current.body));
  const previousRows = previous ? labelled(rowsOf(previous.body)) : undefined;
  const usable = METRICS.filter((metric) =>
    [...currentRows, ...(previousRows ?? [])].every((row) => countOf(row, metric) !== undefined),
  );
  if (usable.length === 0) return MISSING_METRIC;

  const align = (value: (row: SeriesRow) => SeriesRow["value"]) =>
    alignSeries({
      key,
      current: currentRows.map((row) => ({ ...row, value: value(row) })),
      previous: previousRows?.map((row) => ({ ...row, value: value(row) })),
    });

  return {
    status: 200,
    body: {
      grain,
      series: Object.fromEntries(usable.map((metric) => [metric, align((row) => countOf(row, metric) ?? 0)])),
    },
  };
};
