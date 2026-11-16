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

type Metric = "visits" | "known" | "daily" | "pageviews";

const METRICS: readonly { readonly key: Metric; readonly label: string }[] = [
  { key: "visits", label: "Visits" },
  { key: "known", label: "Known visitors" },
  { key: "daily", label: "Daily visitors" },
  { key: "pageviews", label: "Pageviews" },
];

const field = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0);

const Card = ({
  label,
  value,
  growth,
  approximate = false,
  note,
}: {
  label: string;
  value: string;
  growth?: string;
  approximate?: boolean;
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
    {note === undefined ? null : <small>{note}</small>}
  </div>
);

export const Kpis = ({
  state,
  params,
  onChange,
}: {
  state: DashboardState;
  params: QueryParams;
  onChange: (next: DashboardState) => void;
}) => {
  const [metric, setMetric] = useState<Metric>("visits");
  const counts = useEndpoint<Row>("visitor_counts", params).data?.[0];
  const engagement = useEndpoint<Row>("engagement", params).data?.[0];
  const { data, loading, error } = useEndpoint<Row>("daily_series", { ...params, metric });
  const rows = data ?? [];
  const singleDay = params.days === "1";
  const selected = "from" in state.range ? state.range.from : undefined;
  const label = METRICS.find((option) => option.key === metric)?.label ?? "Visits";
  return (
    <>
      <div className="cards">
        <Card
          label="Known visitors"
          value={formatNumber(field(counts, "known_visitors"))}
          growth={formatSignedPercent(field(counts, "known_visitors_growth_percent"))}
          note={`${formatPercent(field(counts, "consented_visits_percent"))} of visits from people who accepted tracking`}
          approximate
        />
        <Card
          label="Daily visitors"
          value={formatNumber(field(counts, "daily_visitors"))}
          growth={formatSignedPercent(field(counts, "daily_visitors_growth_percent"))}
          note="Counted per day, so a returning person counts again each day"
          approximate
        />
        <Card
          label="Visits"
          value={formatNumber(field(counts, "visits"))}
          growth={formatSignedPercent(field(counts, "visits_growth_percent"))}
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
      <Panel title={`${label} per day · click a bar to drill in`}>
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
            const day = String(row.date);
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
        <p className="muted">Bars are per-day counts and can add up to more than the card.</p>
      </Panel>
    </>
  );
};
