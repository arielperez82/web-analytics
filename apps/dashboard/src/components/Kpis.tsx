"use client";

import { useId, useState } from "react";

import { Badge } from "@/ds/Badge";
import { SegmentedControl } from "@/ds/SegmentedControl";
import { xLabels, yTicks } from "@/lib/chart-axis";
import {
  type Compare,
  type DashboardState,
  drillDay,
  type Grain,
} from "@/lib/dashboard-state";
import { type Delta, deltaOf } from "@/lib/delta";
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

type Growth = { readonly text: string; readonly delta: Delta };

type CardContent = {
  readonly label: string;
  readonly value: string;
  readonly growth?: Growth;
  readonly approximate?: boolean;
  readonly caption?: string;
  readonly note?: string;
};

const growthOf = (percent: number, higherIsBetter: boolean): Growth => ({
  text: formatSignedPercent(percent),
  delta: deltaOf({ percent, higherIsBetter }),
});

const CardBody = ({
  label,
  value,
  growth,
  approximate = false,
  caption,
  note,
  ids,
}: CardContent & { readonly ids: Record<"label" | "value" | "growth" | "caption" | "note", string> }) => (
  <>
    <span id={ids.label}>{label}</span>
    <strong id={ids.value}>
      {value}
      {approximate ? (
        <abbr title={APPROXIMATE_COUNT_NOTE} aria-label={APPROXIMATE_COUNT_NOTE}>
          *
        </abbr>
      ) : null}
    </strong>
    {growth === undefined ? null : (
      <small id={ids.growth} className="delta">
        <Badge tone={growth.delta.tone} arrow={growth.delta.arrow} word={growth.delta.word}>
          {growth.text}
        </Badge>
        vs previous period
      </small>
    )}
    {caption === undefined ? null : <small id={ids.caption}>{caption}</small>}
    {note === undefined ? null : <small id={ids.note}>{note}</small>}
  </>
);

const useCardIds = (content: CardContent) => {
  const base = useId();
  const ids = {
    label: `${base}-label`,
    value: `${base}-value`,
    growth: `${base}-growth`,
    caption: `${base}-caption`,
    note: `${base}-note`,
  };
  const described = [
    ids.value,
    ...(content.growth === undefined ? [] : [ids.growth]),
    ...(content.caption === undefined ? [] : [ids.caption]),
    ...(content.note === undefined ? [] : [ids.note]),
  ].join(" ");
  return { ids, described };
};

const StaticCard = (content: CardContent) => {
  const { ids } = useCardIds(content);
  return (
    <div className="card">
      <CardBody {...content} ids={ids} />
    </div>
  );
};

const SelectableCard = ({
  selected,
  onSelect,
  ...content
}: CardContent & { readonly selected: boolean; readonly onSelect: () => void }) => {
  const { ids, described } = useCardIds(content);
  return (
    <button
      type="button"
      className="card card-select"
      aria-pressed={selected}
      aria-labelledby={ids.label}
      aria-describedby={described}
      onClick={onSelect}
    >
      <CardBody {...content} ids={ids} />
    </button>
  );
};

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
  { key: "off", label: "None" },
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
  const pick = (key: Metric) => ({
    selected: metric === key,
    onSelect: () => setMetric(key),
  });
  return (
    <>
      <div className="cards" role="group" aria-label="Key figures">
        <SelectableCard
          label="Known visitors"
          {...pick("known")}
          value={formatNumber(field(counts, "known_visitors"))}
          growth={growthOf(field(counts, "known_visitors_growth_percent"), true)}
          note={`${formatPercent(field(counts, "consented_sessions_percent"))} of sessions from people who accepted tracking`}
          caption="Unique people, counted once across the range"
          approximate
        />
        <SelectableCard
          label="Anonymous visitors"
          {...pick("anonymous")}
          value={formatNumber(field(counts, "anonymous_visitors"))}
          growth={growthOf(field(counts, "anonymous_visitors_growth_percent"), true)}
          caption="Counted per visitor day, which ends at each visitor’s own midnight: a returning person counts again each day"
          approximate
        />
        <SelectableCard
          label="Sessions"
          {...pick("sessions")}
          value={formatNumber(field(counts, "sessions"))}
          growth={growthOf(field(counts, "sessions_growth_percent"), true)}
          approximate
        />
        <SelectableCard
          label="Pageviews"
          {...pick("pageviews")}
          value={formatNumber(field(engagement, "pageviews"))}
          growth={growthOf(field(engagement, "pageviews_growth_percent"), true)}
        />
        <StaticCard
          label="Bounce rate"
          value={formatPercent(field(engagement, "bounce_rate_percent"))}
          growth={growthOf(field(engagement, "bounce_rate_growth_percent"), false)}
        />
        <StaticCard
          label="Avg session"
          value={formatSeconds(field(engagement, "avg_session_sec"))}
          growth={growthOf(field(engagement, "avg_session_sec_growth_percent"), true)}
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
          <div className="chart-options">
            <SegmentedControl
              label="Chart granularity"
              value={grain}
              options={GRAINS.map((option) => ({
                value: option.key,
                label: option.label,
                disabled:
                  option.key === "hour"
                    ? !hourAvailable(params)
                    : isExactWindow(params),
              }))}
              onChange={(next) => onChange({ ...state, grain: next })}
            />
            {isAllTime(state) ? null : (
              <SegmentedControl
                label="Compare to"
                value={comparisonKey(state)}
                options={comparisons(isExactWindow(params))
                  .filter(
                    (option) =>
                      option.key !== "last_week" ||
                      isSingleDay(params) ||
                      isExactWindow(params),
                  )
                  .map((option) => ({ value: option.key, label: option.label }))}
                onChange={(next) =>
                  onChange({
                    ...state,
                    compare: next === "previous" ? undefined : next,
                  })
                }
              />
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
