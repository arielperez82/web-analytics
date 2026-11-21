"use client";

import { useState } from "react";

import { xLabels, yTicks } from "@/lib/chart-axis";
import {
  type Compare,
  type DashboardState,
  drillDay,
  type Grain,
} from "@/lib/dashboard-state";
import {
  APPROXIMATE_COUNT_NOTE,
  formatNumber,
  formatPercent,
  formatSeconds,
  formatSignedPercent,
} from "@/lib/format";
import { effectiveGrain, hourAvailable, hourBucket } from "@/lib/grain";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";
import { useSeries } from "@/lib/use-series";

import { LineChart } from "./LineChart";
import { Panel, type Row, Status } from "./ui";

type Metric = "sessions" | "known" | "anonymous" | "pageviews";

const METRICS: readonly { readonly key: Metric; readonly label: string }[] = [
  { key: "sessions", label: "Sessions" },
  { key: "known", label: "Known visitors" },
  { key: "anonymous", label: "Anonymous visitors" },
  { key: "pageviews", label: "Pageviews" },
];

const GRAINS: readonly { readonly key: Grain; readonly label: string }[] = [
  { key: "day", label: "Day" },
  { key: "hour", label: "Hour" },
];

const field = (row: Row | undefined, key: string): number =>
  Number(row?.[key] ?? 0);

const Card = ({
  label,
  value,
  growth,
  approximate = false,
  caption,
  note,
}: {
  label: string;
  value: string;
  growth?: string;
  approximate?: boolean;
  caption?: string;
  note?: string;
}) => (
  <div className="card">
    <span>{label}</span>
    <strong>
      {value}
      {approximate ? (
        <abbr
          title={APPROXIMATE_COUNT_NOTE}
          aria-label={APPROXIMATE_COUNT_NOTE}
        >
          *
        </abbr>
      ) : null}
    </strong>
    {growth === undefined ? null : <small>{growth} vs previous period</small>}
    {caption === undefined ? null : <small>{caption}</small>}
    {note === undefined ? null : <small>{note}</small>}
  </div>
);

const comparisons = (
  exact: boolean,
): readonly {
  readonly key: Compare | "previous";
  readonly label: string;
}[] => [
  { key: "previous", label: "Previous period" },
  {
    key: "last_week",
    label: exact ? "Same hours last week" : "Same day last week",
  },
  { key: "off", label: "Off" },
];

const isExactWindow = (params: QueryParams): boolean =>
  params.from_at !== undefined;

const isSingleDay = (params: QueryParams): boolean =>
  params.date_from === params.date_to;

const thisPeriod = (params: QueryParams): string =>
  isExactWindow(params)
    ? "This period · Last 24 hours"
    : `This period · ${String(params.date_from)} – ${String(params.date_to)}`;

const comparedPeriod = (
  {
    state,
    params,
  }: { readonly state: DashboardState; readonly params: QueryParams },
  comparison: { readonly compare_from: string; readonly compare_to: string },
): string => {
  const lastWeek = state.compare === "last_week";
  if (isExactWindow(params))
    return lastWeek
      ? "Same hours last week · a week earlier"
      : "Previous period · the 24 hours before";
  return `${lastWeek ? "Same day last week" : "Previous period"} · ${comparison.compare_from} – ${comparison.compare_to}`;
};

const comparisonKey = (state: DashboardState): Compare | "previous" =>
  state.compare ?? "previous";

const isAllTime = (state: DashboardState): boolean =>
  "preset" in state.range && state.range.preset === "all_time";

export const Kpis = ({
  state,
  params,
  comparison,
  onChange,
}: {
  state: DashboardState;
  params: QueryParams;
  comparison?: {
    readonly compare_from: string;
    readonly compare_to: string;
    readonly compare_from_at?: string;
  };
  onChange: (next: DashboardState) => void;
}) => {
  const [metric, setMetric] = useState<Metric>("sessions");
  const counts = useEndpoint<Row>("visitor_counts", params).data?.[0];
  const engagement = useEndpoint<Row>("engagement", params).data?.[0];
  const grain = effectiveGrain({ grain: state.grain, params });
  const hourly = grain === "hour";
  const bucket = hourBucket(params) ?? 1;
  const perHour = bucket === 1 ? "hour" : `${String(bucket)} hours`;
  const unit = hourly ? "hour" : "day";
  const { points, loading, error } = useSeries({
    ...params,
    ...comparison,
    grain,
    metric,
  });
  const rows = points ?? [];
  const selected = "from" in state.range ? state.range.from : undefined;
  const label =
    METRICS.find((option) => option.key === metric)?.label ?? "Sessions";
  return (
    <>
      <div className="cards">
        <Card
          label="Known visitors"
          value={formatNumber(field(counts, "known_visitors"))}
          growth={formatSignedPercent(
            field(counts, "known_visitors_growth_percent"),
          )}
          note={`${formatPercent(field(counts, "consented_sessions_percent"))} of sessions from people who accepted tracking`}
          caption="Unique people, counted once across the range"
          approximate
        />
        <Card
          label="Anonymous visitors"
          value={formatNumber(field(counts, "anonymous_visitors"))}
          growth={formatSignedPercent(
            field(counts, "anonymous_visitors_growth_percent"),
          )}
          caption="Counted per visitor day, which ends at each visitor’s own midnight: a returning person counts again each day"
          approximate
        />
        <Card
          label="Sessions"
          value={formatNumber(field(counts, "sessions"))}
          growth={formatSignedPercent(field(counts, "sessions_growth_percent"))}
          approximate
        />
        <Card
          label="Pageviews"
          value={formatNumber(field(engagement, "pageviews"))}
          growth={formatSignedPercent(
            field(engagement, "pageviews_growth_percent"),
          )}
        />
        <Card
          label="Bounce rate"
          value={formatPercent(field(engagement, "bounce_rate_percent"))}
          growth={formatSignedPercent(
            field(engagement, "bounce_rate_growth_percent"),
          )}
        />
        <Card
          label="Avg session"
          value={formatSeconds(field(engagement, "avg_session_sec"))}
          growth={formatSignedPercent(
            field(engagement, "avg_session_sec_growth_percent"),
          )}
        />
      </div>
      <Panel
        title={
          hourly
            ? `${label} per ${perHour}`
            : `${label} per day · click a point to drill in`
        }
      >
        <div className="chart-controls">
          <div className="chart-metric" role="group" aria-label="Chart series">
            {METRICS.map((option) => (
              <button
                key={option.key}
                aria-pressed={metric === option.key}
                onClick={() => setMetric(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="chart-options">
            <div
              className="chart-metric"
              role="group"
              aria-label="Chart granularity"
            >
              {GRAINS.map((option) => (
                <button
                  key={option.key}
                  aria-pressed={grain === option.key}
                  disabled={
                    option.key === "hour"
                      ? !hourAvailable(params)
                      : isExactWindow(params)
                  }
                  onClick={() => onChange({ ...state, grain: option.key })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {isAllTime(state) ? null : (
              <div
                className="chart-metric"
                role="group"
                aria-label="Compare to"
              >
                {comparisons(isExactWindow(params))
                  .filter(
                    (option) =>
                      option.key !== "last_week" ||
                      isSingleDay(params) ||
                      isExactWindow(params),
                  )
                  .map((option) => (
                    <button
                      key={option.key}
                      aria-pressed={comparisonKey(state) === option.key}
                      onClick={() =>
                        onChange({
                          ...state,
                          compare:
                            option.key === "previous" ? undefined : option.key,
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="chart-frame">
          <div className="y-axis" role="group" aria-label="Chart y axis">
            {yTicks(
              rows.flatMap((row) =>
                row.previous === null
                  ? [row.current]
                  : [row.current, row.previous],
              ),
            ).map((tick) => (
              <span key={tick.percent} style={{ bottom: `${tick.percent}%` }}>
                {formatNumber(tick.value)}
              </span>
            ))}
          </div>
          <div className="chart-body">
            <div className="chart" role="group" aria-label={`${label} chart`}>
              <div className="chart-status">
                <Status
                  loading={loading}
                  error={error}
                  empty={rows.length === 0}
                />
              </div>
              <LineChart
                points={rows}
                selected={selected}
                drillable={!hourly}
                onDrill={(day) => onChange(drillDay(state, day))}
              />
            </div>
            <div className="x-axis" role="group" aria-label="Chart x axis">
              {xLabels(
                rows.map((row) => row.label),
                unit,
              ).map((text, index) => (
                <span key={index}>{text}</span>
              ))}
            </div>
          </div>
        </div>
        <ul className="legend" aria-label="Chart legend">
          <li className="current">{thisPeriod(params)}</li>
          {comparison === undefined ? null : (
            <li className="previous">
              {comparedPeriod({ state, params }, comparison)}
            </li>
          )}
        </ul>
        <small className="footnote">
          Lines are per-{unit} counts and can add up to more than the card.
        </small>
      </Panel>
    </>
  );
};
