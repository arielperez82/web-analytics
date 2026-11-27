"use client";

import { useRef, useState } from "react";

import { Badge } from "@/ds/Badge";
import { KpiCard } from "@/ds/KpiCard";
import { SegmentedControl } from "@/ds/SegmentedControl";
import { Sparkline } from "@/ds/Sparkline";
import { xLabels, yTicks } from "@/lib/chart-axis";
import {
  type DashboardState,
  drillDay,
  type Grain,
} from "@/lib/dashboard-state";
import type { CompareChoice } from "@/lib/compare-window";
import { comparisonTitle, comparisonWords } from "@/lib/comparison-words";
import { type Delta, deltaOf } from "@/lib/delta";
import {
  APPROXIMATE_COUNT_NOTE,
  formatNumber,
  formatPercent,
  formatSeconds,
  type Spoken,
  spokenSignedNumber,
  spokenSignedPercent,
  spokenSignedPoints,
  spokenSignedSeconds,
} from "@/lib/format";
import { effectiveGrain, hourAvailable, hourBucket, isExactWindow } from "@/lib/grain";
import type { ComparisonParams, QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";
import { type Metric, type Trend, type TrendPoint, useSeries } from "@/lib/use-series";

import { LineChart } from "./LineChart";
import { Panel, type Row, Status } from "./ui";

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

type Growth = (Spoken & { readonly delta: Delta; readonly against: CompareChoice }) | "no-previous-data";

const NO_PREVIOUS_DATA = "No previous data";

type CardContent = {
  readonly label: string;
  readonly value: string;
  readonly growth?: Growth;
  readonly approximate?: boolean;
  readonly caption?: string;
  readonly note?: string;
  readonly trend?: readonly TrendPoint[];
};

const growthOf = ({
  row,
  key,
  format,
  higherIsBetter = true,
  against,
}: {
  readonly row: Row | undefined;
  readonly key: string;
  readonly format: (value: number) => Spoken;
  readonly higherIsBetter?: boolean;
  readonly against: CompareChoice;
}): Growth => {
  if (row?.[`${key}_change`] == null || row[`${key}_growth_percent`] == null) return "no-previous-data";
  const change = field(row, `${key}_change`);
  const amount = format(change);
  const percent = spokenSignedPercent(field(row, `${key}_growth_percent`));
  return {
    text: `${amount.text} (${percent.text})`,
    spoken: `${amount.spoken}, ${percent.spoken}`,
    delta: deltaOf({ change, higherIsBetter }),
    against,
  };
};

const deltaOfGrowth = (growth: Growth | undefined) => {
  if (growth === undefined) return undefined;
  if (growth === "no-previous-data")
    return (
      <Badge tone="neutral">{NO_PREVIOUS_DATA}</Badge>
    );
  return (
    <>
      <Badge tone={growth.delta.tone} arrow={growth.delta.arrow} word={growth.delta.word}>
        <span aria-hidden="true">{growth.text}</span>
        <span className="ds-sr">{growth.spoken}</span>
      </Badge>
      <span className="ds-sr">vs {comparisonWords(growth.against)}</span>
    </>
  );
};

const cardProps = ({ label, value, growth, approximate = false, caption, note, trend }: CardContent) => ({
  label,
  value,
  delta: deltaOfGrowth(growth),
  tips: [caption, note, approximate ? APPROXIMATE_COUNT_NOTE : undefined].filter(
    (tip): tip is string => tip !== undefined,
  ),
  trend: trend === undefined ? undefined : <Sparkline points={trend} />,
});

const StaticCard = (content: CardContent) => <KpiCard {...cardProps(content)} />;

const SelectableCard = ({
  selected,
  onSelect,
  ...content
}: CardContent & { readonly selected: boolean; readonly onSelect: () => void }) => (
  <KpiCard {...cardProps(content)} selected={selected} onSelect={onSelect} />
);

export const Kpis = ({
  state,
  params,
  comparison,
  onChange,
}: {
  state: DashboardState;
  params: QueryParams;
  comparison?: ComparisonParams;
  onChange: (next: DashboardState) => void;
}) => {
  const [metric, setMetric] = useState<Metric>("sessions");
  const chartPanel = useRef<HTMLElement>(null);
  const compared = { ...params, ...comparison };
  const countsFeed = useEndpoint<Row>("visitor_counts", compared);
  const engagementFeed = useEndpoint<Row>("engagement", compared);
  const growthFor = (figure: Omit<Parameters<typeof growthOf>[0], "against">) =>
    comparison === undefined ? undefined : growthOf({ ...figure, against: comparison.compare });
  const counts = countsFeed.data?.[0];
  const engagement = engagementFeed.data?.[0];
  const figuresError = countsFeed.error ?? engagementFeed.error;
  const figuresStale = countsFeed.data !== undefined || engagementFeed.data !== undefined;
  const retryFigures = () => {
    if (countsFeed.error !== undefined) countsFeed.retry();
    if (engagementFeed.error !== undefined) engagementFeed.retry();
  };
  const grain = effectiveGrain({ grain: state.grain, params });
  const hourly = grain === "hour";
  const bucket = hourBucket(params) ?? 1;
  const perHour = bucket === 1 ? "hour" : `${String(bucket)} hours`;
  const unit = hourly ? "hour" : "day";
  const { series, loading, error, refreshing, retry } = useSeries({ ...params, ...comparison, grain });
  const retryChart = () => {
    chartPanel.current?.focus();
    retry();
  };
  const points = series?.[metric];
  const rows = points ?? [];
  const unavailable = series !== undefined && points === undefined;
  const ticks = yTicks(
    rows.flatMap((row) =>
      row.previous === null ? [row.current] : [row.current, row.previous],
    ),
  );
  const selected = "from" in state.range ? state.range.from : undefined;
  const label =
    METRICS.find((option) => option.key === metric)?.label ?? "Sessions";
  const chartError = error ?? (unavailable ? `${label} is not available from the server yet` : undefined);
  const grainOptions = GRAINS.map((option) => ({
    value: option.key,
    label: option.label,
    disabled: option.key === "hour" ? !hourAvailable(params) : isExactWindow(params),
  }));
  const setGrain = (key: Grain) => {
    if (key !== grain && grainOptions.find((option) => option.value === key)?.disabled === false)
      onChange({ ...state, grain: key });
  };
  const trendOf = (key: Trend) => ({ trend: series === undefined ? [] : series[key] });
  const pick = (key: Metric) => ({
    ...trendOf(key),
    selected: metric === key,
    onSelect: () => setMetric(key),
  });
  return (
    <>
      <Status loading={false} error={figuresError} stale={figuresStale} empty={false} onRetry={retryFigures} />
      <div className="cards" role="group" aria-label="Key figures">
        <SelectableCard
          label="Known visitors"
          {...pick("known")}
          value={formatNumber(field(counts, "known_visitors"))}
          growth={growthFor({ row: counts, key: "known_visitors", format: spokenSignedNumber })}
          note={`${formatPercent(field(counts, "consented_sessions_percent"))} of sessions from people who accepted tracking`}
          caption="Unique people, counted once across the range"
          approximate
        />
        <SelectableCard
          label="Anonymous visitors"
          {...pick("anonymous")}
          value={formatNumber(field(counts, "anonymous_visitors"))}
          growth={growthFor({ row: counts, key: "anonymous_visitors", format: spokenSignedNumber })}
          caption="Counted per visitor day, which ends at each visitor’s own midnight: a returning person counts again each day"
          approximate
        />
        <SelectableCard
          label="Sessions"
          {...pick("sessions")}
          value={formatNumber(field(counts, "sessions"))}
          growth={growthFor({ row: counts, key: "sessions", format: spokenSignedNumber })}
          approximate
        />
        <SelectableCard
          label="Pageviews"
          {...pick("pageviews")}
          value={formatNumber(field(engagement, "pageviews"))}
          growth={growthFor({ row: engagement, key: "pageviews", format: spokenSignedNumber })}
        />
        <StaticCard
          label="Bounce rate"
          {...trendOf("bounce_rate")}
          value={formatPercent(field(engagement, "bounce_rate_percent"))}
          growth={growthFor({ row: engagement, key: "bounce_rate", format: spokenSignedPoints, higherIsBetter: false })}
        />
        <StaticCard
          label="Avg session"
          {...trendOf("avg_session")}
          value={formatSeconds(field(engagement, "avg_session_sec"))}
          growth={growthFor({ row: engagement, key: "avg_session_sec", format: spokenSignedSeconds })}
        />
      </div>
      <Panel
        ref={chartPanel}
        focusable
        aside={
          <ul className="legend" aria-label="Chart legend">
            <li className="current">This period</li>
            {comparison === undefined ? null : <li className="previous">{comparisonTitle(comparison.compare)}</li>}
          </ul>
        }
        title={`${label} per ${hourly ? perHour : "day"}`}
      >
        <div className="chart-controls">
          <div className="chart-options">
            <SegmentedControl
              label="Chart granularity"
              value={grain}
              options={grainOptions}
              onChange={setGrain}
            />
          </div>
        </div>
        <Status loading={false} error={chartError} stale={points !== undefined} empty={false} onRetry={retryChart} />
        <div className="chart-frame">
          <div className="y-axis" role="group" aria-label="Chart y axis">
            {ticks.map((tick) => (
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
                  refreshing={refreshing}
                  empty={rows.length === 0 && chartError === undefined}
                />
              </div>
              <LineChart
                points={rows}
                gridlines={ticks.map((tick) => tick.percent)}
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
      </Panel>
    </>
  );
};
