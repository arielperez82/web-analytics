"use client";

import { useState } from "react";

import { type DashboardState,drillDay } from "@/lib/dashboard-state";
import {
  APPROXIMATE_COUNT_NOTE,
  formatNumber,
  formatPercent,
  formatSeconds,
  formatSignedPercent,
} from "@/lib/format";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { Panel, type Row,Status } from "./ui";

type Metric = "sessions" | "known" | "anonymous" | "pageviews";

const METRICS: readonly { readonly key: Metric; readonly label: string }[] = [
  { key: "sessions", label: "Sessions" },
  { key: "known", label: "Known visitors" },
  { key: "anonymous", label: "Anonymous visitors" },
  { key: "pageviews", label: "Pageviews" },
];

const field = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0);

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
        <abbr title={APPROXIMATE_COUNT_NOTE} aria-label={APPROXIMATE_COUNT_NOTE}>
          *
        </abbr>
      ) : null}
    </strong>
    {growth === undefined ? null : <small>{growth} vs previous period</small>}
    {caption === undefined ? null : <small>{caption}</small>}
    {note === undefined ? null : <small>{note}</small>}
  </div>
);

const SERIES = {
  daily: { endpoint: "daily_series", key: "date", unit: "day" },
  hourly: { endpoint: "hourly_series", key: "hour", unit: "hour" },
} as const;

export const Kpis = ({
  state,
  params,
  onChange,
}: {
  state: DashboardState;
  params: QueryParams;
  onChange: (next: DashboardState) => void;
}) => {
  const [metric, setMetric] = useState<Metric>("sessions");
  const counts = useEndpoint<Row>("visitor_counts", params).data?.[0];
  const engagement = useEndpoint<Row>("engagement", params).data?.[0];
  const singleDay = params.date_from === params.date_to;
  const { endpoint, key, unit } = singleDay ? SERIES.hourly : SERIES.daily;
  const { data, loading, error } = useEndpoint<Row>(endpoint, { ...params, metric });
  const rows = data ?? [];
  const selected = "from" in state.range ? state.range.from : undefined;
  const label = METRICS.find((option) => option.key === metric)?.label ?? "Sessions";
  return (
    <>
      <div className="cards">
        <Card
          label="Known visitors"
          value={formatNumber(field(counts, "known_visitors"))}
          growth={formatSignedPercent(field(counts, "known_visitors_growth_percent"))}
          note={`${formatPercent(field(counts, "consented_sessions_percent"))} of sessions from people who accepted tracking`}
          caption="Unique people who accepted tracking"
          approximate
        />
        <Card
          label="Anonymous visitors"
          value={formatNumber(field(counts, "anonymous_visitors"))}
          growth={formatSignedPercent(field(counts, "anonymous_visitors_growth_percent"))}
          caption="Unique within a day only: a returning person counts again each day"
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
          growth={formatSignedPercent(field(engagement, "pageviews_growth_percent"))}
        />
        <Card
          label="Bounce rate"
          value={formatPercent(field(engagement, "bounce_rate_percent"))}
          growth={formatSignedPercent(field(engagement, "bounce_rate_growth_percent"))}
        />
        <Card
          label="Avg session"
          value={formatSeconds(field(engagement, "avg_session_sec"))}
          growth={formatSignedPercent(field(engagement, "avg_session_sec_growth_percent"))}
        />
      </div>
      <Panel title={singleDay ? `${label} per hour` : `${label} per day · click a bar to drill in`}>
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
        <Status loading={loading} error={error} empty={rows.length === 0} />
        <div className="chart" role="group" aria-label={`${label} chart`}>
          {rows.map((row) => {
            const day = String(row[key]);
            return (
              <button
                key={day}
                className="col"
                disabled={singleDay}
                aria-pressed={selected === day}
                title={`${day}: ${formatNumber(field(row, "value"))}`}
                onClick={() => onChange(drillDay(state, day))}
              >
                <div style={{ height: `${field(row, "bar_percent")}%` }} />
              </button>
            );
          })}
        </div>
        <p className="muted">Bars are per-{unit} counts and can add up to more than the card.</p>
      </Panel>
    </>
  );
};
